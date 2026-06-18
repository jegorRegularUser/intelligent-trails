import { describe, it, expect, beforeEach } from 'vitest';
import { fetchPlacesByCategory } from '@/services/osm';
import { rankPlaces } from '@/utils/placeRanking';
import { getDistanceInMeters } from '@/utils/geo';
import { resetPreferredOverpassMirror } from '@/services/overpassClient';
import { Coordinates } from '@/types/map';

/** Агрономическая 132/35, Нижний Новгород */
const START: Coordinates = [56.26287, 43.93652];
/** Проспект Гагарина 10, Нижний Новгород */
const END: Coordinates = [56.31028, 44.00382];

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/ё/g, 'е');
}

function hasPark(names: string[], ...needles: string[]): boolean {
  const normalized = names.map(normalizeName);
  return needles.some((needle) =>
    normalized.some((name) => name.includes(needle))
  );
}

describe('OSM NN: Агрономическая → Гагарина', () => {
  beforeEach(() => {
    resetPreferredOverpassMirror();
  });

  it('находит парк Пушкина или Кулибина по пути к финишу', async () => {
    const raw = await fetchPlacesByCategory(START, 'park', undefined, END);
    console.log('Parks raw:', raw.map((p) => p.name));
    const places = rankPlaces(raw, {
      currentPosition: START,
      destinationPosition: END,
      maxResults: 5,
      diversityRadius: 300,
      nearbyThreshold: 3500,
    });

    console.log('Parks ranked:', places.map((p) => p.name));

    expect(places.length).toBeGreaterThan(0);
    expect(
      hasPark(
        places.map((p) => p.name),
        'пушкин',
        'кулибин'
      )
    ).toBe(true);
  }, 120000);

  it('находит кафе рядом со стартом (не за 10 км)', async () => {
    const places = await fetchPlacesByCategory(START, 'cafe');

    console.log(
      'Cafes near start:',
      places.slice(0, 8).map((p) => `${p.name} (${Math.round(
        Math.hypot(
          (p.coordinates[0] - START[0]) * 111320,
          (p.coordinates[1] - START[1]) * 111320 * Math.cos((START[0] * Math.PI) / 180)
        )
      )}m)`)
    );

    expect(places.length).toBeGreaterThan(0);

    const nearest = places[0];
    expect(getDistanceInMeters(START, nearest.coordinates)).toBeLessThan(2500);
  }, 120000);
});