// src/lib/vibes/archetypes.ts
// Архетипы-профили «формулы прогулки» (docs/PRODUCT.md, «Сценарии-архетипы»).
// Все числа продублированы в docs/vibes.md §3 — код и документ меняются вместе.

import type { CategoryId } from '@/constants/categories';
import type { GeoPlace } from '@/lib/geo/types';

export type ArchetypeId = 'green' | 'coffee' | 'evening' | 'rainy' | 'surprise';

/** Архетип — профиль прогулки: веса категорий + предпочтения + тайминги. */
export interface Archetype {
  id: ArchetypeId;
  labelRu: string;
  labelEn: string;
  /** Принадлежность категории архетипу, 0..1. 0 — категория не участвует вовсе. */
  categoryWeights: Record<CategoryId, number>;
  /** Желание крытого, 0..1 (0 — только улица, 1 — только помещения). */
  indoorBias: number;
  /** Важность тени/зелени, 0..1. */
  shadePriority: number;
  /** Сколько минут сидеть на остановке этой категории. */
  stayMinutes: Record<CategoryId, number>;
  /** Насколько архетип «светится» в данный час (0..23), 0..1. Кусочно-линейная. */
  hourAffinity: (hour: number) => number;
  descriptionRu: string;
  descriptionEn: string;
}

/** Опорная точка профиля времени суток: [час, значение 0..1]. */
type AffinityPoint = readonly [hour: number, value: number];

/**
 * Кусочно-линейная интерполяция опорных точек. Точки должны начинаться с часа 0
 * и заканчиваться часом 24 (значение 24 = значение 0 — стык суток). Дробные
 * часы поддержаны интерполяцией; вне диапазона — кламп.
 */
function piecewiseAffinity(points: readonly AffinityPoint[]): (hour: number) => number {
  return (hour: number): number => {
    const h = Math.min(Math.max(hour, points[0][0]), points[points.length - 1][0]);
    for (let i = 1; i < points.length; i++) {
      const [h1, v1] = points[i - 1];
      const [h2, v2] = points[i];
      if (h <= h2) {
        const t = h2 === h1 ? 0 : (h - h1) / (h2 - h1);
        return v1 + (v2 - v1) * t;
      }
    }
    return points[points.length - 1][1];
  };
}

// --- hourAffinity-профили (docs/vibes.md §3.6) -------------------------------

const GREEN_AFFINITY: readonly AffinityPoint[] = [
  [0, 0.25], [6, 0.35], [8, 0.85], [11, 1.0], [17, 1.0], [19, 0.8], [21, 0.45], [24, 0.25],
];
const COFFEE_AFFINITY: readonly AffinityPoint[] = [
  [0, 0.1], [6, 0.25], [7, 0.6], [8, 0.85], [10, 1.0], [16, 1.0], [18, 0.8], [20, 0.5], [22, 0.2], [24, 0.1],
];
const EVENING_AFFINITY: readonly AffinityPoint[] = [
  [0, 0.3], [6, 0.05], [12, 0.1], [16, 0.4], [18, 0.7], [19, 0.9], [20, 1.0], [23, 0.9], [24, 0.3],
];
const RAINY_AFFINITY: readonly AffinityPoint[] = [
  [0, 0.35], [9, 0.9], [10, 1.0], [18, 1.0], [19, 0.75], [21, 0.6], [23, 0.4], [24, 0.35],
];
const SURPRISE_AFFINITY: readonly AffinityPoint[] = [
  [0, 0.5], [7, 0.6], [10, 0.9], [12, 1.0], [21, 0.9], [23, 0.7], [24, 0.5],
];

// --- 9 категорий (конвенция categories.ts) -----------------------------------

const CATEGORIES: readonly CategoryId[] = [
  'cafe', 'restaurant', 'park', 'museum', 'attraction', 'bar', 'cinema', 'shopping', 'viewpoint',
];

/** Собирает Record по всем 9 категориям и не даёт забыть ни одну (ошибка рантайма при пропуске). */
function record9(spec: Partial<Record<CategoryId, number>>): Record<CategoryId, number> {
  const out = {} as Record<CategoryId, number>;
  for (const c of CATEGORIES) {
    const v = spec[c];
    if (v === undefined) throw new Error(`категория ${c} не задана`);
    out[c] = v;
  }
  return out;
}

/** Дефолт indoor/outdoor по категории, когда GeoPlace.indoor не задан (docs/vibes.md §4). */
export const DEFAULT_INDOOR: Record<CategoryId, boolean> = {
  cafe: true,
  restaurant: true,
  park: false,
  museum: true,
  attraction: false,
  bar: true,
  cinema: true,
  shopping: true,
  viewpoint: false,
};

/** Крытые категории — цель rain-indoor в combineContext. */
export const INDOOR_CATEGORIES: readonly CategoryId[] = ['museum', 'cinema', 'shopping'];
/** Сущностно уличные категории — под дождём режутся. */
export const OUTDOOR_CATEGORIES: readonly CategoryId[] = ['park', 'viewpoint'];

/** indoor/outdoor места: явное поле источника, иначе дефолт по категории. */
export function inferIndoor(place: Pick<GeoPlace, 'indoor' | 'category'>): boolean {
  if (place.indoor !== undefined) return place.indoor;
  const key = (place.category as CategoryId) in DEFAULT_INDOOR
    ? (place.category as CategoryId)
    : null;
  return key ? DEFAULT_INDOOR[key] : false;
}

