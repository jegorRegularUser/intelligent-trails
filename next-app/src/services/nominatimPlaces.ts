import { Coordinates, PlaceOfInterest } from '@/types/map';
import { PLACE_CATEGORIES, CATEGORY_ALIASES } from '@/constants/categories';
import { getDistanceInMeters } from '@/utils/geo';

const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'IntelligentTrails/1.0 (route-planner; contact@intelligent-trails.local)';

const STRUCTURED_FILTERS: Record<string, Record<string, string>> = {
  cafe: { amenity: 'cafe' },
  restaurant: { amenity: 'restaurant' },
  park: { leisure: 'park' },
  museum: { tourism: 'museum' },
  attraction: { tourism: 'attraction' },
  bar: { amenity: 'bar' },
  cinema: { amenity: 'cinema' },
  viewpoint: { tourism: 'viewpoint' },
};

/** Только уточняющие запросы — без «сквер», он засоряет парки */
const TEXT_QUERIES: Record<string, string[]> = {
  cafe: ['кафе'],
  restaurant: ['ресторан'],
  park: ['парк'],
  museum: ['музей'],
  attraction: ['достопримечательность'],
  bar: ['бар'],
  cinema: ['кинотеатр'],
  shopping: ['магазин'],
  viewpoint: ['смотровая площадка'],
};

function radiusToViewbox(center: Coordinates, radiusMeters: number): string {
  const [lat, lon] = center;
  const tightRadius = radiusMeters * 0.85;
  const latDelta = tightRadius / 111_320;
  const lonDelta = tightRadius / (111_320 * Math.cos((lat * Math.PI) / 180));
  return `${lon - lonDelta},${lat + latDelta},${lon + lonDelta},${lat - latDelta}`;
}

function buildAddress(tags: Record<string, string> | undefined, displayName?: string): string | undefined {
  if (!tags) return displayName;

  const street = tags['addr:street'] || tags.road || tags.pedestrian;
  const house = tags['addr:housenumber'] || tags.house_number;
  const city = tags['addr:city'] || tags['addr:town'] || tags.city || tags.town;

  if (street && house && city) return `${street}, ${house}, ${city}`;
  if (street && house) return `${street}, ${house}`;
  if (street && city) return `${street}, ${city}`;
  return displayName;
}

function matchesCategory(place: PlaceOfInterest, internalKey: string): boolean {
  const tags = place.tags ?? {};
  const name = place.name.toLowerCase();

  switch (internalKey) {
    case 'park': {
      if (tags.leisure === 'park') return true;
      if (tags.leisure === 'garden' && tags['garden:type'] === 'public') return true;
      if (name.includes('сквер') && !name.includes('парк')) return false;
      return name.includes('парк') || name.includes('park');
    }
    case 'cafe':
      return tags.amenity === 'cafe' || name.includes('кафе') || name.includes('coffee') || name.includes('кофе');
    case 'restaurant':
      return tags.amenity === 'restaurant' || name.includes('ресторан');
    case 'bar':
      return tags.amenity === 'bar' || name.includes('бар');
    case 'museum':
      return tags.tourism === 'museum' || name.includes('музей');
    case 'cinema':
      return tags.amenity === 'cinema' || name.includes('кинотеатр');
    case 'attraction':
      return tags.tourism === 'attraction' || name.includes('памятник');
    case 'viewpoint':
      return tags.tourism === 'viewpoint';
    case 'shopping':
      return Boolean(tags.shop) || name.includes('магазин') || name.includes('торгов');
    default:
      return true;
  }
}

function mapNominatimResult(
  item: Record<string, unknown>,
  category: string
): PlaceOfInterest | null {
  const lat = parseFloat(String(item.lat));
  const lon = parseFloat(String(item.lon));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const namedetails = (item.namedetails as Record<string, string> | undefined) ?? {};
  const name =
    namedetails.name ||
    String(item.name || item.display_name || '').split(',')[0].trim();
  if (!name) return null;

  const extratags = (item.extratags as Record<string, string> | undefined) ?? {};
  const address = (item.address as Record<string, string> | undefined) ?? {};

  let popularity = 0;
  if (extratags.wikipedia || extratags.wikidata) popularity += 30;
  if (extratags.website) popularity += 10;
  if (typeof item.importance === 'number') popularity += Math.min(item.importance * 10, 10);

  const placeId = Number(item.place_id);
  const id = Number.isFinite(placeId)
    ? placeId
    : Math.abs(Math.round(lat * 1e6) ^ Math.round(lon * 1e6));

  const place: PlaceOfInterest = {
    id,
    name,
    category,
    coordinates: [lat, lon],
    address: buildAddress({ ...address, ...extratags }, String(item.display_name || '')),
    popularity: popularity > 0 ? popularity : undefined,
    tags: { ...address, ...extratags },
  };

  return matchesCategory(place, category) ? place : null;
}

