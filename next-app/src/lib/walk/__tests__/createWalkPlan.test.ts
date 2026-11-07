// src/lib/walk/__tests__/createWalkPlan.test.ts
// Сценарные и инвариантные тесты движка на сетке-городе (всё оффлайн,
// синтетика задокументирована в gridCity.ts и docs/walk-engine.md §14).

import { describe, it, expect } from 'vitest';
import { createWalkPlan } from '@/lib/walk/createWalkPlan';
import { evaluateGates } from '@/lib/walk/gates';
import { mulberry32 } from '@/lib/walk/internal/rng';
import { makeCity, makeNode, type CityPlaceDef } from './gridCity';
import type { WalkInput, WalkPlace, WalkPlanResult } from '@/lib/walk/types';

function expectOk(res: WalkPlanResult): asserts res is Extract<WalkPlanResult, { ok: true }> {
  if (!res.ok) throw new Error(`ожидался план, получен отказ ${res.failure.code}: ${res.failure.detail}`);
}

function expectFail(res: WalkPlanResult): asserts res is Extract<WalkPlanResult, { ok: false }> {
  if (res.ok) throw new Error(`ожидался отказ, получено планов: ${res.plans.length}`);
}

// Базовый сценарий петли: бюджет 90 → R ≈ 1012 м — в зоне осевые узлы (500 м),
// диагональ (707 м) и музей (1 км); музей отсекается бюджетом: кольцо с ним
// 110 мин против лимита 99.
const LOOP_DEFS: CityPlaceDef[] = [
  { id: 'park', name: 'Парк', category: 'park', east: 0, north: 500, rating: 4.5 },
  { id: 'cafe', name: 'Кафе', category: 'cafe', east: 500, north: 0 },
  { id: 'cafe2', name: 'Второе кафе', category: 'cafe', east: 500, north: 500 },
  { id: 'museum', name: 'Музей', category: 'museum', east: 1000, north: 0, rating: 4.8 },
  { id: 'rest', name: 'Ресторан', category: 'restaurant', east: -500, north: 0 },
];

// Сценарий А→Б: старт (0,0) → финиш (2000,0), коридор W = 600 м;
// смотровая в (4000,500) — за коридором. Бюджет 80: пара кафе+парк даёт 85 мин.
const AB_DEFS: CityPlaceDef[] = [
  { id: 'cafe', name: 'Кафе у пути', category: 'cafe', east: 1000, north: 0 },
  { id: 'park', name: 'Парк у пути', category: 'park', east: 1000, north: 500, rating: 4.5 },
  { id: 'museum', name: 'Музей у пути', category: 'museum', east: 1500, north: 500 },
  { id: 'rest', name: 'Ресторан сзади', category: 'restaurant', east: -500, north: 0 },
  { id: 'viewpoint', name: 'Смотровая в стороне', category: 'viewpoint', east: 4000, north: 500 },
];

// Остров-музей в диагональном узле: в зоне по прямой, но null в матрице.
const ISLAND_DEFS: CityPlaceDef[] = [
  { id: 'park', name: 'Парк', category: 'park', east: 0, north: 500, rating: 4.5 },
  { id: 'cafe', name: 'Кафе', category: 'cafe', east: 500, north: 0 },
  { id: 'cafe2', name: 'Второе кафе', category: 'cafe', east: 500, north: 500 },
  { id: 'island', name: 'Музей на острове', category: 'museum', east: -500, north: -500, island: true },
  { id: 'rest', name: 'Ресторан', category: 'restaurant', east: -500, north: 0 },
];

function setup(
  defs: CityPlaceDef[],
  overrides: Partial<WalkInput> = {},
): { input: WalkInput; port: ReturnType<typeof makeCity>['port'] } {
  const { port, places } = makeCity(defs);
  const input: WalkInput = {
    start: makeNode(0, 0),
    budgetMinutes: 90,
    categoryWeights: { park: 3, cafe: 2, museum: 2, restaurant: 1 },
    candidates: places,
    isLoop: true,
    ...overrides,
  };
  return { input, port };
}

