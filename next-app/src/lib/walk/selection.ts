// src/lib/walk/selection.ts
// Отбор кандидатов в зону прогулки + скоринг + cap 60 (docs/walk-engine.md §5).
//
// Зона:
//  - петля: радиус от старта R (считает createWalkPlan: v·0.6·B/делитель);
//  - А→Б: коридор вокруг осевой линии start→end шириной W.
// Метрика близости — расстояние в метрах (гаверсинус / до отрезка), а не конус
// по сырым градусам из placeRanking.ts: тот искажён (1° широты ≠ 1° долготы).

import type { WalkLatLng, WalkPlace } from './types';
import { haversineMeters, localProjection, pointToSegmentMeters } from './internal/geo';

export interface SelectionParams {
  start: WalkLatLng;
  end?: WalkLatLng;
  isLoop: boolean;
  /** Радиус петли или ширина коридора, м. */
  zoneMeters: number;
  /** Вес категории с учётом джиттера варианта (0 = категория не нужна). */
  weightOf: (category: string) => number;
  candidates: WalkPlace[];
  maxCount: number;
}

export interface PickedCandidate {
  place: WalkPlace;
  /** Скор отбора: 2·вес + рейтинг/5 − нормированная близость. */
  score: number;
  /** Метров от старта (петля) или от осевой линии (А→Б). */
  proximityMeters: number;
}

export interface SelectionResult {
  /** Отсортированы по score desc; порядок устойчив (детерминизм §13). */
  picked: PickedCandidate[];
  /** Лучший кандидат каждой категории в шорт-листе — факт для reason. */
  bestByCategory: Map<string, WalkPlace>;
  /** Близость каждого выбранного места — факт для reason. */
  proximity: Map<WalkPlace, number>;
}

export function selectCandidates(params: SelectionParams): SelectionResult {
  const { start, end, isLoop, zoneMeters, weightOf, candidates, maxCount } = params;

  const proj = !isLoop && end ? localProjection(midpoint(start, end)) : null;
  const proximityOf = (place: WalkPlace): number => {
    if (isLoop || !end) return haversineMeters(start, place.coordinates);
    return pointToSegmentMeters(place.coordinates, start, end, proj!);
  };

  const scored: PickedCandidate[] = [];
  for (const place of candidates) {
    const weight = weightOf(place.category);
    if (!(weight > 0)) continue; // 0, отрицательный или NaN — категория не нужна
    const proximity = proximityOf(place);
    if (!(proximity <= zoneMeters)) continue;
    const normalized = proximity / Math.max(zoneMeters, 1);
    scored.push({
      place,
      proximityMeters: proximity,
      score: 2 * weight + (place.rating ?? 0) / 5 - normalized,
    });
  }

  // Стабильная сортировка: равные скоры сохраняют порядок входа (детерминизм).
  scored.sort((a, b) => b.score - a.score);
  const picked = scored.slice(0, maxCount);

  const bestByCategory = new Map<string, WalkPlace>();
  const proximity = new Map<WalkPlace, number>();
  for (const item of picked) {
    if (!bestByCategory.has(item.place.category)) {
      bestByCategory.set(item.place.category, item.place);
    }
    proximity.set(item.place, item.proximityMeters);
  }

  return { picked, bestByCategory, proximity };
}

function midpoint(a: WalkLatLng, b: WalkLatLng): WalkLatLng {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}
