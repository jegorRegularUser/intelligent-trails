// src/lib/walk/__tests__/legAlternatives.test.ts
// Ноги с альтернативами (docs/walk-loop-quality.md R3.c): выбор движком
// непересекающегося маршрута на сетке-городе и юнит chooseLegVariant на
// синтетических полилиниях (частичные перекрытия 0.3–0.7) — без порта.

import { describe, expect, it } from 'vitest';
import { altInterestPolylinesForLeg, chooseLegVariant } from '@/lib/walk/createWalkPlan';
import { createWalkPlan } from '@/lib/walk/createWalkPlan';
import { makeCity, makeNode, type CityPlaceDef } from './gridCity';
import type { WalkPlanResult, WalkLatLng, WalkStreetFeature } from '@/lib/walk/types';

function expectOk(res: WalkPlanResult): asserts res is Extract<WalkPlanResult, { ok: true }> {
  if (!res.ok) throw new Error(`ожидался план, получен отказ ${res.failure.code}: ${res.failure.detail}`);
}

/** Горизонтальная «принятая» нога длиной L с шагом ~1/8 (общая для двух describe). */
const accepted: WalkLatLng[] = Array.from({ length: 9 }, (_, i) => [55.75, 37.6 + i * 0.001]);

/** Кандидат: идёт по accepted долю share длины, затем уходит на север. */
function partialLeg(share: number): WalkLatLng[] {
  const leg: WalkLatLng[] = [];
  const steps = 8;
  const sharedSteps = Math.round(steps * share);
  for (let i = 0; i <= sharedSteps; i++) leg.push([55.75, 37.6 + (i / steps) * 0.008]);
  const last = leg[leg.length - 1];
  leg.push([last[0] + 0.008, last[1]]);
  return leg;
}

const candidate = (minutes: number, geometry: WalkLatLng[], interestShare?: number) => ({
  distanceMeters: minutes * 75,
  durationMinutes: minutes,
  geometry,
  ...(interestShare !== undefined ? { interestShare } : {}),
});

describe('chooseLegVariant: синтетические полилинии (без порта)', () => {

  it('перекрытия 0.7 и 0.3 → выбран кандидат с меньшим пересечением', () => {
    const candidates = [
      candidate(20, partialLeg(0.7)), // индекс 0 — сильно пересекается
      candidate(20, partialLeg(0.3)),
    ];
    const chosen = chooseLegVariant(candidates, [accepted], () => true);
    expect(chosen).toBe(1);
  });

  it('равное пересечение → самый длинный влезающий; тайбрейкер — порядок входа', () => {
    const clean: WalkLatLng[] = [[55.76, 37.6], [55.76, 37.7]];
    const candidates = [
      candidate(15, clean),
      candidate(20, [[55.77, 37.6], [55.77, 37.7]]), // то же перекрытие (~0), длиннее
    ];
    expect(chooseLegVariant(candidates, [accepted], () => true)).toBe(1);
    // Потолок режет длинного → остаётся короткий.
    expect(chooseLegVariant(candidates, [accepted], (m) => m <= 15)).toBe(0);
  });

  it('ни один кандидат не влезает в потолок → -1 (основной остаётся как есть)', () => {
    const clean: WalkLatLng[] = [[55.76, 37.6], [55.76, 37.7]];
    const candidates = [candidate(30, clean), candidate(40, clean)];
    expect(chooseLegVariant(candidates, [accepted], (m) => m <= 10)).toBe(-1);
  });

  it('кандидаты без геометрии не вытесняют честные: сравнимый выигрывает при любом скоре', () => {
    const noGeometry = candidate(999, []); // пустая геометрия дала бы overlap 0
    const honest = candidate(10, partialLeg(0.1));
    expect(chooseLegVariant([noGeometry, honest], [accepted], () => true)).toBe(1);
    // Сравнимых нет вовсе → первый влезающий (основной первым).
    expect(chooseLegVariant([candidate(5, []), candidate(6, [])], [accepted], () => true)).toBe(0);
  });
});