describe('createWalkPlan: петля', () => {
  it('бюджет соблюдён, гейты pass, петля замкнута, причины заданы', async () => {
    const { input, port } = setup(LOOP_DEFS);
    const res = await createWalkPlan(input, port);
    expectOk(res);

    expect(res.plans.length).toBeGreaterThanOrEqual(2);
    expect(res.plans.length).toBeLessThanOrEqual(3);

    const best = res.plans[0];
    expect(best.allGatesPass).toBe(true);
    expect(best.gates.map((g) => g.gate)).toEqual([
      'budget',
      'anchors',
      'long_legs',
      'loop_no_repeat_street',
    ]);

    // Бюджет ±10%: план 91.7 мин против бюджета 90.
    expect(best.totalMinutes).toBeGreaterThanOrEqual(81 - 1e-6);
    expect(best.totalMinutes).toBeLessThanOrEqual(99 + 1e-6);

    // ≥ 2 якоря с непустой причиной; stay по таблице (парк 25, кафе 20).
    expect(best.stops.length).toBeGreaterThanOrEqual(2);
    for (const stop of best.stops) {
      expect(stop.reason.trim().length).toBeGreaterThan(0);
      const expectedStay = stop.place.category === 'park' ? 25 : 20;
      expect(stop.stayMinutes).toBe(expectedStay);
    }

    // Петля замыкается в старт.
    expect(best.legs[0].from).toEqual(input.start);
    expect(best.legs[best.legs.length - 1].to).toEqual(input.start);

    // Музей в 1 км не попал ни в один план (зона и бюджет).
    const names = res.plans.flatMap((p) => p.stops.map((s) => s.place.id));
    expect(names).not.toContain('museum');

    // Сортировка альтернатив: после первого провалившегося все провалены.
    for (let i = 1; i < res.plans.length; i++) {
      if (!res.plans[i - 1].allGatesPass) {
        expect(res.plans[i].allGatesPass).toBe(false);
      }
    }

    // Джиттер живой: варианты различаются скором (веса перемножены по-разному).
    expect(new Set(res.plans.map((p) => p.score)).size).toBeGreaterThanOrEqual(2);
  });

  it('детерминизм: тот же вход — тот же результат бит-в-бит', async () => {
    const a = await createWalkPlan(setup(LOOP_DEFS).input, makeCity(LOOP_DEFS).port);
    const b = await createWalkPlan(setup(LOOP_DEFS).input, makeCity(LOOP_DEFS).port);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('нулевой вес категории исключает её кандидатов', async () => {
    const { input, port } = setup(LOOP_DEFS, {
      categoryWeights: { park: 0, cafe: 2 },
    });
    const res = await createWalkPlan(input, port);
    expectOk(res);
    const ids = res.plans.flatMap((p) => p.stops.map((s) => s.place.id));
    expect(ids).not.toContain('park');
    expect(ids).not.toContain('rest');
  });
});

describe('createWalkPlan: А→Б', () => {
  it('оба конца зафиксированы, якоря из коридора, чужие не влезли', async () => {
    const { input, port } = setup(AB_DEFS, {
      end: makeNode(2000, 0),
      budgetMinutes: 80,
      isLoop: false,
    });
    const res = await createWalkPlan(input, port);
    expectOk(res);

    const best = res.plans[0];
    expect(best.allGatesPass).toBe(true);
    expect(best.stops.length).toBe(2);
    const categories = new Set(best.stops.map((s) => s.place.category));
    expect(categories.has('cafe')).toBe(true);
    expect(categories.has('park')).toBe(true);

    expect(best.legs[0].from).toEqual(input.start);
    expect(best.legs[best.legs.length - 1].to).toEqual(input.end!);
    // 3000 м ходьбы (40 мин) + 25 + 20 stay = 85 мин, в [72, 88].
    expect(best.totalMinutes).toBeCloseTo(85, 6);

    const ids = res.plans.flatMap((p) => p.stops.map((s) => s.place.id));
    expect(ids).not.toContain('viewpoint');
  });

  it('пустой коридор → чистый маршрут с честно упавшим anchors', async () => {
    const { input, port } = setup(
      [
        { id: 'far1', name: 'Далеко 1', category: 'cafe', east: 500, north: 2000 },
        { id: 'far2', name: 'Далеко 2', category: 'park', east: 2500, north: 2000 },
      ],
      { end: makeNode(3000, 0), budgetMinutes: 44, isLoop: false },
    );
    const res = await createWalkPlan(input, port);
    expectOk(res);

    const best = res.plans[0];
    expect(best.stops.length).toBe(0);
    expect(best.legs.length).toBe(1);
    expect(best.legs[0].from).toEqual(input.start);
    expect(best.legs[0].to).toEqual(input.end!);

    const byName = Object.fromEntries(best.gates.map((g) => [g.gate, g]));
    expect(byName.budget.pass).toBe(true); // 40 мин в [39.6, 48.4]
    expect(byName.anchors.pass).toBe(false);
    expect(byName.long_legs.pass).toBe(false); // 40 мин одним перегоном
    expect(byName.loop_no_repeat_street).toBeUndefined();
  });

  it('финиш на острове → NO_ROUTE', async () => {
    const { input, port } = setup(
      [
        { id: 'cafe', name: 'Кафе', category: 'cafe', east: 500, north: 0 },
        { id: 'goal', name: 'Финиш-остров', category: 'attraction', east: 2000, north: 0, island: true },
      ],
      { end: makeNode(2000, 0), budgetMinutes: 80, isLoop: false },
    );
    const res = await createWalkPlan(input, port);
    expectFail(res);
    expect(res.failure.code).toBe('NO_ROUTE');
  });
});

describe('createWalkPlan: честные отказы', () => {
  it('петля: крошечный бюджет → NOT_ENOUGH_TIME', async () => {
    const { input, port } = setup(LOOP_DEFS, { budgetMinutes: 5 });
    const res = await createWalkPlan(input, port);
    expectFail(res);
    expect(res.failure.code).toBe('NOT_ENOUGH_TIME');
  });

  it('петля: зона не пуста, но минималка не влезает → NOT_ENOUGH_TIME', async () => {
    // Бюджет 45 → лимит 49.5; stay переопределён на 45 минут:
    // минимальный выход до кафе и обратно 13.3+45 = 58.3 > лимита.
    const { input, port } = setup(LOOP_DEFS, {
      budgetMinutes: 45,
      categoryStayMinutes: { cafe: 45, park: 45, restaurant: 45 },
    });
    const res = await createWalkPlan(input, port);
    expectFail(res);
    expect(res.failure.code).toBe('NOT_ENOUGH_TIME');
  });

  it('петля: кандидаты вне радиуса → NO_CANDIDATES', async () => {
    const { input, port } = setup(
      [
        { id: 'c1', name: 'Кафе 1', category: 'cafe', east: 1500, north: 0 },
        { id: 'c2', name: 'Кафе 2', category: 'cafe', east: 1500, north: 500 },
      ],
      { budgetMinutes: 90 },
    );
    const res = await createWalkPlan(input, port);
    expectFail(res);
    expect(res.failure.code).toBe('NO_CANDIDATES');
  });

  it('петля: в бюджет влезает один якорь → NO_CANDIDATES (метрика требует 2)', async () => {
    // Бюджет 50 → лимит 55: одиночный выход 38.3 влезает, пара (71.7) — нет.
    const { input, port } = setup(LOOP_DEFS, { budgetMinutes: 50 });
    const res = await createWalkPlan(input, port);
    expectFail(res);
    expect(res.failure.code).toBe('NO_CANDIDATES');
    expect(res.failure.detail).toContain('один якорь');
  });

  it('А→Б: прямой путь длиннее бюджета → NOT_ENOUGH_TIME', async () => {
    const { input, port } = setup(AB_DEFS, {
      end: makeNode(5000, 0),
      budgetMinutes: 30,
      isLoop: false,
    });
    const res = await createWalkPlan(input, port);
    expectFail(res);
    expect(res.failure.code).toBe('NOT_ENOUGH_TIME');
  });

  it('петля: веса не совпадают ни с одной категорией → NO_CANDIDATES без «Infinity»', async () => {
    const { input, port } = setup(LOOP_DEFS, { categoryWeights: { viewpoint: 3 } });
    const res = await createWalkPlan(input, port);
    expectFail(res);
    expect(res.failure.code).toBe('NO_CANDIDATES');
    expect(res.failure.detail).not.toContain('Infinity');
  });
});

describe('createWalkPlan: деградация по null-ячейкам', () => {
  it('остров-кандидат исключается молча, план строится из остальных', async () => {
    // Бюджет 75 → R ≈ 844 м, лимит 82.5: пара парк+кафе даёт 71.7 — гейты pass.
    const { input, port } = setup(ISLAND_DEFS, { budgetMinutes: 75 });
    const res = await createWalkPlan(input, port);
    expectOk(res);

    expect(res.plans.length).toBeGreaterThanOrEqual(1);
    const ids = res.plans.flatMap((p) => p.stops.map((s) => s.place.id));
    expect(ids).not.toContain('island');

    const best = res.plans[0];
    expect(best.allGatesPass).toBe(true);
    expect(best.totalMinutes).toBeCloseTo(71.66666666666667, 6);
  });
});

describe('createWalkPlan: валидация входа', () => {
  const cases: Array<[string, Partial<WalkInput>]> = [
    ['А→Б без финиша', { isLoop: false }],
    ['нулевой бюджет', { budgetMinutes: 0 }],
    ['пустые веса', { categoryWeights: {} }],
    ['вес без положительных', { categoryWeights: { park: 0, cafe: -1 } }],
    ['скорость вне диапазона', { walkingSpeedKmh: 20 }],
    ['плохие координаты старта', { start: [999, 999] as unknown as WalkInput['start'] }],
  ];
  for (const [name, override] of cases) {
    it(`${name} → INVALID_INPUT`, async () => {
      const { input, port } = setup(LOOP_DEFS, override);
      const res = await createWalkPlan(input, port);
      expectFail(res);
      expect(res.failure.code).toBe('INVALID_INPUT');
    });
  }
});

describe('createWalkPlan: случайные сиды (инварианты)', () => {
  const CATEGORIES = ['cafe', 'park', 'museum', 'restaurant'];

  async function runCase(seed: number): Promise<string> {
    const rng = mulberry32(seed * 7919 + 1);
    const defs: CityPlaceDef[] = [];
    for (let i = 0; i < 8; i++) {
      defs.push({
        id: `p${i}`,
        name: `Место ${i}`,
        category: CATEGORIES[Math.floor(rng() * CATEGORIES.length)],
        east: (Math.floor(rng() * 9) - 4) * 500,
        north: (Math.floor(rng() * 9) - 4) * 500,
      });
    }
    const isLoop = rng() < 0.5;
    const weights: Record<string, number> = {};
    for (const category of CATEGORIES) {
      weights[category] = rng() < 0.2 ? 0 : 0.5 + rng() * 2.5;
    }
    weights.cafe = Math.max(weights.cafe, 1); // хотя бы один положительный вес
    const { port, places } = makeCity(defs);
    const input: WalkInput = {
      start: makeNode(0, 0),
      end: isLoop ? undefined : makeNode(2000, 0),
      budgetMinutes: 40 + Math.floor(rng() * 80),
      categoryWeights: weights,
      candidates: places,
      isLoop,
    };
    const res = await createWalkPlan(input, port);

    if (!res.ok) {
      expect(['NOT_ENOUGH_TIME', 'NO_CANDIDATES', 'NO_ROUTE']).toContain(res.failure.code);
      return JSON.stringify(res);
    }

    for (const plan of res.plans) {
      // Жёсткий инвариант: подбор никогда не превышает 1.1·бюджета.
      expect(plan.totalMinutes).toBeLessThanOrEqual(input.budgetMinutes * 1.1 + 1e-6);

      // Гейты согласованы с фактами плана (пересчёт тем же кодом гейтов).
      const recomputed = evaluateGates({
        budgetMinutes: input.budgetMinutes,
        totalMinutes: plan.totalMinutes,
        stops: plan.stops,
        legDurations: plan.legs.map((l) => l.durationMinutes),
        legGeometries: plan.legs.map((l) => l.geometry),
        isLoop,
      });
      expect(recomputed).toEqual(plan.gates);

      // Тоталы сходятся: Σ ног + Σ stay.
      const walk = plan.legs.reduce((s, l) => s + l.durationMinutes, 0);
      const stay = plan.stops.reduce((s, st) => s + st.stayMinutes, 0);
      expect(plan.totalMinutes).toBeCloseTo(walk + stay, 9);

      if (isLoop) {
        expect(plan.stops.length).toBeGreaterThanOrEqual(2);
        expect(plan.legs[plan.legs.length - 1].to).toEqual(input.start);
      } else {
        expect(plan.legs[plan.legs.length - 1].to).toEqual(input.end!);
      }
    }
    return JSON.stringify(res);
  }

  it('бюджет ≤ 1.1·B, гейты согласованы, 120 сидов', async () => {
    for (let seed = 0; seed < 120; seed++) {
      await runCase(seed);
    }
  });

  it('детерминизм на случайных сидах', async () => {
    for (let seed = 0; seed < 5; seed++) {
      const first = await runCase(seed);
      const second = await runCase(seed);
      expect(second).toBe(first);
    }
  });
});

describe('createWalkPlan: поводки на типы (structural compat)', () => {
  it('GeoPlace-подобный объект с лишними полями принимается', async () => {
    const extra = {
      id: 'x1',
      name: 'Кафе с тегами',
      category: 'cafe',
      coordinates: makeNode(500, 0),
      address: 'ул. Сеточная, 1',
      tags: { outdoor_seating: 'yes' },
      indoor: false,
    } as unknown as WalkPlace;
    const second: WalkPlace = {
      id: 'x2',
      name: 'Парк с тегами',
      category: 'park',
      coordinates: makeNode(0, 500),
      rating: 4.7,
    };
    const { port } = makeCity([]);
    const res = await createWalkPlan(
      {
        start: makeNode(0, 0),
        budgetMinutes: 90,
        categoryWeights: { cafe: 2, park: 2 },
        candidates: [extra, second],
        isLoop: true,
      },
      port,
    );
    expectOk(res);
    expect(res.plans[0].stops.map((s) => s.place.id)).toContain('x1');
  });
});
