// src/lib/walk/uiAdapter.ts
// Мост движок (lib/walk) → UI-карточка (components/walk/types.ts).
// Чистые функции без побочных эффектов — тестируются без сети и React.
import type { WalkPlan as EngineWalkPlan } from './types';
import type { WalkPlan as UiWalkPlan, WalkStopKind } from '@/components/walk/types';

/** Категория реестра (constants/categories.ts) → kind карточки UI. */
const CATEGORY_TO_UI_KIND: Record<string, WalkStopKind> = {
  cafe: 'cafe',
  restaurant: 'food',
  bar: 'food',
  park: 'park',
  museum: 'museum',
  cinema: 'other',
  shopping: 'shop',
  viewpoint: 'viewpoint',
  attraction: 'other',
  waterfront: 'waterfront',
  market: 'market',
};

export function uiKindForCategory(category: string): WalkStopKind {
  return CATEGORY_TO_UI_KIND[category] ?? 'other';
}

/** Причина в словаре локали: у движка есть RU-факт и EN-твин. */
function reasonFor(stop: EngineWalkPlan['stops'][number], locale: 'ru' | 'en'): string {
  return locale === 'en' ? (stop.reasonEn ?? stop.reason) : stop.reason;
}

/**
 * Один план движка → форма для WalkSummaryCard.
 * Легы движка идут от старта через остановки (и замыкают петлю) —
 * ровно семантика legs UI-типа: петля = stops+1, A→B = stops.
 * geometry каждого лега — полилиния [lat,lng] для отрисовки на карте.
 */
export function enginePlanToUiPlan(
  engine: EngineWalkPlan,
  budgetMin: number,
  locale: 'ru' | 'en' = 'ru',
): UiWalkPlan {
  const stops = engine.stops.map((stop) => ({
    id: `${stop.place.id}`,
    name: stop.place.name,
    kind: uiKindForCategory(stop.place.category),
    stayMin: Math.round(stop.stayMinutes),
    reason: reasonFor(stop, locale),
    coordinates: stop.place.coordinates,
  }));

  const legs = engine.legs.map((leg) => ({
    walkMin: Math.round(leg.durationMinutes),
    ...(leg.geometry.length > 0 ? { geometry: leg.geometry } : {}),
  }));

  const walkMin = legs.reduce((sum, l) => sum + l.walkMin, 0);
  const stayMin = stops.reduce((sum, s) => sum + s.stayMin, 0);

  return {
    id: `walk-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    type: engine.legs.length === engine.stops.length + 1 ? 'loop' : 'point_to_point',
    budgetMin,
    stops,
    legs,
    // Пересчитаны из округлённых минут UI — чтобы шапка совпадала с таймлайном
    totals: { walkMin, stayMin, totalMin: walkMin + stayMin },
  };
}

/** Все планы движка (движок отдаёт до трёх вариантов). */
export function enginePlansToUiPlans(
  engines: EngineWalkPlan[],
  budgetMin: number,
  locale: 'ru' | 'en' = 'ru',
): UiWalkPlan[] {
  return engines.map((plan) => enginePlanToUiPlan(plan, budgetMin, locale));
}

/** Полная полилиния прогулки для карты: старт + геометрии всех легов подряд. */
export function planPolyline(plan: UiWalkPlan, start: [number, number]): [number, number][] {
  const points: [number, number][] = [start];
  for (const leg of plan.legs) {
    for (const pt of leg.geometry ?? []) {
      const last = points[points.length - 1];
      // стыкуем леги без дублей узла на границе
      if (Math.abs(last[0] - pt[0]) > 1e-9 || Math.abs(last[1] - pt[1]) > 1e-9) {
        points.push(pt);
      }
    }
  }
  return points;
}
