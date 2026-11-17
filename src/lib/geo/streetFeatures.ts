// src/lib/geo/streetFeatures.ts
// Фичи улиц «Улицы с характером» (docs/street-interest-wave.md S1): один
// Overpass-запрос, 5 классов фич union'ом — зелень, вода, пешеходные улицы,
// видовые точки, арт. Отличия от POI-запроса overpass-places: клип геометрии
// вывода (`out geom (s,w,n,e)` — bbox/around отбирают элементы, но возвращают
// их ПОЛНУЮ геометрию, клипует вывод только параметр out), `[timeout:20]`
// (запрос тяжелее POI), парсер с нуля (elementPoint с `out center` не работает:
// center при geom не отдаётся) и клиентские капы на объём.

import { GeoError } from './types';
import type { LatLng, StreetFeature, StreetFeatureKind } from './types';

// --- Капы волны (S1, B1) -----------------------------------------------------

/** Кламп радиуса поиска: без капа при бюджете 240 радиус был бы 7208 м и bbox 14+ км. */
export const STREET_FEATURES_MIN_RADIUS_M = 500;
export const STREET_FEATURES_MAX_RADIUS_M = 3000;
/** Кап элементов ответа: больше — частичная деградация по приоритету классов или null. */
export const STREET_FEATURES_MAX_ELEMENTS = 3000;
/** Кап суммарных точек геометрий: payload ответа на порядок жирнее POI. */
export const STREET_FEATURES_MAX_POINTS = 50000;
/** Децимация контуров при нормализации: потребителям (буферы 60/80 м,
 *  attractionPoint) хватает, сотни вершин OSM-полигонов — не нужны. */
export const STREET_FEATURES_MAX_RING_POINTS = 64;

/** Приоритет классов при частичной деградации (S1): ядро среды, потом украшения. */
const PRIORITY_KINDS: readonly StreetFeatureKind[] = ['water', 'green', 'pedestrian'];

export function clampStreetRadius(searchRadius: number): number {
  if (!Number.isFinite(searchRadius)) {
    throw new GeoError('INVALID_INPUT', `searchRadius: конечное число метров, получено ${searchRadius}`);
  }
  return Math.min(
    STREET_FEATURES_MAX_RADIUS_M,
    Math.max(STREET_FEATURES_MIN_RADIUS_M, searchRadius),
  );
}

// --- Overpass-запрос ---------------------------------------------------------

const EARTH_M_PER_DEG = 6371008.8 * (Math.PI / 180);

/**
 * bbox [south,west,north,east] вокруг центра — statement-фильтр для скорости
 * отбора + параметр `out geom` для клипа геометрии вывода (S1). Координаты
 * 6 знаков (~0.1 м) — bbox шире радиуса не становится из-за округления.
 */
function bboxOf(center: LatLng, radiusMeters: number): [number, number, number, number] {
  const [lat, lon] = center;
  const dLat = radiusMeters / EARTH_M_PER_DEG;
  const dLng = radiusMeters / (EARTH_M_PER_DEG * Math.cos(lat * (Math.PI / 180)));
  const round6 = (v: number): number => Math.round(v * 1e6) / 1e6;
  return [
    round6(lat - dLat),
    round6(lon - dLng),
    round6(lat + dLat),
    round6(lon + dLng),
  ];
}

/**
 * Один запрос на 5 классов фич union'ом (S1). Точечные классы (viewpoint/art)
 * — только node; линейные/полигональные (green/water/pedestrian) — nwr.
 * pedestrian — с именем (безымянные пешеходные проходы не интерес); у
 * воды/зелени имени часто нет — их не фильтруем (S1, C10).
 */
export function streetFeaturesQuery(center: LatLng, searchRadius: number): string {
  const radius = clampStreetRadius(searchRadius);
  const [s, w, n, e] = bboxOf(center, radius);
  const bbox = `[bbox:${s},${w},${n},${e}]`;
  return [
    '[out:json][timeout:20];',
    '(',
    `  nwr["leisure"="park"]${bbox};`,
    `  nwr["leisure"="garden"]${bbox};`,
    `  nwr["natural"="wood"]${bbox};`,
    `  nwr["natural"="water"]${bbox};`,
    `  nwr["waterway"~"^(riverbank|canal|stream)$"]${bbox};`,
    `  nwr["highway"="pedestrian"]["name"]${bbox};`,
    `  nwr["place"="square"]${bbox};`,
    `  node["tourism"="viewpoint"]${bbox};`,
    `  node["man_made"="viewpoint"]${bbox};`,
    `  node["tourism"="artwork"]${bbox};`,
    `  node["amenity"="fountain"]${bbox};`,
    `  node["historic"~"^(memorial|monument)$"]${bbox};`,
    ');',
    'out geom (s,w,n,e);',
  ].join('\n');
}