describe('chooseLegVariant: интерес-тайбрейкер (S5)', () => {
  it('равное непересечение → бОльшая доля интереса побеждает; длина решает лишь при равном интересе', () => {
    const cleanA: WalkLatLng[] = [[55.76, 37.6], [55.76, 37.65]]; // чистая, короткая
    const cleanB: WalkLatLng[] = [[55.77, 37.6], [55.77, 37.7]]; // чистая, длиннее
    // Оба чистые (~0 перекрытия): интерес 0.1 vs 0.7 — интересный, хоть и
    // короче, выигрывает («прогулка, а не кратчайший путь»).
    expect(
      chooseLegVariant(
        [candidate(15, cleanA, 0.1), candidate(20, cleanB, 0.7)],
        [accepted],
        () => true,
      ),
    ).toBe(1);
    // Равный интерес → прежнее правило: длиннейший влезающий.
    expect(
      chooseLegVariant(
        [candidate(15, cleanA, 0.5), candidate(20, cleanB, 0.5)],
        [accepted],
        () => true,
      ),
    ).toBe(1);
    // interestShare отсутствует у всех (нет фич) → прежнее поведение.
    expect(
      chooseLegVariant([candidate(15, cleanA), candidate(20, cleanB)], [accepted], () => true),
    ).toBe(1);
  });

  it('непересечение первично: интересный, но пересекающийся вариант проигрывает', () => {
    const clean: WalkLatLng[] = [[55.76, 37.6], [55.76, 37.7]];
    const crossing = candidate(20, partialLeg(0.7), 0.9);
    const cleanLowInterest = candidate(15, clean, 0.1);
    expect(chooseLegVariant([crossing, cleanLowInterest], [accepted], () => true)).toBe(1);
  });

  it('префильтр S5/C11: bbox вокруг ноги, viewpoint/пустые мимо, топ-32 по весу класса', () => {
    const from: WalkLatLng = [55.75, 37.6];
    const to: WalkLatLng = [55.755, 37.61];
    const nearRing: WalkLatLng[] = [
      [55.752, 37.605],
      [55.753, 37.606],
      [55.7525, 37.6055],
      [55.752, 37.605],
    ];
    const farRing: WalkLatLng[] = [
      [55.78, 37.8],
      [55.781, 37.81],
      [55.78, 37.8],
    ];
    const many = Array.from({ length: 40 }, (_, i) => ({
      kind: (i % 3 === 0 ? 'pedestrian' : i % 3 === 1 ? 'green' : 'water') as 'pedestrian' | 'green' | 'water',
      geometry: nearRing,
    }));
    const features: WalkStreetFeature[] = [
      ...many,
      { kind: 'viewpoint', geometry: [from] }, // точка — не коридор, мимо тайбрейкера
      { kind: 'green', geometry: farRing }, // вне bbox ноги
      { kind: 'water', geometry: [] }, // пустая геометрия
    ];

    const polylines = altInterestPolylinesForLeg(features, from, to);
    expect(polylines.length).toBe(32); // топ-K из 40 кандидатов
    expect(polylines.every((p) => p.length >= 2 && p.length <= 64)).toBe(true);
    // Фичей нет — пусто (критерий (а) остаётся первичным).
    expect(altInterestPolylinesForLeg(undefined, from, to)).toEqual([]);
    expect(altInterestPolylinesForLeg([], from, to)).toEqual([]);
  });
});

// --- Движок на сетке-городе с routeAlternatives ---

// Петля: старт (0,0) → парк (500,0) → кафе (0,1000) → старт. Вторая нога
// (парк→кафе, манхэттен 1500 м ≈ 20 мин > порога 8) имеет два варианта:
// основной через (park.lat, cafe.lng) = старт — ВОЗВРАТ по ноге 1 и по ноге 3
// (перекрытие ~0.67, гейт улиц упал бы), зеркало через (cafe.lat, park.lng) —
// чистое. Движок обязан выбрать зеркало.
const ALT_DEFS: CityPlaceDef[] = [
  { id: 'park', name: 'Парк', category: 'park', east: 500, north: 0, rating: 4.5 },
  { id: 'cafe', name: 'Кафе', category: 'cafe', east: 0, north: 1000 },
];

