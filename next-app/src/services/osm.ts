// src/services/osm.ts

import { Coordinates, PlaceOfInterest } from "@/types/map";
import { PLACE_CATEGORIES, CATEGORY_ALIASES } from "@/constants/categories";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://z.overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];

// In-memory cache with TTL
interface CacheEntry {
  data: PlaceOfInterest[];
  timestamp: number;
}

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const placeCache = new Map<string, CacheEntry>();

function getCacheKey(center: Coordinates, category: string, radius: number): string {
  const [lat, lon] = center;
  return `${lat.toFixed(3)},${lon.toFixed(3)}_${category}_${radius}`;
}

function getCachedPlaces(center: Coordinates, category: string, radius: number): PlaceOfInterest[] | null {
  const key = getCacheKey(center, category, radius);
  const entry = placeCache.get(key);

  if (!entry) return null;

  const age = Date.now() - entry.timestamp;
  if (age > CACHE_TTL_MS) {
    placeCache.delete(key);
    return null;
  }

  return entry.data;
}

function setCachedPlaces(center: Coordinates, category: string, radius: number, data: PlaceOfInterest[]): void {
  const key = getCacheKey(center, category, radius);
  placeCache.set(key, { data, timestamp: Date.now() });

  // Cleanup old entries (simple LRU)
  if (placeCache.size > 100) {
    const oldestKey = placeCache.keys().next().value;
    if (oldestKey) {
      placeCache.delete(oldestKey);
    }
  }
}

async function fetchOverpassMirror(endpoint: string, query: string, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "IntelligentTrailsApp/1.0",
        "Accept": "application/json"
      },
      body: `data=${encodeURIComponent(query)}`,
      cache: "no-store",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchPlacesByCategory(
  center: Coordinates,
  category: string,
  customRadiusMeters?: number
): Promise<PlaceOfInterest[]> {
  const [lat, lon] = center;

  const normalizedInput = category.toLowerCase().trim();
  const internalKey = CATEGORY_ALIASES[normalizedInput] || normalizedInput;
  const categoryConfig = PLACE_CATEGORIES[internalKey as keyof typeof PLACE_CATEGORIES];

  if (!categoryConfig) {
    throw new Error(`Категория "${category}" не поддерживается.`);
  }

  const searchSteps = customRadiusMeters ? [customRadiusMeters] : categoryConfig.radiuses;
  const allPlaces: PlaceOfInterest[] = [];
  const seenIds = new Set<string>();

  for (const radius of searchSteps) {
    // Check cache first
    const cached = getCachedPlaces(center, internalKey, radius);
    if (cached && cached.length > 0) {
      console.log(`[OSM Cache] Hit for ${internalKey} at radius ${radius}m`);
      return cached;
    }

    const query = `
      [out:json][timeout:3];
      nw${categoryConfig.osmTag}(around:${radius},${lat},${lon});
      out center;
    `;

    try {
      const data = await Promise.any(
        OVERPASS_ENDPOINTS.map(endpoint => fetchOverpassMirror(endpoint, query, 4000))
      );

      const elements = data.elements || [];

      if (elements.length > 0) {
        const places = elements
          .filter((el: any) => el.tags && el.tags.name)
          .map((el: any): PlaceOfInterest => {
            const placeLat = el.center?.lat ?? el.lat;
            const placeLon = el.center?.lon ?? el.lon;

            // Извлекаем метаданные для ранжирования
            const tags = el.tags;

            // Рейтинг из различных источников
            const rating = parseFloat(tags.rating || tags['stars'] || '0');

            // Размер объекта
            let size = 0;
            if (tags.area) {
              size = parseFloat(tags.area);
            } else if (tags.capacity) {
              size = parseFloat(tags.capacity);
            } else if (el.tags && el.type === 'way') {
              // Для парков можем оценить размер по типу
              if (internalKey === 'park') {
                size = 10000; // Средний парк
              }
            }

            // Популярность (косвенные признаки)
            let popularity = 0;
            if (tags.wikipedia || tags.wikidata) popularity += 30;
            if (tags.website) popularity += 10;
            if (tags.phone) popularity += 5;
            if (tags.opening_hours) popularity += 5;
            if (tags.cuisine) popularity += 5; // Для ресторанов
            if (tags.tourism === 'attraction') popularity += 20;

            return {
              id: el.id.toString(),
              name: el.tags.name,
              category: internalKey,
              coordinates: [placeLat, placeLon],
              address: el.tags["addr:street"] && el.tags["addr:housenumber"]
                ? `${el.tags["addr:street"]}, ${el.tags["addr:housenumber"]}`
                : undefined,
              rating: rating > 0 ? rating : undefined,
              size: size > 0 ? size : undefined,
              popularity: popularity > 0 ? popularity : undefined,
              tags,
            };
          });

        for (const p of places) {
          if (!seenIds.has(p.id)) {
            seenIds.add(p.id);
            allPlaces.push(p);
          }
        }

        if (allPlaces.length >= 5) {
          // Cache successful result
          setCachedPlaces(center, internalKey, radius, allPlaces);
          return allPlaces;
        }
      }
    } catch (error) {
      console.warn(`[OSM] Таймаут для радиуса ${radius}m.`);
    }
  }

  // Cache even partial results
  if (allPlaces.length > 0) {
    setCachedPlaces(center, internalKey, searchSteps[searchSteps.length - 1], allPlaces);
  }

  return allPlaces;
}