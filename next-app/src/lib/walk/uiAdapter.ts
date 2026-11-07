// src/lib/walk/uiAdapter.ts
// Мост движок (lib/walk) → UI-карточка (components/walk/types.ts).
// Чистая функция без побочных эффектов — тестируется без сети и React.
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

/**
 * Первый (лучший) план движка → форма для WalkSummaryCard.
 * Легы движка идут от старта через остановки (и замыкают петлю) —
 * ровно семантика legs UI-типа: петля = stops+1, A→B = stops.
 */
export function enginePlanToUiPlan(engine: EngineWalkPlan, budgetMin: number): UiWalkPlan {
  const stops = engine.stops.map((stop) => ({
    id: `${stop.place.id}`,
    name: stop.place.name,
    kind: uiKindForCategory(stop.place.category),
    stayMin: Math.round(stop.stayMinutes),
    // Движок даёт причины по-русски (§9 walk-engine.md); i18n словарь причин —
    // следующий шаг, пока честно показываем как есть.
    reason: stop.reason,
  }));

  const legs = engine.legs.map((leg) => ({
    walkMin: Math.round(leg.durationMinutes),
  }));

  const walkMin = legs.reduce((sum, l) => sum + l.walkMin, 0);
  const stayMin = stops.reduce((sum, s) => sum + s.stayMin, 0);

  return {
    id: `walk-${Date.now()}`,
    type: engine.legs.length === engine.stops.length + 1 ? 'loop' : 'point_to_point',
    budgetMin,
    stops,
    legs,
    // Пересчитаны из округлённых минут UI — чтобы шапка совпадала с таймлайном
    totals: { walkMin, stayMin, totalMin: walkMin + stayMin },
  };
}
