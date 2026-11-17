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
  /** Обратное к toMeters — метры {x, y} → [lat, lng]. */
  fromMeters(m: { x: number; y: number }): WalkLatLng;
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
    fromMeters: (m: { x: number; y: number }) => [center[0] + m.y / ky, center[1] + m.x / kx],
  };
}

/**
 * Азимут точки от центра, рад: от севера по часовой стрелке, нормирован в
 * [0..2π). Конвенция розы (docs/street-interest-wave.md S2, pinned): проекция
 * даёт x=восток/y=север, роза строит вейпоинт как sin→lat, cos→lng
 * (streetLoop.buildWaypoints) — поэтому atan2(восток, север), а не atan2(y,x).
 * Единая формула для диверсификации (R2), интерес-модели (S2) и снапа (S3).
 */
export function azimuthRad(center: WalkLatLng, point: WalkLatLng): number {
  const { x, y } = localProjection(center).toMeters(point);
  return (Math.atan2(x, y) + 2 * Math.PI) % (2 * Math.PI);
}

/** Индекс азимутного сектора [0..sectorCount): floor(нормированный азимут / ширина).
 *  Вход нормируется в [0..2π) — хелпер безопасен для сырых углов любого знака.
 *  Epsilon-сдвиг — float-страховка границ: азимут 135° при делении на ширину
 *  45° даёт 2.9999999999999996, и без сдвига точная граница падала бы в
 *  предыдущий сектор. */
