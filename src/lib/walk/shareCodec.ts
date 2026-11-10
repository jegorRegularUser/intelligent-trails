// src/lib/walk/shareCodec.ts
// Прогулка → существующий URL-кодек эксперт-режима (routeCodec v2).
// Зачем: сохранение в историю и шаринг работают через encodedRoute — историческая
// схема остаётся единственным форматом хранения, а быстрая прогулка кодируется
// в неё как старт + категорийные остановки пешком. Открыв ссылку, эксперт-режим
// увидит те же точки и сможет их перенастраивать.
import { encodeRouteToUrl } from '@/utils/routeCodec';
import { resamplePolyline } from './internal/geo';
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
