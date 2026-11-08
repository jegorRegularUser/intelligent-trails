// src/lib/walk/shareCodec.ts
// Прогулка → существующий URL-кодек эксперт-режима (routeCodec v2).
// Зачем: сохранение в историю и шаринг работают через encodedRoute — историческая
// схема остаётся единственным форматом хранения, а быстрая прогулка кодируется
// в неё как старт + категорийные остановки пешком. Открыв ссылку, эксперт-режим
// увидит те же точки и сможет их перенастраивать.
import { encodeRouteToUrl } from '@/utils/routeCodec';
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

/** Ссылка «Идти» — готовый пешеходный маршрут в Яндекс.Картах (rtt=pd). */
export function quickWalkToYandexMapsUrl(
  plan: UiWalkPlan,
  start: [number, number],
): string {
  const points = [start, ...plan.stops.map((s) => s.coordinates ?? start)];
  // Петля: добавить возврат к старту
  if (plan.type === 'loop') points.push(start);
  const rtext = points.map(([lat, lng]) => `${lat.toFixed(5)},${lng.toFixed(5)}`).join('~');
  return `https://yandex.ru/maps/?mode=routes&rtext=${rtext}&rtt=pd`;
}