export function sectorOfAzimuth(azimuth: number, sectorCount: number): number {
  const twoPi = 2 * Math.PI;
  const width = twoPi / sectorCount;
  const normalized = ((azimuth % twoPi) + twoPi) % twoPi;
  return Math.min(sectorCount - 1, Math.floor((normalized + 1e-9) / width));
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

/**
 * Перпендикулярный офсет via-точки, дающий прибавку extraMeters к длине ноги
 * с исходной длиной legMeters (docs/walk-loop-quality.md R1.c). Модель —
 * равнобедренный треугольник: путь через апекс на серединном перпендикуляре
 * 2·√((D/2)² + h²), решая 2·√(...) − D = extra → h = √(extra·(2D + extra))/2
 * (при extra ≪ D это ≈ √(extra·D/2)). Наивный «сместить на extra» даёт
 * прибавку ≈ 2·extra²/D — промах в разы. Реальный роутинг поправит остаток —
 * tune-цикл добора подгоняет по факту.
 */
export function viaOffsetForExtraMeters(legMeters: number, extraMeters: number): number {
  if (!(legMeters > 0) || !(extraMeters > 0)) return 0;
  return Math.sqrt(extraMeters * (2 * legMeters + extraMeters)) / 2;
}

/**
 * Via-точка удлинения ноги: на перпендикуляре к a→b, поднятом из середины,
 * на дистанции offsetMeters в сторону side. Серединный перпендикуляр —
 * |via−a| = |via−b|: плечи треугольника симметричны. Чистая функция —
 * тестируется отдельно (R1).
 */
export function viaPointFor(
  a: WalkLatLng,
  b: WalkLatLng,
  offsetMeters: number,
  side: 1 | -1,
): WalkLatLng {
  const rad = Math.PI / 180;
  const latPerM = 1 / (EARTH_RADIUS_M * rad);
  const lngPerM = 1 / (EARTH_RADIUS_M * rad * Math.cos(a[0] * rad));
  const dxM = (b[1] - a[1]) / lngPerM; // восток
  const dyM = (b[0] - a[0]) / latPerM; // север
  const length = Math.hypot(dxM, dyM) || 1;
  // Перпендикуляр к (dx, dy) — (-dy, dx).
  const offEast = (-dyM / length) * offsetMeters * side;
  const offNorth = (dxM / length) * offsetMeters * side;
  return [
    (a[0] + b[0]) / 2 + offNorth * latPerM,
    (a[1] + b[1]) / 2 + offEast * lngPerM,
  ];
}

/**
 * Площадь замкнутой петли по сырой полилинии, м² (волна «Прогулка», тайбрейкер
 * сортировки вариантов): СНАЧАЛА выпуклая оболочка (алгоритм Эндрю, монотонная
 * цепочка) по точкам в equirect-проекции, ПОТОМ shoelace по вершинам оболочки.
 * Shoelace по сырой полилинии взят напрямую — знаковая алгебраическая площадь:
 * на «восьмёрке» (самопересечение) она схлопывается в ноль, хотя петля честно
 * накрывает два квартала; оболочка этому не подвержена. Вырожденные входы
 * (меньше 3 непараллельных вершин) — 0: out-and-back и пустая геометрия
 * честно не покрывают ничего, сортировка падает в тайбрейкер totalMinutes.
 */
export function loopAreaMeters(points: WalkLatLng[]): number {
  if (points.length < 3) return 0;
  const proj = localProjection(points[0]);
  const xy = points.map((p) => proj.toMeters(p));
  const hull = convexHull(xy);
  if (hull.length < 3) return 0;
  return Math.abs(shoelace(hull));
}

/** Выпуклая оболочка на плоскости: монотонная цепочка Эндрю, против часовой. */
function convexHull(points: { x: number; y: number }[]): { x: number; y: number }[] {
  const sorted = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (
    o: { x: number; y: number },
    a: { x: number; y: number },
    b: { x: number; y: number },
  ): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: { x: number; y: number }[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: { x: number; y: number }[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function shoelace(ring: { x: number; y: number }[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

function pointToSegmentMetersXY(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return closestOnSegmentXY(p, a, b).distanceMeters;
}

function closestOnSegmentXY(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): { x: number; y: number; distanceMeters: number } {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const lenSq = abx * abx + aby * aby;
  if (lenSq === 0) return { x: a.x, y: a.y, distanceMeters: Math.hypot(apx, apy) };
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / lenSq));
  return {
    x: a.x + t * abx,
    y: a.y + t * aby,
    distanceMeters: Math.hypot(apx - t * abx, apy - t * aby),
  };
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

export interface ClosestOnPolyline {
  /** Проекция p на ближайший сегмент полилинии. */
  point: WalkLatLng;
  distanceMeters: number;
  /** Индекс сегмента a→b, на который легла проекция (−1 у пустой полилинии). */
  segmentIndex: number;
}

/**
 * Ближайшая точка полилинии к p, в метрах и координатах: проекция на
 * ближайший сегмент (полилиния в проекции вокруг своей первой вершины).
 * Потребители (S2 attractionPoint, S4 микро-стопы): вершины OSM-контуров
 * неравномерны — проекция на СЕГМЕНТ честнее ближайшей вершины. Пустая
 * полилиния → дистанция Infinity (звонящий обязан фильтровать); одна вершина
 * → сама вершина.
 */
export function closestPointOnPolyline(p: WalkLatLng, polyline: WalkLatLng[]): ClosestOnPolyline {
  if (polyline.length === 0) {
    return { point: p, distanceMeters: Number.POSITIVE_INFINITY, segmentIndex: -1 };
  }
  if (polyline.length === 1) {
    return { point: polyline[0], distanceMeters: haversineMeters(p, polyline[0]), segmentIndex: 0 };
  }
  const proj = localProjection(polyline[0]);
  const target = proj.toMeters(p);
  let best: ClosestOnPolyline | null = null;
  for (let i = 0; i < polyline.length - 1; i++) {
    const hit = closestOnSegmentXY(target, proj.toMeters(polyline[i]), proj.toMeters(polyline[i + 1]));
    if (best === null || hit.distanceMeters < best.distanceMeters) {
      best = { point: proj.fromMeters(hit), distanceMeters: hit.distanceMeters, segmentIndex: i };
    }
    if (hit.distanceMeters === 0) break; // ближе не бывает — ранний выход
  }
  return best!;
}

/** Прямоугольник в градусах: [south, west, north, east] — префильтр фич (S4/S5). */
export interface BBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

/**
 * bbox полилинии, раздутый на inflateM метров (широта/долгота по центру bbox —
 * консервативно для городских дистанций). Пустая полилиния → вырожденный
 * нулевой bbox: с реальными bbox не пересечётся, звонящие фильтруют пустые.
 */
export function bboxOf(points: WalkLatLng[], inflateM: number): BBox {
  let south = Number.POSITIVE_INFINITY;
  let west = Number.POSITIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  for (const [lat, lng] of points) {
    if (lat < south) south = lat;
    if (lat > north) north = lat;
    if (lng < west) west = lng;
    if (lng > east) east = lng;
  }
  if (!Number.isFinite(south)) return { south: 0, west: 0, north: 0, east: 0 };
  const rad = Math.PI / 180;
  const dLat = inflateM / (EARTH_RADIUS_M * rad);
  const dLng = inflateM / (EARTH_RADIUS_M * rad * Math.cos(((south + north) / 2) * rad));
  return { south: south - dLat, west: west - dLng, north: north + dLat, east: east + dLng };
}

/** Пересечение bbox'ов (касание считается пересечением — буферы уже учтены). */
export function bboxIntersects(a: BBox, b: BBox): boolean {
  return a.south <= b.north && b.south <= a.north && a.west <= b.east && b.west <= a.east;
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
  // Контракт: сегментов всегда waypoints.length + 1 — пустая полилиния
  // (вырожденный маршрут) не исключение, иначе раскладка метрик по ногам
  // у потребителя падает на пропущенном сегменте.
  if (polyline.length === 0) return waypoints.map(() => []).concat([[]]);
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
