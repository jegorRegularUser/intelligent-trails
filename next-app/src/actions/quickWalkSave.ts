"use server";

// Сохранение быстрой прогулки в историю. Формат хранения не меняем:
// план кодируется в существующий routeCodec v2 (старт + остановки пешком),
// поэтому история, шаринг и переоткрытие в эксперт-режиме работают как есть.
import { saveRouteAction } from '@/actions/routes';
import { quickWalkToEncodedRoute } from '@/lib/walk/shareCodec';
import type { WalkPlan as UiWalkPlan } from '@/components/walk/types';

export type SaveQuickWalkResult = 'ok' | 'unauthorized' | 'error';

export async function saveQuickWalkToHistory(data: {
  plan: UiWalkPlan;
  name: string;
  vibe: string;
  /** Точка старта прогулки (геолокация/адрес) — не совпадает с первой остановкой. */
  start: [number, number];
}): Promise<SaveQuickWalkResult> {
  if (!data.plan.stops.length) return 'error';

  // Координаты стопов обязательны — они приходят из движка.
  const hasCoords = data.plan.stops.every((stop) => stop.coordinates != null);
  if (!hasCoords) return 'error';

  const encoded = quickWalkToEncodedRoute(data.plan, data.start);
  const result = await saveRouteAction({
    name: data.name,
    encodedRoute: encoded,
    tags: ['quick-walk', data.vibe],
  });

  if (result.success) return 'ok';
  return result.errorCode === 'UNAUTHORIZED' ? 'unauthorized' : 'error';
}