// --- Парсер элементов --------------------------------------------------------

interface OverpassGeomPoint {
  lat?: unknown;
  lon?: unknown;
}

interface OverpassStreetElement {
  type?: unknown;
  id?: unknown;
  lat?: unknown;
  lon?: unknown;
  tags?: Record<string, unknown>;
  geometry?: unknown;
  members?: unknown;
}

interface OverpassMember {
  type?: unknown;
  ref?: unknown;
  role?: unknown;
  geometry?: unknown;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Первый подходящий класс по тегам (S1, таблица kind → OSM). */
function classifyKind(tags: Record<string, unknown>): StreetFeatureKind | null {
  if (tags.leisure === 'park' || tags.leisure === 'garden' || tags.natural === 'wood') return 'green';
  if (tags.natural === 'water') return 'water';
  if (typeof tags.waterway === 'string' && ['riverbank', 'canal', 'stream'].includes(tags.waterway)) {
    return 'water';
  }
  // highway=pedestrian приходит с [name] из запроса; square у площадей имени
  // может не иметь — потребителям хватает контура.
  if (tags.highway === 'pedestrian' || tags.place === 'square') return 'pedestrian';
  if (tags.tourism === 'viewpoint' || tags['man_made'] === 'viewpoint') return 'viewpoint';
  if (
    tags.tourism === 'artwork' ||
    tags.amenity === 'fountain' ||
    tags.historic === 'memorial' ||
    tags.historic === 'monument'
  ) {
    return 'art';
  }
  return null;
}

function geomOf(raw: unknown): LatLng[] {
  if (!Array.isArray(raw)) return [];
  const points: LatLng[] = [];
  for (const item of raw) {
    const point = item as OverpassGeomPoint;
    if (isFiniteNumber(point?.lat) && isFiniteNumber(point?.lon)) points.push([point.lat, point.lon]);
  }
  return points;
}

/**
 * Ресемпл полилинии по длине до ≤ maxPoints точек. Локальный двойник
 * walk/internal/geo.resamplePolyline: geo-слой не импортирует walk-слой
 * (направление зависимостей — lib/walk/types без импортов, §2 walk-engine).
 */
function resamplePolyline(points: LatLng[], maxPoints: number): LatLng[] {
  if (points.length <= maxPoints) return points.slice();
  const rad = Math.PI / 180;
  const kx = EARTH_M_PER_DEG * Math.cos(points[0][0] * rad);
  const ky = EARTH_M_PER_DEG;
  const xy = points.map(([lat, lng]) => ({ x: (lng - points[0][1]) * kx, y: (lat - points[0][0]) * ky }));
  const cum: number[] = [0];
  for (let i = 1; i < xy.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(xy[i].x - xy[i - 1].x, xy[i].y - xy[i - 1].y));
  }
  const total = cum[cum.length - 1];
  if (total === 0) return [points[0]];

  const out: LatLng[] = [];
  let seg = 0;
  for (let k = 0; k < maxPoints; k++) {
    const target = (total * k) / (maxPoints - 1);
    while (seg < cum.length - 2 && cum[seg + 1] < target) seg++;
    const f = cum[seg + 1] > cum[seg] ? (target - cum[seg]) / (cum[seg + 1] - cum[seg]) : 0;
    out.push([
      points[seg][0] + (points[seg + 1][0] - points[seg][0]) * f,
      points[seg][1] + (points[seg + 1][1] - points[seg][1]) * f,
    ]);
  }
  return out;
}

/** Площадь замкнутого контура, м² (shoelace в equirect-проекции вокруг первой вершины). */
function ringAreaMeters(points: LatLng[]): number {
  if (points.length < 3) return 0;
  const rad = Math.PI / 180;
  const kx = EARTH_M_PER_DEG * Math.cos(points[0][0] * rad);
  const ky = EARTH_M_PER_DEG;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const ax = (a[1] - points[0][1]) * kx;
    const ay = (a[0] - points[0][0]) * ky;
    const bx = (b[1] - points[0][1]) * kx;
    const by = (b[0] - points[0][0]) * ky;
    sum += ax * by - bx * ay;
  }
  return Math.abs(sum) / 2;
}

function isClosedRing(points: LatLng[]): boolean {
  return (
    points.length >= 4 &&
    Math.abs(points[0][0] - points[points.length - 1][0]) < 1e-9 &&
    Math.abs(points[0][1] - points[points.length - 1][1]) < 1e-9
  );
}

