// src/services/osm.ts

import { Coordinates, PlaceOfInterest } from "@/types/map";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://z.overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];

export const CATEGORY_CONFIG: Record<string, { tag: string; radiuses: number[] }> = {
  cafe: { tag: '["amenity"="cafe"]', radiuses: [300, 1000, 3000] },
  restaurant: { tag: '["amenity"="restaurant"]', radiuses: [500, 1500, 3000] },
  park: { tag: '["leisure"="park"]', radiuses: [500, 2000, 5000] },
  museum: { tag: '["tourism"="museum"]', radiuses: [800, 2500, 5000] },
};

const ALIASES: Record<string, string> = {
  'кафе': 'cafe',
  'кофейня': 'cafe',
  'ресторан': 'restaurant',
  'парк': 'park',
  'сквер': 'park',
  'музей': 'museum'
};

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
  const internalKey = ALIASES[normalizedInput] || normalizedInput;
  const config = CATEGORY_CONFIG[internalKey];

  if (!config) {
    throw new Error(`Категория "${category}" не поддерживается.`);
  }

  const searchSteps = customRadiusMeters ? [customRadiusMeters] : config.radiuses;
  const allPlaces: PlaceOfInterest[] = [];
  const seenIds = new Set<string>();

  for (const radius of searchSteps) {
    const query = `
      [out:json][timeout:3];
      nw${config.tag}(around:${radius},${lat},${lon});
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

            return {
              id: el.id.toString(),
              name: el.tags.name,
              category: internalKey,
              coordinates: [placeLat, placeLon],
              address: el.tags["addr:street"] && el.tags["addr:housenumber"]
                ? `${el.tags["addr:street"]}, ${el.tags["addr:housenumber"]}`
                : undefined,
            };
          });

        for (const p of places) {
          if (!seenIds.has(p.id)) {
            seenIds.add(p.id);
            allPlaces.push(p);
          }
        }

        if (allPlaces.length >= 5) {
          return allPlaces;
        }
      }
    } catch (error) {
      console.warn(`[OSM] Таймаут для радиуса ${radius}m.`);
    }
  }

  return allPlaces;
}