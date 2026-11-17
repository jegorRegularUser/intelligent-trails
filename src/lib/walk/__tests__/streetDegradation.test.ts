// src/lib/walk/__tests__/streetDegradation.test.ts
// Снапшот деградации волны «Улицы с характером» (S6): при hasData=false (или
// отсутствии данных) планы БИТ-В-БИТ совпадают с прежними — поля WalkInput /
// StreetLoopInput остаются undefined, НЕ пустыми массивами; hints c
// hasData=false не трогают розу. Это контракт честной деградации: «нет данных —
// прежняя геометрия», а не «пустые подсказки».

import { describe, expect, it } from 'vitest';
import { createWalkPlan } from '@/lib/walk/createWalkPlan';
import { buildWalkWithFallback } from '@/lib/walk/fallback';
import { buildStreetLoop } from '@/lib/walk/streetLoop';
import { makeCity, makeNode, type CityPlaceDef } from './gridCity';
import type { WalkInput, WalkStreetHints, WalkStreetFeature } from '@/lib/walk/types';

const DEFS: CityPlaceDef[] = [
  { id: 'park', name: 'Парк', category: 'park', east: 500, north: 0, rating: 4.5 },
  { id: 'cafe', name: 'Кафе', category: 'cafe', east: 0, north: 1000, rating: 4.2 },
];

function baseInput(): Omit<WalkInput, 'candidates'> {
  return {
    start: makeNode(0, 0),
    budgetMinutes: 90,
    categoryWeights: { park: 3, cafe: 2 },
    isLoop: true,
  };
}

const snapshot = (plans: unknown): string => JSON.stringify(plans);

describe('снапшот деградации: hasData=false идентичен прежним планам (S6)', () => {
  it('createWalkPlan: поля undefined → планы бит-в-бит совпадают с входом без полей', async () => {
    const { port, places } = makeCity(DEFS);
    const without = await createWalkPlan({ ...baseInput(), candidates: places }, port);
    const withUndefined = await createWalkPlan(
      { ...baseInput(), candidates: places, streetFeatures: undefined, streetHints: undefined },
      makeCity(DEFS).port,
    );

    expectOk(without);
    expectOk(withUndefined);
    expect(snapshot(withUndefined.plans)).toBe(snapshot(without.plans));
  });

  it('buildStreetLoop: hints hasData=false и все интересы 0 → прежняя геометрическая роза', async () => {
    const emptyHints: WalkStreetHints = { sectors: [], hasData: false };
    const zeroHints: WalkStreetHints = {
      sectors: Array.from({ length: 8 }, (_, i) => ({ azimuthDeg: (i + 0.5) * 45, interest: 0, point: null })),
      hasData: true,
    };

    const without = await buildStreetLoop({ start: makeNode(0, 0), budgetMinutes: 60, ports: makeCity(DEFS).port });
    const withEmpty = await buildStreetLoop({
      start: makeNode(0, 0),
      budgetMinutes: 60,
      ports: makeCity(DEFS).port,
      streetHints: emptyHints,
    });
    const withZero = await buildStreetLoop({
      start: makeNode(0, 0),
      budgetMinutes: 60,
      ports: makeCity(DEFS).port,
      streetHints: zeroHints,
    });

    expectOk(without);
    expectOk(withEmpty);
    expectOk(withZero);
    expect(withEmpty.plan.degraded).toEqual({ level: 'loop-only' });
    expect(withEmpty.plan.streetInterest).toBeUndefined();
    expect(snapshot(withEmpty.plan)).toBe(snapshot(without.plan));
    expect(snapshot(withZero.plan)).toBe(snapshot(without.plan));
  });

  it('лестница fallback: strict-отказ → L3 план с undefined-полями = план без полей', async () => {
    // Остров (island: true) не связан с сетью: строгий движок и L2 откажут,
    // лестница дойдёт до L3 — сравниваем её план с/без street-полей.
    const islandDefs: CityPlaceDef[] = [
      { id: 'island', name: 'Остров', category: 'park', east: 500, north: 0, island: true },
    ];
    const input = (features?: WalkStreetFeature[], hints?: WalkStreetHints): WalkInput => ({
      start: makeNode(0, 0),
      budgetMinutes: 90,
      categoryWeights: { park: 3 },
      candidates: makeCity(islandDefs).places,
      isLoop: true,
      ...(features ? { streetFeatures: features } : {}),
      ...(hints ? { streetHints: hints } : {}),
    });

    const without = await buildWalkWithFallback(input(), makeCity(islandDefs).port, { strict: { ok: false, failure: { code: 'NO_ROUTE', detail: 'остров не связан с сетью' } } });
    const withUndefined = await buildWalkWithFallback(input([], undefined), makeCity(islandDefs).port, { strict: { ok: false, failure: { code: 'NO_ROUTE', detail: 'остров не связан с сетью' } } });

    expectOk(without);
    expectOk(withUndefined);
    expect(snapshot(withUndefined.plans)).toBe(snapshot(without.plans));
  });
});

type Outcome = { ok: true } | { ok: false; failure: { code: string; detail: string } };

function expectOk<T extends Outcome>(res: T): asserts res is T & { ok: true } {
  if (!res.ok) throw new Error(`ожидался план, получен отказ ${res.failure.code}: ${res.failure.detail}`);
}