async function nominatimRequest(
  params: URLSearchParams,
  category: string
): Promise<PlaceOfInterest[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`${NOMINATIM_ENDPOINT}?${params.toString()}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Nominatim HTTP ${response.status}`);
    }

    const data = (await response.json()) as Record<string, unknown>[];
    return data
      .map((item) => mapNominatimResult(item, category))
      .filter((place): place is PlaceOfInterest => place !== null);
  } finally {
    clearTimeout(timeoutId);
  }
}

function sortByDistance(places: PlaceOfInterest[], center: Coordinates): PlaceOfInterest[] {
  return [...places].sort(
    (a, b) =>
      getDistanceInMeters(center, a.coordinates) - getDistanceInMeters(center, b.coordinates)
  );
}

function filterByDistance(
  places: PlaceOfInterest[],
  center: Coordinates,
  radiusMeters: number
): PlaceOfInterest[] {
  return places.filter(
    (place) => getDistanceInMeters(center, place.coordinates) <= radiusMeters
  );
}

async function searchStructured(
  center: Coordinates,
  internalKey: string,
  radiusMeters: number
): Promise<PlaceOfInterest[]> {
  const filters = STRUCTURED_FILTERS[internalKey];
  if (!filters) return [];

  const params = new URLSearchParams({
    format: 'jsonv2',
    addressdetails: '1',
    extratags: '1',
    namedetails: '1',
    limit: '30',
    viewbox: radiusToViewbox(center, radiusMeters),
    bounded: '1',
    dedupe: '1',
    countrycodes: 'ru',
    'accept-language': 'ru',
  });

  for (const [key, value] of Object.entries(filters)) {
    params.set(key, value);
  }

  const places = await nominatimRequest(params, internalKey);
  return sortByDistance(filterByDistance(places, center, radiusMeters), center);
}

async function searchByText(
  center: Coordinates,
  internalKey: string,
  query: string,
  radiusMeters: number,
  cityHint?: string
): Promise<PlaceOfInterest[]> {
  const [lat, lon] = center;
  const fullQuery = cityHint ? `${query}, ${cityHint}` : query;

  const params = new URLSearchParams({
    format: 'jsonv2',
    q: fullQuery,
    addressdetails: '1',
    extratags: '1',
    namedetails: '1',
    limit: '30',
    viewbox: radiusToViewbox(center, radiusMeters),
    bounded: '1',
    dedupe: '1',
    countrycodes: 'ru',
    lat: String(lat),
    lon: String(lon),
    'accept-language': 'ru',
  });

  const places = await nominatimRequest(params, internalKey);
  return sortByDistance(filterByDistance(places, center, radiusMeters), center);
}

export async function fetchPlacesByCategoryNominatim(
  center: Coordinates,
  category: string,
  radiusMeters: number,
  cityHint = 'Нижний Новгород'
): Promise<PlaceOfInterest[]> {
  const normalizedInput = category.toLowerCase().trim();
  const internalKey = CATEGORY_ALIASES[normalizedInput] || normalizedInput;
  const categoryConfig = PLACE_CATEGORIES[internalKey as keyof typeof PLACE_CATEGORIES];

  if (!categoryConfig) {
    throw new Error(`Категория "${category}" не поддерживается.`);
  }

  const seenIds = new Set<number>();
  const seenNames = new Set<string>();
  const merged: PlaceOfInterest[] = [];

  const add = (places: PlaceOfInterest[]) => {
    for (const place of places) {
      const nameKey = place.name.toLowerCase().trim();
      if (seenIds.has(place.id) || seenNames.has(nameKey)) continue;
      seenIds.add(place.id);
      seenNames.add(nameKey);
      merged.push(place);
    }
  };

  try {
    add(await searchStructured(center, internalKey, radiusMeters));
  } catch (error) {
    console.warn(`[OSM] Nominatim structured ${internalKey}:`, error);
  }

  const textQueries = TEXT_QUERIES[internalKey] || [internalKey];
  for (const query of textQueries) {
    if (merged.length >= 10) break;
    try {
      add(await searchByText(center, internalKey, query, radiusMeters, cityHint));
    } catch (error) {
      console.warn(`[OSM] Nominatim text "${query}":`, error);
    }
  }

  return sortByDistance(merged, center);
}