describe('createWalkPlan: ноги с альтернативами', () => {
  it('перекрывающийся основной отклонён, выбрано зеркало (routeVariant alt)', async () => {
    const { port, places } = makeCity(ALT_DEFS, { alternatives: true });
    const res = await createWalkPlan(
      {
        start: makeNode(0, 0),
        budgetMinutes: 90,
        categoryWeights: { park: 3, cafe: 2 },
        candidates: places,
        isLoop: true,
      },
      port,
    );
    expectOk(res);

    const best = res.plans[0];
    expect(best.legs).toHaveLength(3);
    // Вторая нога: NN ведёт старт→парк→кафе→старт (парк ближе по матрице).
    const longLeg = best.legs[1];
    expect(longLeg.durationMinutes).toBeGreaterThan(8);
    expect(longLeg.routeVariant).toBe('alt');
    // Зеркало идёт через узел (500, 1000) — узел старта (0,0) в геометрии
    // ноги нет: возврат по уже пройденной улице отсечён.
    const mirrorCorner = makeNode(500, 1000);
    expect(
      longLeg.geometry.some(
        (p) => Math.abs(p[0] - mirrorCorner[0]) < 1e-9 && Math.abs(p[1] - mirrorCorner[1]) < 1e-9,
      ),
    ).toBe(true);
    expect(
      longLeg.geometry.some(
        (p) => Math.abs(p[0] - makeNode(0, 0)[0]) < 1e-9 && Math.abs(p[1] - makeNode(0, 0)[1]) < 1e-9,
      ),
    ).toBe(false);
    // Инвариант §12 не задет, гейты сходятся с фактом.
    expect(best.totalMinutes).toBeLessThanOrEqual(99 + 1e-6);
    expect(best.gates.find((g) => g.gate === 'loop_no_repeat_street')?.pass).toBe(true);
  });

  it('чистый основной лучше грязного зеркала — вариант не переключается', async () => {
    // Зеркальная конфигурация: старт (0,0) → кафе (0,500) → парк (1000,0) →
    // старт. Вторая нога (кафе→парк): основной через (500-lat, 1000-lng)
    // чист, зеркало через старт возвращает по ногам 1 и 3.
    const { port, places } = makeCity(
      [
        { id: 'park', name: 'Парк', category: 'park', east: 1000, north: 0, rating: 4.5 },
        { id: 'cafe', name: 'Кафе', category: 'cafe', east: 0, north: 500 },
      ],
      { alternatives: true },
    );
    const res = await createWalkPlan(
      {
        start: makeNode(0, 0),
        budgetMinutes: 90,
        categoryWeights: { park: 3, cafe: 2 },
        candidates: places,
        isLoop: true,
      },
      port,
    );
    expectOk(res);

    const best = res.plans[0];
    const longLeg = best.legs[1];
    expect(longLeg.durationMinutes).toBeGreaterThan(8);
    expect(longLeg.routeVariant).toBeUndefined(); // основной — перекрытие минимально
    const primaryCorner = makeNode(1000, 500);
    expect(
      longLeg.geometry.some(
        (p) => Math.abs(p[0] - primaryCorner[0]) < 1e-9 && Math.abs(p[1] - primaryCorner[1]) < 1e-9,
      ),
    ).toBe(true);
    expect(best.gates.find((g) => g.gate === 'loop_no_repeat_street')?.pass).toBe(true);
  });

  it('короткие ноги (< 8 мин) альтернатив не просят', async () => {
    const { port, places } = makeCity(
      [
        { id: 'park', name: 'Парк', category: 'park', east: 500, north: 0, rating: 4.5 },
        { id: 'cafe', name: 'Кафе', category: 'cafe', east: 500, north: 500 },
      ],
      { alternatives: true },
    );
    const res = await createWalkPlan(
      {
        start: makeNode(0, 0),
        budgetMinutes: 45,
        categoryWeights: { park: 3, cafe: 2 },
        categoryStayMinutes: { park: 5, cafe: 5 },
        candidates: places,
        isLoop: true,
      },
      port,
    );
    expectOk(res);
    // Все ноги петли ≤ 1000 м... на 45 мин зона 675 м: узлы (500,0) и (500,500)
    // в зоне; нога парк→кафе ровно 500 м (6.7 мин) — альтернативы не нужны,
    // routeVariant нигде не ставится.
    for (const leg of res.plans[0].legs) {
      expect(leg.routeVariant).toBeUndefined();
    }
  });
});
