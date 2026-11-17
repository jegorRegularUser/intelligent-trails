// src/lib/walk/shareCodec.ts
// Прогулка → существующий URL-кодек эксперт-режима (routeCodec v2).
// Зачем: сохранение в историю и шаринг работают через encodedRoute — историческая
// схема остаётся единственным форматом хранения, а быстрая прогулка кодируется
// в неё как старт + категорийные остановки пешком. Открыв ссылку, эксперт-режим
// увидит те же точки и сможет их перенастраивать.
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { encodeRouteToUrl } from '@/utils/routeCodec';
import { resamplePolyline } from './internal/geo';
import { isReasonStandalone } from './uiAdapter';
import type { WalkLatLng } from './types';
import type { WalkPlan as UiWalkPlan } from '@/components/walk/types';

export function quickWalkToEncodedRoute(
  plan: UiWalkPlan,
  start: [number, number],
): string {
  const waypoints = plan.stops.map((stop, index) => ({
    id: `qw-${index}-${stop.id}`,
    type: 'category' as const,
    value: stop.kind,
    originalCategory: stop.kind,
    resolvedName: stop.name,
    coords: (stop.coordinates ?? start) as [number, number],
    duration: stop.stayMin,
    modeToNext: 'pedestrian' as const,
    selectedAlternativeIndex: 0,
  }));

  return encodeRouteToUrl({
    startPoint: start,
    startPointName: 'Старт прогулки',
    startPointAddress: undefined,
    startTransport: 'pedestrian',
    waypoints,
    // Петля: финиш совпадает со стартом — эксперт-режим откроет те же точки
    endPoint: start,
    endPointType: 'address',
    endPointName: 'Старт прогулки',
    endPointAddress: undefined,
  });
}

/**
 * Сэмплинг геометрии чистой петли для внешних маршрутизаторов: ≤ maxPoints
 * точек, равномерно по длине полилинии, первая и последняя гарантированы
 * (петля замкнута). Чистая функция — тестируется отдельно.
 */
export function sampleLoopGeometry(
  geometry: WalkLatLng[],
  maxPoints = 10,
): WalkLatLng[] {
  return resamplePolyline(geometry, maxPoints);
}

/** Ссылка «Идти» — готовый пешеходный маршрут в Яндекс.Картах (rtt=pd). */
export function quickWalkToYandexMapsUrl(
  plan: UiWalkPlan,
  start: [number, number],
): string {
  const points = [start, ...plan.stops.map((s) => s.coordinates ?? start)];
  // Петля: добавить возврат к старту
  if (plan.type === 'loop') points.push(start);
  // Loop-only: остановок нет, старт~старт Яндекс покажет как «точку в точку» —
  // сэмплируем геометрию петли в ≤10 точек. Нет геометрии — честная деградация
  // в старт~старт, как у любых планов без геометрии ног.
  if (plan.stops.length === 0) {
    const geometry: WalkLatLng[] = [];
    for (const leg of plan.legs) {
      for (const point of leg.geometry ?? []) geometry.push(point);
    }
    const sampled = geometry.length >= 2 ? sampleLoopGeometry(geometry) : [];
    if (sampled.length >= 2) {
      const sampledText = sampled
        .map(([lat, lng]) => `${lat.toFixed(5)},${lng.toFixed(5)}`)
        .join('~');
      return `https://yandex.ru/maps/?mode=routes&rtext=${sampledText}&rtt=pd`;
    }
  }
  const rtext = points.map(([lat, lng]) => `${lat.toFixed(5)},${lng.toFixed(5)}`).join('~');
  return `https://yandex.ru/maps/?mode=routes&rtext=${rtext}&rtt=pd`;
}

// --- Быстрый шеринг ?w= (docs/ux-human-wave.md M4) ---------------------------------
// Свой кодек v3, НЕ routeCodec v2: у шаринга прогулки другая семантика (план
// целиком, а не список вейпоинтов эксперт-маршрута), и история остаётся на
// эксперт-кодеке — ?w= открывается без сети как готовая карточка.

/**
 * Предел URL шеринга (M4): мессенджеры и SMS тихо режут длинные ссылки, поэтому
 * геометрия едет в ?w= только пока весь URL ≤ этой константы. Переполнение —
 * геометрия отбрасывается (leg'и остаются с walkMin), на открытии такой план
 * честно помечен geoDropped (пины и таймлайн полные, линии на карте нет).
 */
export const SHARE_URL_MAX_CHARS = 1800;

/** Геометрия в ссылке ресэмплится до ≤40 точек на лег (M4) — этого хватает для бренда-линии. */
export const SHARE_MAX_POINTS_PER_LEG = 40;

const SHARE_COORD_SCALE = 1e5; // ≈1.1 м на младший разряд — как routeCodec v2

/**
 * Payload ?w= v3 (M4). Поля — из спеки; координаты — целые ×1e5 для компактности.
 * start/end — отступление от буквы спеки, но необходимость: при отброшенной
 * геометрии без них теряются точки старта/финиша (для петли старт восстанавливался
 * бы из линии, а линии нет).
 */
export interface QuickPlanPayloadV3 {
  v: 3;
  type: 'loop' | 'ab';
  budgetMin: number;
  variantIndex: number;
  totals: { walkMin: number; stayMin: number; totalMin: number };
  start?: [number, number];
  end?: [number, number];
  stops: {
    id: string;
    name: string;
    kind: string;
    lat: number;
    lng: number;
    stayMin: number;
    reason: string;
  }[];
  legs: { walkMin: number; geometry?: [number, number][] }[];
  /** Геометрия отброшена при переполнении URL — на открытии линии на карте нет. */
  geo?: false;
}