// --- 5 архетипов (docs/vibes.md §3.1–3.5) ------------------------------------

export const GREEN: Archetype = {
  id: 'green',
  labelRu: 'Зелёная',
  labelEn: 'Green',
  descriptionRu: 'Парки, скверы и набережные: тень и зелень важнее скорости.',
  descriptionEn: 'Parks, squares and embankments: shade and greenery over speed.',
  categoryWeights: record9({
    cafe: 0.4, restaurant: 0.3, park: 1.0, museum: 0.2, attraction: 0.5,
    bar: 0.2, cinema: 0.1, shopping: 0.1, viewpoint: 0.7,
  }),
  indoorBias: 0.05,
  shadePriority: 0.9,
  stayMinutes: record9({
    cafe: 20, restaurant: 30, park: 30, museum: 25, attraction: 15,
    bar: 25, cinema: 120, shopping: 20, viewpoint: 15,
  }),
  hourAffinity: piecewiseAffinity(GREEN_AFFINITY),
};

export const COFFEE: Archetype = {
  id: 'coffee',
  labelRu: 'Кофейная',
  labelEn: 'Coffee',
  descriptionRu: 'Кафе, кондитерские и уютные улочки: одна-две сидячие остановки.',
  descriptionEn: 'Cafés, bakeries and cozy streets: one or two sit-down stops.',
  categoryWeights: record9({
    cafe: 1.0, restaurant: 0.7, park: 0.4, museum: 0.2, attraction: 0.4,
    bar: 0.3, cinema: 0.1, shopping: 0.5, viewpoint: 0.3,
  }),
  indoorBias: 0.6,
  shadePriority: 0.3,
  stayMinutes: record9({
    cafe: 30, restaurant: 35, park: 15, museum: 25, attraction: 15,
    bar: 30, cinema: 120, shopping: 15, viewpoint: 10,
  }),
  hourAffinity: piecewiseAffinity(COFFEE_AFFINITY),
};

export const EVENING: Archetype = {
  id: 'evening',
  labelRu: 'Вечерняя',
  labelEn: 'Evening',
  descriptionRu: 'Освещённые улицы и живые места: после 19:00 и только то, что работает сейчас.',
  descriptionEn: 'Lit streets and lively spots: after 7 pm, only what is open now.',
  categoryWeights: record9({
    cafe: 0.5, restaurant: 0.8, park: 0.2, museum: 0.15, attraction: 0.6,
    bar: 1.0, cinema: 0.6, shopping: 0.1, viewpoint: 0.5,
  }),
  indoorBias: 0.5,
  shadePriority: 0.1,
  stayMinutes: record9({
    cafe: 25, restaurant: 45, park: 10, museum: 25, attraction: 15,
    bar: 40, cinema: 120, shopping: 10, viewpoint: 15,
  }),
  hourAffinity: piecewiseAffinity(EVENING_AFFINITY),
};

export const RAINY: Archetype = {
  id: 'rainy',
  labelRu: 'Дождливая',
  labelEn: 'Rainy',
  descriptionRu: 'Музеи, галереи, ТЦ и крытые рынки: минимум улицы.',
  descriptionEn: 'Museums, galleries, malls and covered markets: minimal street time.',
  categoryWeights: record9({
    cafe: 0.8, restaurant: 0.7, park: 0.05, museum: 1.0, attraction: 0.3,
    bar: 0.5, cinema: 0.9, shopping: 0.9, viewpoint: 0.05,
  }),
  indoorBias: 0.95,
  shadePriority: 0.2,
  stayMinutes: record9({
    cafe: 30, restaurant: 35, park: 5, museum: 60, attraction: 20,
    bar: 30, cinema: 120, shopping: 40, viewpoint: 5,
  }),
  hourAffinity: piecewiseAffinity(RAINY_AFFINITY),
};

export const SURPRISE: Archetype = {
  id: 'surprise',
  labelRu: 'Удиви меня',
  labelEn: 'Surprise me',
  descriptionRu: 'Микс без явного ядра: максимум разнообразия якорей.',
  descriptionEn: 'A mix with no core: maximum variety of stops.',
  categoryWeights: record9({
    cafe: 0.55, restaurant: 0.5, park: 0.55, museum: 0.5, attraction: 0.6,
    bar: 0.45, cinema: 0.45, shopping: 0.45, viewpoint: 0.6,
  }),
  indoorBias: 0.45,
  shadePriority: 0.5,
  stayMinutes: record9({
    cafe: 25, restaurant: 30, park: 20, museum: 40, attraction: 15,
    bar: 30, cinema: 120, shopping: 20, viewpoint: 10,
  }),
  hourAffinity: piecewiseAffinity(SURPRISE_AFFINITY),
};

/** Реестр архетипов в порядке UI («зелёная / кофейная / вечерняя / дождь / удиви меня»). */
export const ARCHETYPES: readonly Archetype[] = [GREEN, COFFEE, EVENING, RAINY, SURPRISE];

export function getArchetype(id: ArchetypeId): Archetype {
  const found = ARCHETYPES.find((a) => a.id === id);
  if (!found) throw new Error(`Неизвестный архетип: ${id}`);
  return found;
}