function nameOf(tags: Record<string, unknown>): string | undefined {
  const name = tags.name;
  return typeof name === 'string' && name.length > 0 ? name : undefined;
}

function buildFeature(kind: StreetFeatureKind, geometry: LatLng[], tags: Record<string, unknown>): StreetFeature {
  const decimated = resamplePolyline(geometry, STREET_FEATURES_MAX_RING_POINTS);
  const name = nameOf(tags);
  return {
    kind,
    geometry: decimated,
    ...(name ? { name } : {}),
    areaMeters: isClosedRing(decimated) ? ringAreaMeters(decimated) : 0,
  };
}

/** Ключ элемента для дедупа relation-членов с уже разобранными way-фичами (S1, C10). */
function refKey(type: unknown, id: unknown): string {
  const t = typeof type === 'string' ? type : 'way';
  return `${t}/${typeof id === 'number' ? id : ''}`;
}

/**
 * Разбор элементов в фичи. node → точка; way → линия/контур из geometry[];
 * relation — outer-кольца members ({members[].geometry}) с дедупом против
 * way-фич (граница парка, размеченная way-тегами, пришла бы дважды).
 * Клип relation-мультиполигонов гарантирован не всеми версиями Overpass —
 * подстраховка клиентскими капами выше (S1). Возвращает также сырой счёт
 * точек (до децимации) — капы считают его, а не ресемплированный (payload
 * и парсинг платятся сырьём).
 */
function parseElements(elements: unknown[]): { features: StreetFeature[]; rawPoints: number } {
  const features: StreetFeature[] = [];
  const seenWays = new Set<string>();
  let rawPoints = 0;

  for (const raw of elements) {
    const element = raw as OverpassStreetElement;
    if (!element.tags || typeof element.tags !== 'object') continue;
    const kind = classifyKind(element.tags);
    if (!kind) continue;
    if (element.type === 'node') {
      if (!isFiniteNumber(element.lat) || !isFiniteNumber(element.lon)) continue;
      rawPoints += 1;
      features.push(buildFeature(kind, [[element.lat, element.lon]], element.tags));
      continue;
    }
    if (element.type === 'way') {
      const geometry = geomOf(element.geometry);
      if (geometry.length === 0) continue;
      seenWays.add(refKey(element.type, element.id));
      rawPoints += geometry.length;
      features.push(buildFeature(kind, geometry, element.tags));
    }
    // relations — второй проход (нужен полный seenWays).
  }

  for (const raw of elements) {
    const element = raw as OverpassStreetElement;
    if (element.type !== 'relation') continue;
    if (!element.tags || typeof element.tags !== 'object') continue;
    const kind = classifyKind(element.tags);
    if (!kind) continue;
    if (!Array.isArray(element.members)) continue;
    const usedMembers = new Set<string>();
    for (const rawMember of element.members) {
      const member = rawMember as OverpassMember;
      if (member.role !== 'outer') continue; // inner-кольца (острова) — мимо (S1)
      const key = refKey(member.type, member.ref);
      if (seenWays.has(key) || usedMembers.has(key)) continue;
      const geometry = geomOf(member.geometry);
      if (geometry.length === 0) continue;
      usedMembers.add(key);
      rawPoints += geometry.length;
      features.push(buildFeature(kind, geometry, element.tags));
    }
  }

  return { features, rawPoints };
}

function isPriorityElement(raw: unknown): boolean {
  const tags = (raw as OverpassStreetElement).tags;
  if (!tags || typeof tags !== 'object') return false;
  const kind = classifyKind(tags);
  return kind !== null && PRIORITY_KINDS.includes(kind);
}

/**
 * Нормализация ответа с клиентскими капами (S1, B1): элементы > 3000 или
 * сырые точки геометрий > 50 000 → частичная деградация (только ядро
 * приоритета water/green/pedestrian, без viewpoint/art), не влезло и ядро →
 * null. null — честный ответ «район слишком плотный для интерес-модели»,
 * не ошибка.
 */
export function parseStreetFeatures(elements: unknown[]): StreetFeature[] | null {
  if (elements.length > STREET_FEATURES_MAX_ELEMENTS) {
    const core = elements.filter(isPriorityElement);
    if (core.length > STREET_FEATURES_MAX_ELEMENTS) return null;
    const { features, rawPoints } = parseElements(core);
    return rawPoints <= STREET_FEATURES_MAX_POINTS ? features : null;
  }

  const { features, rawPoints } = parseElements(elements);
  if (rawPoints <= STREET_FEATURES_MAX_POINTS) return features;
  const { features: core, rawPoints: corePoints } = parseElements(elements.filter(isPriorityElement));
  return corePoints <= STREET_FEATURES_MAX_POINTS ? core : null;
}
