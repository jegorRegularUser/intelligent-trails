import { Coordinates, PlaceOfInterest } from '@/types/map';
import { PLACE_CATEGORIES, CATEGORY_ALIASES } from '@/constants/categories';
import { fetchPlacesByCategoryNominatim } from '@/services/nominatimPlaces';
import { fetchOverpassQuery } from '@/services/overpassClient';
import { getDistanceInMeters } from '@/utils/geo';

interface CacheEntry {
  data: PlaceOfInterest[];
  timestamp: number;
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const placeCache = new Map<string, CacheEntry>();

function getCacheKey(center: Coordinates, category: string): string {
  const [lat, lon] = center;
  return `${lat.toFixed(3)},${lon.toFixed(3)}_${category}`;
}

function getCachedPlaces(center: Coordinates, category: string): PlaceOfInterest[] | null {
  const key = getCacheKey(center, category);
  const entry = placeCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    placeCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCachedPlaces(center: Coordinates, category: string, data: PlaceOfInterest[]): void {
  const key = getCacheKey(center, category);
  placeCache.set(key, { data, timestamp: Date.now() });
  if (placeCache.size > 100) {
    const oldestKey = placeCache.keys().next().value;
    if (oldestKey) placeCache.delete(oldestKey);
  }
}

function mergePlaces(
  target: PlaceOfInterest[],
  incoming: PlaceOfInterest[],
  seenIds: Set<number>,
  seenNames: Set<string>
): void {
  for (const place of incoming) {
    const nameKey = place.name.toLowerCase().trim();
    if (seenIds.has(place.id) || seenNames.has(nameKey)) continue;
    seenIds.add(place.id);
    seenNames.add(nameKey);
    target.push(place);
  }
}

function sortByDistance(places: PlaceOfInterest[], center: Coordinates): PlaceOfInterest[] {
  return [...places].sort(
    (a, b) =>
      getDistanceInMeters(center, a.coordinates) - getDistanceInMeters(center, b.coordinates)
  );
}

function estimateParkSize(el: Record<string, unknown>, tags: Record<string, string>): number {
  if (tags.area) return parseFloat(tags.area);
  if (tags['area:ha']) return parseFloat(tags['area:ha']) * 10000;
  if (el.type === 'relation') return 100000;
  if (el.type === 'way') return 50000;
  return 5000;
}

function mapOverpassElements(
  elements: unknown[],
  internalKey: string,
  center: Coordinates,
  radiusMeters: number
): PlaceOfInterest[] {
  return (elements as Array<Record<string, unknown>>)
    .filter((el) => el.tags && (el.tags as Record<string, string>).name)
    .map((el): PlaceOfInterest | null => {
      const tags = el.tags as Record<string, string>;
      const elCenter = el.center as { lat?: number; lon?: number } | undefined;
      const placeLat = elCenter?.lat ?? (el.lat as number);
      const placeLon = elCenter?.lon ?? (el.lon as number);

      if (getDistanceInMeters(center, [placeLat, placeLon]) > radiusMeters) {
        return null;
      }

      if (internalKey === 'park') {
        const leisure = tags.leisure;
        const nameLower = tags.name.toLowerCase();
        const isPark =
          leisure === 'park' ||
          (leisure === 'garden' && tags['garden:type'] === 'public');
        const looksLikeSquare = nameLower.includes('сквер') && !nameLower.includes('парк');
        if (!isPark || looksLikeSquare) return null;
      }

      const rating = parseFloat(tags.rating || tags.stars || '0');

      let size = 0;
      if (internalKey === 'park') {
        size = estimateParkSize(el, tags);
      } else if (tags.area) {
        size = parseFloat(tags.area);
      } else if (tags.capacity) {
        size = parseFloat(tags.capacity);
      }

      let popularity = 0;
      if (tags.wikipedia || tags.wikidata) popularity += 30;
      if (tags.website) popularity += 10;
      if (tags.phone) popularity += 5;
      if (tags.opening_hours) popularity += 5;
      if (tags.cuisine) popularity += 5;
      if (tags.tourism === 'attraction') popularity += 20;

      return {
        id: Number(el.id),
        name: tags.name,
        category: internalKey,
        coordinates: [placeLat, placeLon],
        address:
          tags['addr:street'] && tags['addr:housenumber']
            ? `${tags['addr:street']}, ${tags['addr:housenumber']}`
            : undefined,
        rating: rating > 0 ? rating : undefined,
        size: size > 0 ? size : undefined,
        popularity: popularity > 0 ? popularity : undefined,
        tags,
      };
    })
    .filter((place): place is PlaceOfInterest => place !== null);
}

function buildOverpassQuery(
  center: Coordinates,
  osmTag: string,
  internalKey: string,
  radius: number
): string {
  const [lat, lon] = center;

  if (internalKey === 'park') {
    return `
      [out:json][timeout:12];
      (
        nwr["leisure"="park"](around:${radius},${lat},${lon});
        nwr["leisure"="garden"]["garden:type"="public"](around:${radius},${lat},${lon});
      );
      out center;
    `;
  }

  return `
    [out:json][timeout:12];
    nwr${osmTag}(around:${radius},${lat},${lon});
    out center;
  `;
}

async function fetchPlacesFromOverpass(
  center: Coordinates,
  internalKey: string,
  osmTag: string,
  radiuses: readonly number[]
): Promise<PlaceOfInterest[]> {
  const allPlaces: PlaceOfInterest[] = [];
  const seenIds = new Set<number>();
  const seenNames = new Set<string>();

  for (const radius of radiuses) {
    const query = buildOverpassQuery(center, osmTag, internalKey, radius);

    try {
      const { elements, mirror } = await fetchOverpassQuery(query, 9000);
      const places = sortByDistance(
        mapOverpassElements(elements, internalKey, center, radius),
        center
      );
      mergePlaces(allPlaces, places, seenIds, seenNames);
      console.log(`[OSM] Overpass ${internalKey} @${radius}m via ${mirror} → ${places.length} (total ${allPlaces.length})`);
      const minResults = internalKey === 'park' ? 12 : 8;
      if (allPlaces.length >= minResults) break;
    } catch (error) {
      console.warn(`[OSM] Overpass радиус ${radius}m:`, error);
      break;
    }
  }

  return allPlaces;
}

function midpoint(a: Coordinates, b: Coordinates): Coordinates {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

function corridorSearchPoints(from: Coordinates, to?: Coordinates): Coordinates[] {
  if (!to) return [from];
  return [from, midpoint(from, to), to];
}

async function collectPlacesForCenter(
  center: Coordinates,
  internalKey: string,
  osmTag: string,
  searchSteps: readonly number[],
  allPlaces: PlaceOfInterest[],
  seenIds: Set<number>,
  seenNames: Set<string>
): Promise<void> {
  const overpassPlaces = await fetchPlacesFromOverpass(center, internalKey, osmTag, searchSteps);
  mergePlaces(allPlaces, overpassPlaces, seenIds, seenNames);

  if (allPlaces.length < 5) {
    for (const radius of searchSteps) {
      try {
        const nominatimPlaces = await fetchPlacesByCategoryNominatim(center, internalKey, radius);
        mergePlaces(allPlaces, nominatimPlaces, seenIds, seenNames);
        console.log(
          `[OSM] Nominatim fallback ${internalKey} @${radius}m → ${nominatimPlaces.length} (total ${allPlaces.length})`
        );
        if (allPlaces.length >= 8) break;
      } catch (error) {
        console.warn(`[OSM] Nominatim радиус ${radius}m:`, error);
      }
    }
  }
}

export async function fetchPlacesByCategory(
  center: Coordinates,
  category: string,
  customRadiusMeters?: number,
  corridorEnd?: Coordinates
): Promise<PlaceOfInterest[]> {
  const normalizedInput = category.toLowerCase().trim();
  const internalKey = CATEGORY_ALIASES[normalizedInput] || normalizedInput;
  const categoryConfig = PLACE_CATEGORIES[internalKey as keyof typeof PLACE_CATEGORIES];

  if (!categoryConfig) {
    throw new Error(`Категория "${category}" не поддерживается.`);
  }

  const cached = getCachedPlaces(center, internalKey);
  if (cached && cached.length > 0) {
    console.log(`[OSM Cache] Hit for ${internalKey}`);
    return cached;
  }

  const searchSteps = customRadiusMeters
    ? [customRadiusMeters]
    : [...categoryConfig.radiuses];

  const allPlaces: PlaceOfInterest[] = [];
  const seenIds = new Set<number>();
  const seenNames = new Set<string>();

  for (const searchCenter of corridorSearchPoints(center, corridorEnd)) {
    await collectPlacesForCenter(
      searchCenter,
      internalKey,
      categoryConfig.osmTag,
      searchSteps,
      allPlaces,
      seenIds,
      seenNames
    );
    if (allPlaces.length >= 12) break;
  }

  const sorted = sortByDistance(allPlaces, center);

  if (sorted.length > 0) {
    setCachedPlaces(center, internalKey, sorted);
  }

  return sorted;
}