function roundLatLng([lat, lng]: WalkLatLng): [number, number] {
  return [Math.round(lat * SHARE_COORD_SCALE), Math.round(lng * SHARE_COORD_SCALE)];
}

function encodeSharePayload(
  plan: UiWalkPlan,
  start: [number, number],
  variantIndex: number,
  includeGeometry: boolean,
): QuickPlanPayloadV3 {
  const legs = plan.legs.map((leg) => {
    if (!includeGeometry || !leg.geometry || leg.geometry.length < 2) {
      return { walkMin: leg.walkMin };
    }
    return {
      walkMin: leg.walkMin,
      geometry: sampleLoopGeometry(leg.geometry, SHARE_MAX_POINTS_PER_LEG).map(roundLatLng),
    };
  });
  return {
    v: 3,
    type: plan.type === 'loop' ? 'loop' : 'ab',
    budgetMin: plan.budgetMin,
    variantIndex,
    totals: plan.totals,
    start: roundLatLng(start),
    ...(plan.type !== 'loop' && plan.stops.length > 0
      ? { end: roundLatLng(plan.stops[plan.stops.length - 1].coordinates ?? start) }
      : {}),
    stops: plan.stops.map((stop) => ({
      id: stop.id,
      name: stop.name,
      kind: stop.kind,
      lat: Math.round((stop.coordinates ?? start)[0] * SHARE_COORD_SCALE),
      lng: Math.round((stop.coordinates ?? start)[1] * SHARE_COORD_SCALE),
      stayMin: stop.stayMin,
      reason: stop.reason,
    })),
    legs,
    // Флаг ставится ТОЛЬКО на slim-пути (переполнение URL): план без геометрии
    // ног (деградация движка) не должен притворяться «восстановленным».
    ...(includeGeometry ? {} : { geo: false as const }),
  };
}

/** Результат декодирования ?w=: готовый план + флаг отброшенной геометрии (бейдж). */
export interface DecodedQuickWalkShare {
  plan: UiWalkPlan;
  /** Геометрия не поместилась в ссылку: пины и таймлайн полные, линии на карте нет. */
  geoDropped: boolean;
}

/**
 * Ссылка ?w= быстрой прогулки (M4): сжатие lz-string, предел URL с отбрасыванием
 * геометрии. Чистая функция — тестируется отдельно.
 */
export function quickWalkShareUrl(
  plan: UiWalkPlan,
  start: [number, number],
  variantIndex = 0,
): string {
  const compressed = (payload: QuickPlanPayloadV3) =>
    compressToEncodedURIComponent(JSON.stringify(payload));
  const url = (payload: QuickPlanPayloadV3) => `/?w=${compressed(payload)}`;

  const full = encodeSharePayload(plan, start, variantIndex, true);
  if (url(full).length <= SHARE_URL_MAX_CHARS) return url(full);
  // Переполнение: геометрия — самое тяжёлое и самое необязательное в ссылке.
  const slim = encodeSharePayload(plan, start, variantIndex, false);
  return url(slim);
}

/** Декод ?w= v3: мусор/чужая версия → null, звонящий честно игнорирует ссылку. */
export function decodeQuickWalkShare(raw: string): DecodedQuickWalkShare | null {
  try {
    const json = decompressFromEncodedURIComponent(raw);
    if (!json) return null;
    const payload = JSON.parse(json) as QuickPlanPayloadV3;
    if (!payload || payload.v !== 3) return null;
    if (payload.type !== 'loop' && payload.type !== 'ab') return null;
    if (!Array.isArray(payload.stops) || !Array.isArray(payload.legs)) return null;
    if (!payload.totals || typeof payload.budgetMin !== 'number') return null;

    const start: [number, number] | undefined = Array.isArray(payload.start)
      ? [payload.start[0] / SHARE_COORD_SCALE, payload.start[1] / SHARE_COORD_SCALE]
      : undefined;
    const stops = payload.stops.map((stop) => ({
      id: stop.id,
      name: stop.name,
      kind: stop.kind as UiWalkPlan['stops'][number]['kind'],
      stayMin: stop.stayMin,
      reason: stop.reason,
      // M5: маркер человекочитаемой причины выводится и при декоде — в payload
      // он не едет (поле презентационное, а не данные ссылки).
      ...(isReasonStandalone(stop.reason) ? { reasonStandalone: true } : {}),
      coordinates: [
        stop.lat / SHARE_COORD_SCALE,
        stop.lng / SHARE_COORD_SCALE,
      ] as [number, number],
    }));
    const legs = payload.legs.map((leg) => ({
      walkMin: leg.walkMin,
      ...(Array.isArray(leg.geometry) && leg.geometry.length >= 2
        ? {
            geometry: leg.geometry.map(([latI, lngI]) => [
              latI / SHARE_COORD_SCALE,
              lngI / SHARE_COORD_SCALE,
            ]) as [number, number][],
          }
        : {}),
    }));

    const plan: UiWalkPlan = {
      id: 'walk-shared',
      type: payload.type === 'loop' ? 'loop' : 'point_to_point',
      budgetMin: payload.budgetMin,
      stops,
      legs,
      totals: payload.totals,
    };
    return { plan, geoDropped: payload.geo === false };
  } catch {
    return null;
  }
}
