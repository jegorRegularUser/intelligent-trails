// src/lib/vibes/streetInterest.ts
// Интерес-модель «Улицы с характером» (docs/street-interest-wave.md S2):
// scoreSectors(features, start, archetype) → StreetHints. 8 азимутальных
// секторов вокруг старта; interest ∈ [0..1] — нормированная сумма вкладов
// фич сектора (максимум по розе = 1); attractionPoint — ближайшая к старту
// точка КОНТУРА лучшей фичи сектора. Конвенция секторов — pinned
// (src/lib/walk/__tests__/sectorConvention.test.ts): азимут от севера по
// часовой через azimuthRad, сектор = floor(азимут/45°).

import type { Archetype, ArchetypeId } from './archetypes';
import type { LatLng, StreetFeature } from '@/lib/geo/types';
import { SECTOR_COUNT, STREET_FEATURE_KIND_WEIGHTS } from '@/lib/walk/types';
import {
  azimuthRad,
  closestPointOnPolyline,
  haversineMeters,
  sectorOfAzimuth,
} from '@/lib/walk/internal/geo';

export interface StreetSectorHint {
  /** Середина сектора в градусах: 22.5, 67.5, … (сектор i = [i·45°, (i+1)·45°)). */
  azimuthDeg: number;
  /** 0..1 — вклад сектора, нормированный на максимум по розе. */
  interest: number;
  /** Ближайшая к старту точка контура лучшей фичи сектора; фич нет — null. */
  point: LatLng | null;
}

export interface StreetHints {
  /** Длина SECTOR_COUNT, индекс = сектор розы (не азимут точки). */
  sectors: StreetSectorHint[];
  hasData: boolean;
}

/** Шкала мягкой близости (S2: «дальние меньше»): 1 км → ×0.5, 3 км → ×0.25. */
const PROXIMITY_SCALE_M = 1000;
/** Лог-шкала размера полигона: +1.0 множителя за порядок площади выше 1000 м². */
const AREA_LOG_SCALE_M2 = 1000;

/**
 * Вклад фичи: база по kind (STREET_FEATURE_KIND_WEIGHTS — единая с тайбрейкером
 * S5) × архетипный множитель × близость (мягкая, дальние меньше) × размер
 * полигона (лог-шкала площади; точки/линии — нейтральные ×1).
 */
function featureWeight(
  feature: StreetFeature,
  start: LatLng,
  streetInterest: Archetype['streetInterest'],
): number {
  const base = STREET_FEATURE_KIND_WEIGHTS[feature.kind];
  const archetypeMultiplier = streetInterest?.[feature.kind] ?? 1;
  const proximity = 1 / (1 + nearestVertexDistanceMeters(start, feature) / PROXIMITY_SCALE_M);
  const size =
    feature.areaMeters > 0 ? 1 + Math.log10(1 + feature.areaMeters / AREA_LOG_SCALE_M2) : 1;
  return base * archetypeMultiplier * proximity * size;
}

/** Дистанция до ближайшей вершины — для мягкой близости; точная проекция контура нужна только attractionPoint. */
function nearestVertexDistanceMeters(start: LatLng, feature: StreetFeature): number {
  let min = Number.POSITIVE_INFINITY;
  for (const vertex of feature.geometry) {
    const d = haversineMeters(start, vertex);
    if (d < min) min = d;
  }
  return min;
}

/**
 * Интерес-подсказки по секторам розы (S2). Присвоение фичи сектору — по
 * вершинам: большой парк накрывает 3 сектора, вклад делится поровну между
 * вершинами (каждая — в свой сектор); это же даёт честную attractionPoint.
 * interest(s) = Σвкладов(s) / max(Σвкладов) — максимум розы всегда 1,
 * остальное относительно него. Детерминизм: ties — первая фича по порядку
 * входа. Пустой сет или фичи без геометрии → hasData: false.
 */
export function scoreSectors(
  features: StreetFeature[],
  start: LatLng,
  archetype: Pick<Archetype, 'streetInterest'>,
): StreetHints {
  const sectors: StreetSectorHint[] = Array.from({ length: SECTOR_COUNT }, (_, i) => ({
    azimuthDeg: ((i + 0.5) * 360) / SECTOR_COUNT,
    interest: 0,
    point: null,
  }));
  if (features.length === 0) return { sectors, hasData: false };

  const totals = new Array<number>(SECTOR_COUNT).fill(0);
  const sectorSumByFeature: number[][] = features.map(() => new Array<number>(SECTOR_COUNT).fill(0));

  for (let fi = 0; fi < features.length; fi++) {
    const feature = features[fi];
    const weight = featureWeight(feature, start, archetype.streetInterest);
    if (!(weight > 0)) continue;
    const vertexCount = feature.geometry.length;
    if (vertexCount === 0) continue;
    for (const vertex of feature.geometry) {
      const sector = sectorOfAzimuth(azimuthRad(start, vertex), SECTOR_COUNT);
      const share = weight / vertexCount;
      totals[sector] += share;
      sectorSumByFeature[fi][sector] += share;
    }
  }

  const maxTotal = Math.max(...totals);
  if (!(maxTotal > 0)) return { sectors, hasData: false };

  for (let sector = 0; sector < SECTOR_COUNT; sector++) {
    if (!(totals[sector] > 0)) continue;
    sectors[sector].interest = totals[sector] / maxTotal;
    let best = -1;
    let bestSum = 0;
    for (let fi = 0; fi < features.length; fi++) {
      if (sectorSumByFeature[fi][sector] > bestSum + 1e-12) {
        bestSum = sectorSumByFeature[fi][sector];
        best = fi;
      }
    }
    if (best >= 0) {
      sectors[sector].point = closestPointOnPolyline(start, features[best].geometry).point;
    }
  }

  return { sectors, hasData: true };
}

// --- Заметка «почему петля идёт тут» (rev 2026-11-18 «улица первична») ------

/**
 * Архетипная формулировка снапа (docs/vibes.md §3.7, walk-engine.md §19.7):
 * множители streetInterest определили, куда роза притянулась, — заметка
 * честно описывает это в карточке. Ставится только при снапе ≥ 2 секторов;
 * общая формулировка — дефолт.
 */
const STREET_LOOP_NOTES: Record<ArchetypeId, { ru: string; en: string }> = {
  green: {
    ru: 'Петля идёт через зелёные кварталы и набережные — так её повернули парки и вода района',
    en: 'The loop runs through green blocks and embankments — the parks and water pulled it there',
  },
  coffee: {
    ru: 'Петля ведёт через пешеходные улочки и живые кварталы — так её повернул характер района',
    en: 'The loop follows pedestrian streets and lively blocks — the neighborhood pulled it there',
  },
  evening: {
    ru: 'Петля идёт по оживлённым пешеходным улицам — так её повернул вечерний центр',
    en: 'The loop runs along lively pedestrian streets — the evening downtown pulled it there',
  },
  rainy: {
    ru: 'Петля по характерным улицам района',
    en: "A loop through the neighborhood's character streets",
  },
  surprise: {
    ru: 'Петля по характерным улицам района',
    en: "A loop through the neighborhood's character streets",
  },
  sightseeing: {
    ru: 'Петля ведёт к видовым точкам и пешеходным улицам — так её повернул характер района',
    en: 'The loop heads for viewpoints and pedestrian streets — the area pulled it there',
  },
};

/** Заметка «почему петля идёт тут» по архетипу сборки (§19.7). */
export function streetLoopNote(archetypeId: ArchetypeId): { ru: string; en: string } {
  return STREET_LOOP_NOTES[archetypeId];
}
