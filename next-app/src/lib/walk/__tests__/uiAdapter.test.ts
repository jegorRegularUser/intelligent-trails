import { describe, expect, it } from 'vitest';
import { enginePlanToUiPlan, uiKindForCategory } from '../uiAdapter';
import type { WalkLeg, WalkPlan as EnginePlan, WalkStop } from '../types';

function makeEnginePlan(overrides: Partial<EnginePlan> = {}): EnginePlan {
  const stop = (id: number, name: string, category: string, stay: number): WalkStop => ({
    place: { id, name, category, coordinates: [55.75 + id * 0.001, 37.61 + id * 0.001] },
    stayMinutes: stay,
    reason: 'лучший скор категории в коридоре',
  });
  const leg = (fromIdx: number, toIdx: number, minutes: number): WalkLeg => ({
    from: [55.75 + fromIdx * 0.001, 37.61 + fromIdx * 0.001],
    to: [55.75 + toIdx * 0.001, 37.61 + toIdx * 0.001],
    distanceMeters: minutes * 75,
    durationMinutes: minutes,
    geometry: [],
  });

  return {
    stops: [stop(1, 'Парк Горького', 'park', 15), stop(2, 'Кофейня X', 'cafe', 20)],
    legs: [leg(0, 1, 10), leg(1, 2, 12), leg(2, 0, 8)],
    totalWalkMinutes: 30,
    totalStayMinutes: 35,
    totalMinutes: 65,
    score: 1.7,
    gates: [{ gate: 'budget', pass: true, detail: '65 ≤ 66' }],
    allGatesPass: true,
    ...overrides,
  };
}

describe('uiAdapter: движок → карточка UI', () => {
  it('петля: legs.length === stops.length + 1 → type "loop", totals из округлённых минут', () => {
    const ui = enginePlanToUiPlan(makeEnginePlan(), 60);
    expect(ui.type).toBe('loop');
    expect(ui.legs).toHaveLength(3);
    expect(ui.stops).toHaveLength(2);
    expect(ui.totals).toEqual({ walkMin: 30, stayMin: 35, totalMin: 65 });
  });

  it('A→B: legs.length === stops.length → type "point_to_point"', () => {
    const engine = makeEnginePlan();
    engine.legs = engine.legs.slice(0, 2); // без замыкающей ноги
    const ui = enginePlanToUiPlan(engine, 60);
    expect(ui.type).toBe('point_to_point');
    expect(ui.legs).toHaveLength(2);
  });

  it('категории маппятся в словарь карточек, неизвестные — "other"', () => {
    expect(uiKindForCategory('cafe')).toBe('cafe');
    expect(uiKindForCategory('restaurant')).toBe('food');
    expect(uiKindForCategory('shopping')).toBe('shop');
    expect(uiKindForCategory('viewpoint')).toBe('viewpoint');
    expect(uiKindForCategory('cinema')).toBe('other');
    expect(uiKindForCategory('водоём')).toBe('other');
  });

  it('id строки, имя и причина переносятся как есть; дробный stay округляется', () => {
    const engine = makeEnginePlan();
    engine.stops[0].stayMinutes = 14.6;
    const ui = enginePlanToUiPlan(engine, 60);
    expect(ui.stops[0].id).toBe('1');
    expect(ui.stops[0].name).toBe('Парк Горького');
    expect(ui.stops[0].stayMin).toBe(15);
    expect(ui.stops[1].reason).toContain('коридор');
  });
});
