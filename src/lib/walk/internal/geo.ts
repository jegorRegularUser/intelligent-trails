// src/lib/walk/internal/geo.ts
// Локальная геометрия городского масштаба: гаверсинус + равнопромежуточная
// проекция вокруг центра зоны. На дистанциях до ~10 км ошибка проекции << 1%.
// Никаких конусов по сырым градусам (ошибка placeRanking.ts): зона — это
// расстояние до осевой линии/центра в метрах.

import type { WalkLatLng } from '../types';

const EARTH_RADIUS_M = 6371008.8;

export function haversineMeters(a: WalkLatLng, b: WalkLatLng): number {
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLng = (b[1] - a[1]) * rad;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface LocalProjection {
  /** [lat, lng] → метры {x — восток, y — север} относительно центра. */
  toMeters(p: WalkLatLng): { x: number; y: number };
}

/** Длина полилинии по прямой между последовательными точками, м. */
export function polylineLengthMeters(points: WalkLatLng[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineMeters(points[i - 1], points[i]);
  }
  return total;
}

export function localProjection(center: WalkLatLng): LocalProjection {
  const rad = Math.PI / 180;
  const kx = EARTH_RADIUS_M * rad * Math.cos(center[0] * rad);
  const ky = EARTH_RADIUS_M * rad;
  return {
    toMeters: (p: WalkLatLng) => ({ x: (p[1] - center[1]) * kx, y: (p[0] - center[0]) * ky }),
  };
}

/**
 * Радиус зоны в метрах из бюджета времени — консолидация формулы (R6),
 * арифметика прежняя: доля бюджета на ходьбу × скорость / делитель.
 * Делитель движка мотивирован «кольцом через якорь на противоположной
 * стороне» (docs/walk-engine.md §5); пайплайн быстрого прогона зовёт её же
 * с долей 0.4 под радиус поиска POI (quickPipeline.searchRadiusMeters).
 */
export function zoneMetersForBudget(
  budgetMinutes: number,
  speedKmh: number,
  walkShare: number,
  divisor: number,
): number {
  const mPerMin = (speedKmh * 1000) / 60;
  return (mPerMin * walkShare * budgetMinutes) / divisor;
}

function pointToSegmentMetersXY(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const lenSq = abx * abx + aby * aby;
  if (lenSq === 0) return Math.hypot(apx, apy);
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / lenSq));
  return Math.hypot(apx - t * abx, apy - t * aby);
}

/** Расстояние от точки до отрезка a→b в метрах (проекция вокруг центра отрезка). */
export function pointToSegmentMeters(
  p: WalkLatLng,
  a: WalkLatLng,
  b: WalkLatLng,
  proj: LocalProjection,
): number {
  return pointToSegmentMetersXY(proj.toMeters(p), proj.toMeters(a), proj.toMeters(b));
}

/**
 * Равномерная прореживание полилинии по длине до maxPoints точек.
 * Нужно гейту «та же улица»: полилинии роутинга идут плотно в поворотах,
 * выборка по индексу вытянула бы длинные прямые участки.
 */
export function resamplePolyline(points: WalkLatLng[], maxPoints: number): WalkLatLng[] {
  if (points.length <= maxPoints) return points.slice();
  const proj = localProjection(points[0]);
  const xy = points.map((p) => proj.toMeters(p));
  const cum: number[] = [0];
  for (let i = 1; i < xy.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(xy[i].x - xy[i - 1].x, xy[i].y - xy[i - 1].y));
  }
  const total = cum[cum.length - 1];
  if (total === 0) return [points[0]];

  const out: WalkLatLng[] = [];
  let seg = 0;
  for (let k = 0; k < maxPoints; k++) {
    const target = (total * k) / (maxPoints - 1);
    while (seg < cum.length - 2 && cum[seg + 1] < target) seg++;
    const t0 = cum[seg];
    const t1 = cum[seg + 1];
    const f = t1 > t0 ? (target - t0) / (t1 - t0) : 0;
    out.push([
      points[seg][0] + (points[seg + 1][0] - points[seg][0]) * f,
      points[seg][1] + (points[seg + 1][1] - points[seg][1]) * f,
    ]);
  }
  return out;
}

/**
 * Доля точек `points`, лежащих в коридоре corridorMeters от полилинии.
 * Гейт «петля не возвращается по той же улице»: docs/walk-engine.md §8
 * (коридор 30 м, порог 0.6, обе полилинии прорежены до 64 точек).
 */
export function fractionWithinCorridor(
  points: WalkLatLng[],
  polyline: WalkLatLng[],
  corridorMeters: number,
): number {
  if (points.length === 0 || polyline.length < 2) return 0;
  const proj = localProjection(polyline[0]);
  const sampled = resamplePolyline(points, 64).map((p) => proj.toMeters(p));
  const others = resamplePolyline(polyline, 64).map((p) => proj.toMeters(p));

  let inside = 0;
  for (const p of sampled) {
    let best = Infinity;
    for (let i = 0; i < others.length - 1; i++) {
      best = Math.min(best, pointToSegmentMetersXY(p, others[i], others[i + 1]));
      if (best <= corridorMeters) break;
    }
    if (best <= corridorMeters) inside++;
  }
  return inside / sampled.length;
}

/**
 * Режет полилинию маршрута на сегменты по вейпоинтам: для каждого вейпоинта
 * берётся БЛИЖАЙШАЯ вершина полилинии, поиск монотонно вперёд, чтобы сегменты
 * не перекрывались и порядок обхода сохранялся. Сегментов всегда
 * waypoints.length + 1; вырожденные сегменты (вейпоинт совпал с границей)
 * остаются из одной точки — метрики таких ног нулевые.
 */
export function splitPolylineByWaypoints(
  polyline: WalkLatLng[],
  waypoints: WalkLatLng[],
): WalkLatLng[][] {
  if (polyline.length === 0) return waypoints.map(() => []);
  const segments: WalkLatLng[][] = [];
  let startIdx = 0;
  for (const wp of waypoints) {
    let bestIdx = startIdx;
    let bestDist = Infinity;
    for (let j = startIdx; j < polyline.length; j++) {
      const d = haversineMeters(polyline[j], wp);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = j;
      }
    }
    segments.push(polyline.slice(startIdx, bestIdx + 1));
    startIdx = bestIdx;
  }
  segments.push(polyline.slice(startIdx));
  return segments;
}

/**
 * Метрики разрезанной петли: длительность/дистанция маршрута раскладываются
 * по сегментам пропорционально их длине по полилинии. Вырожденная полилиния
 * (одна точка) делит метрики поровну — честнее нуля.
 */
export function splitRouteMetrics(
  segments: WalkLatLng[][],
  routeDistanceMeters: number,
  routeDurationSeconds: number,
): { distanceMeters: number; durationMinutes: number }[] {
  const lengths = segments.map((seg) => polylineLengthMeters(seg));
  const totalLength = lengths.reduce((sum, len) => sum + len, 0);
  const even = segments.length > 0 && totalLength <= 0;
  return segments.map((seg, i) => {
    const share = even ? 1 / segments.length : lengths[i] / totalLength;
    return {
      distanceMeters: routeDistanceMeters * share,
      durationMinutes: (routeDurationSeconds / 60) * share,
    };
  });
}
