// src/lib/walk/__tests__/replaceStop.test.ts
// Сценарии локальной замены остановки на сетке-городе (синтетика — gridCity.ts).
//
// Геометрия сценария (узлы манхэттенской сетки, 75 м/мин):
//   старт (0,0) → парк A (0,600) → кафе Б (600,0) → старт, бюджет 85:
//   текущее кольцо 2400 м ≈ 32 мин + 45 стоянок ≈ 77 мин (в ±10%; ходьба
//   32 ≥ 29.75 = 35% бюджета — walk_share у базового плана пройден).
// Кандидаты:
//   cafe_se (600,-600): замена Б → кольцо 3600 м ≈ 93 мин — в допуске, все гейты;
//   park_s (0,-600):    замена Б → 77 мин, но нога парк А → парк С идёт по
//                       той же оси x=0 через старт — гейт улиц провален
//                       (фолбэк: 4 из 5, допуск «база − 1»);
//   island, far_cafe — отсекаются матрицей до заказов route.

import { describe, expect, it } from 'vitest';
import { replaceStopInPlan, type ReplaceablePlan, type ReplaceStopInput } from '../replaceStop';
import { evaluateGates } from '../gates';
import { makeCity, makeNode, type CityPlaceDef } from './gridCity';
import type { WalkRoutingPort } from '../ports';
import type { WalkLatLng, WalkLeg, WalkPlan, WalkStop } from '../types';

const BUDGET = 85;

const DEFS: CityPlaceDef[] = [
  { id: 'park_a', name: 'Парк А', category: 'park', east: 0, north: 600, rating: 4.5 },
  { id: 'cafe_b', name: 'Кафе Б', category: 'cafe', east: 600, north: 0 },
  { id: 'cafe_se', name: 'Кафе на юго-востоке', category: 'cafe', east: 600, north: -600 },
  { id: 'park_s', name: 'Парк на юге', category: 'park', east: 0, north: -600 },
  { id: 'island', name: 'Музей на острове', category: 'museum', east: -600, north: -600, island: true },
  { id: 'far_cafe', name: 'Далёкое кафе', category: 'cafe', east: 3000, north: 0 },
];

const START: WalkLatLng = makeNode(0, 0);

type FakeCity = ReturnType<typeof makeCity>;

function placeById(city: FakeCity, id: string): FakeCity['places'][number] {
  const place = city.places.find((p) => p.id === id);
  if (!place) throw new Error(`фикстура ${id} не найдена`);
  return place;
}

/** Текущий план: старт → парк А → кафе Б → старт, ноги по реальному порту сетки. */
async function buildCurrentPlan(
  city: FakeCity,
  opts: { withGates?: boolean; withLegs?: boolean } = {},
): Promise<ReplaceablePlan> {
  const stops: WalkStop[] = [
    {
      place: placeById(city, 'park_a'),
      stayMinutes: 25,
      reason: 'Лучший скор категории «парк» в радиусе',
      reasonEn: 'Best-scoring park in the radius',
    },
    {
      place: placeById(city, 'cafe_b'),
      stayMinutes: 20,
      reason: 'высокий рейтинг (4.8)',
      reasonEn: 'high rating (4.8)',
    },
  ];
  const plan: ReplaceablePlan & Pick<WalkPlan, 'score'> = { stops, score: 5 };

  // Ноги считаются всегда (метрики гейтов честные), но в план кладутся
  // только когда клиент их «передал»: без legs движок перестраивает петлю сам.
  const path: WalkLatLng[] = [START, ...stops.map((s) => s.place.coordinates), START];
  const legs: WalkLeg[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const segment = await city.port.route({ waypoints: [path[i], path[i + 1]] });
    legs.push({
      from: path[i],
      to: path[i + 1],
      distanceMeters: segment.distanceMeters,
      durationMinutes: segment.durationSeconds / 60,
      geometry: segment.geometry ?? [],
    });
  }
  if (opts.withLegs !== false) plan.legs = legs;

  if (opts.withGates !== false) {
    const totalWalkMinutes = legs.reduce((sum, l) => sum + l.durationMinutes, 0);
    const totalStayMinutes = stops.reduce((sum, s) => sum + s.stayMinutes, 0);
    const gates = evaluateGates({
      budgetMinutes: BUDGET,
      totalMinutes: totalWalkMinutes + totalStayMinutes,
      stops,
      legDurations: legs.map((l) => l.durationMinutes),
      legGeometries: legs.map((l) => l.geometry),
      isLoop: true,
    });
    plan.gates = gates;
  }
  return plan;
}

function makeInput(
  city: FakeCity,
  currentPlan: ReplaceablePlan,
  overrides: Partial<ReplaceStopInput> = {},
): ReplaceStopInput {
  return {
    start: START,
    budgetMinutes: BUDGET,
    categoryWeights: { park: 3, cafe: 2, museum: 2, viewpoint: 1 },
    currentPlan,
    replaceIndex: 1, // кафе Б — последняя остановка, замыкание в старт
    candidates: [placeById(city, 'cafe_se')],
    ...overrides,
  };
}

function expectOk(res: Awaited<ReturnType<typeof replaceStopInPlan>>): asserts res is Extract<typeof res, { ok: true }> {
  if (!res.ok) throw new Error(`ожидался план, получен отказ ${res.failure.code}: ${res.failure.detail}`);
}

function expectFail(res: Awaited<ReturnType<typeof replaceStopInPlan>>): asserts res is Extract<typeof res, { ok: false }> {
  if (res.ok) throw new Error('ожидался отказ, получен план');
}

/** Счётчик вызовов порта: дешёвые отказы не должны платить за route. */
function countingPort(port: WalkRoutingPort): { port: WalkRoutingPort; calls: { route: number; matrix: number } } {
  const calls = { route: 0, matrix: 0 };
  return {
    calls,
    port: {
      route: async (req: { waypoints: WalkLatLng[] }) => {
        calls.route += 1;
        return port.route(req);
      },
      matrix: async (sources: WalkLatLng[], targets: WalkLatLng[]) => {
        calls.matrix += 1;
        return port.matrix(sources, targets);
      },
    } satisfies WalkRoutingPort,
  };
}

describe('replaceStopInPlan: локальная замена остановки петли', () => {
  it('последняя остановка: ноги соседей реиспользованы по ссылке, бюджет в допуске, гейты pass', async () => {
    const city = makeCity(DEFS);
    const currentPlan = await buildCurrentPlan(city);
    const res = await replaceStopInPlan(makeInput(city, currentPlan), city.port);
    expectOk(res);

    const plan = res.plan;
    expect(plan.allGatesPass).toBe(true);
    // Порядок сохранившихся остановок не меняется, заменяемая стоит на месте.
    expect(plan.stops.map((s) => s.place.id)).toEqual(['park_a', 'cafe_se']);
    expect(plan.stops[0]).toBe(currentPlan.stops[0]);
    // Бюджет ±10%: новое кольцо ≈ 85 мин против 78.
    expect(plan.totalMinutes).toBeGreaterThanOrEqual(BUDGET * 0.9 - 1e-6);
    expect(plan.totalMinutes).toBeLessThanOrEqual(BUDGET * 1.1 + 1e-6);
    // Нога старт→парк не прилегала к заменяемой — объект переиспользован целиком.
    expect(plan.legs[0]).toBe(currentPlan.legs![0]);
    // Новые ноги сшивают prev→candidate→старт (петля замыкается).
    expect(plan.legs[1].from).toEqual(currentPlan.stops[0].place.coordinates);
    expect(plan.legs[1].to).toEqual(placeById(city, 'cafe_se').coordinates);
    expect(plan.legs[2].to).toEqual(START);
    expect(plan.legs).toHaveLength(currentPlan.legs!.length);
    // Причина новой остановки непуста (гейт якорей) и EN-твин рядом.
    expect(plan.stops[1].reason.trim().length).toBeGreaterThan(0);
    expect(plan.stops[1].reasonEn!.trim().length).toBeGreaterThan(0);
    // Скор по формуле createWalkPlan: Σ весов (3+2) минус длинные ноги (0).
    expect(plan.score).toBe(5);
  });

  it('первая остановка: prev — старт, замыкающая нога переиспользована', async () => {
    const city = makeCity(DEFS);
    const currentPlan = await buildCurrentPlan(city);
    const res = await replaceStopInPlan(
      makeInput(city, currentPlan, {
        replaceIndex: 0,
        candidates: [placeById(city, 'park_s')],
      }),
      city.port,
    );
    expectOk(res);

    const plan = res.plan;
    expect(plan.allGatesPass).toBe(true);
    expect(plan.stops.map((s) => s.place.id)).toEqual(['park_s', 'cafe_b']);
    // prev = старт (край петли), нога старт→кандидат построена заново.
    expect(plan.legs[0].from).toEqual(START);
    expect(plan.legs[0].to).toEqual(placeById(city, 'park_s').coordinates);
    expect(plan.legs[0].from).not.toEqual(plan.legs[0].to);
    // Нога кафе→старт не прилегала к заменяемой — переиспользована по ссылке.
    expect(plan.legs[2]).toBe(currentPlan.legs![2]);
    expect(plan.totalMinutes).toBeGreaterThanOrEqual(BUDGET * 0.9 - 1e-6);
    expect(plan.totalMinutes).toBeLessThanOrEqual(BUDGET * 1.1 + 1e-6);
  });

  it('кандидаты-дубли уже стоящих остановок пропускаются (id и координаты)', async () => {
    const city = makeCity(DEFS);
    const currentPlan = await buildCurrentPlan(city);
    const dupId = { ...placeById(city, 'cafe_se'), id: 'park_a', name: 'Дубль по id' };
    const dupCoords = {
      ...placeById(city, 'cafe_se'),
      id: 'fresh_id',
      name: 'Дубль по координатам',
      coordinates: placeById(city, 'park_a').coordinates,
    };
    const res = await replaceStopInPlan(
      makeInput(city, currentPlan, {
        candidates: [dupId, dupCoords, placeById(city, 'cafe_se')],
      }),
      city.port,
    );
    expectOk(res);
    expect(res.plan.stops.map((s) => s.place.id)).toEqual(['park_a', 'cafe_se']);
  });

  it('ни один кандидат не подходит — честный отказ без заказов route', async () => {
    const city = makeCity(DEFS);
    const currentPlan = await buildCurrentPlan(city);
    const counted = countingPort(city.port);
    const res = await replaceStopInPlan(
      makeInput(city, currentPlan, {
        candidates: [placeById(city, 'island'), placeById(city, 'far_cafe')],
      }),
      counted.port,
    );
    expectFail(res);
    expect(res.failure.code).toBe('NO_CANDIDATES');
    expect(res.failure.detail.length).toBeGreaterThan(0);
    // Остров (null-матрица) и далёкое кафе (нога > 25 мин) отсечены матрицей:
    // ни одного route-запроса не потрачено.
    expect(counted.calls.matrix).toBe(2);
    expect(counted.calls.route).toBe(0);
  });

  it('отказ называет самую информативную причину, а не последнего кандидата', async () => {
    const city = makeCity(DEFS);
    const currentPlan = await buildCurrentPlan(city);
    // Далёкое кафе даёт конкретную метрику (нога > 25 мин), дубль после него —
    // пустое «уже стоит в плане»: в детале должен остаться первый.
    const dup = { ...placeById(city, 'cafe_se'), id: 'park_a', name: 'Дубль по id' };
    const res = await replaceStopInPlan(
      makeInput(city, currentPlan, {
        candidates: [placeById(city, 'far_cafe'), dup],
      }),
      city.port,
    );
    expectFail(res);
    expect(res.failure.code).toBe('NO_CANDIDATES');
    expect(res.failure.detail).toContain('Далёкое кафе');
    expect(res.failure.detail).not.toContain('Дубль по id');
  });

  it('фолбэк: база 3 гейта принимает план с проваленным гейтом улиц', async () => {
    const city = makeCity(DEFS);
    // park_s вместо кафе Б: бюджет сходится, но ноги retracing по east-0.
    const currentPlan = await buildCurrentPlan(city, { withGates: false });
    const res = await replaceStopInPlan(
      makeInput(city, currentPlan, {
        candidates: [placeById(city, 'park_s')],
        currentGatesPassed: 3,
      }),
      city.port,
    );
    expectOk(res);
    expect(res.plan.allGatesPass).toBe(false);
    const street = res.plan.gates.find((g) => g.gate === 'loop_no_repeat_street');
    expect(street?.pass).toBe(false);
    expect(res.plan.gates.find((g) => g.gate === 'budget')?.pass).toBe(true);
  });

  it('фолбэк допускает один деградационный гейт: при базе 4 принимается план с провалом улиц', async () => {
    const city = makeCity(DEFS);
    // У текущего плана все гейты pass (база 4). Кандидат park_s вносит новые
    // ноги с retracing — гейт улиц падает, но требовать «не хуже базы» целиком
    // значило бы отказывать почти всегда: замена — единственное место, где
    // геометрия кольца меняется. Допуск ровно одного гейта (база − 1).
    const currentPlan = await buildCurrentPlan(city);
    expect(currentPlan.gates!.every((g) => g.pass)).toBe(true);
    const res = await replaceStopInPlan(
      makeInput(city, currentPlan, { candidates: [placeById(city, 'park_s')] }),
      city.port,
    );
    expectOk(res);
    expect(res.plan.allGatesPass).toBe(false);
    expect(res.plan.gates.find((g) => g.gate === 'loop_no_repeat_street')?.pass).toBe(false);
    expect(res.plan.gates.find((g) => g.gate === 'budget')?.pass).toBe(true);
  });

  it('ног не передано — движок перестраивает всю петлю через порт', async () => {
    const city = makeCity(DEFS);
    const currentPlan = await buildCurrentPlan(city, { withLegs: false });
    const res = await replaceStopInPlan(makeInput(city, currentPlan), city.port);
    expectOk(res);

    const plan = res.plan;
    expect(plan.legs).toHaveLength(3);
    expect(plan.legs[0].from).toEqual(START);
    expect(plan.legs[plan.legs.length - 1].to).toEqual(START);
    for (const leg of plan.legs) {
      expect(leg.geometry.length).toBeGreaterThanOrEqual(2);
      expect(leg.durationMinutes).toBeGreaterThan(0);
    }
    expect(plan.allGatesPass).toBe(true);
    expect(plan.totalMinutes).toBeLessThanOrEqual(BUDGET * 1.1 + 1e-6);
  });

  it('детерминизм: тот же вход — тот же результат бит-в-бит', async () => {
    const city = makeCity(DEFS);
    const currentPlan = await buildCurrentPlan(city);
    const input = makeInput(city, currentPlan, {
      candidates: [placeById(city, 'park_s'), placeById(city, 'cafe_se')],
    });
    const a = await replaceStopInPlan(input, city.port);
    const b = await replaceStopInPlan(input, city.port);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('categoryStayMinutes протекает в новую остановку: архетипные 30 вместо дефолтных 25', async () => {
    const city = makeCity(DEFS);
    const currentPlan = await buildCurrentPlan(city);
    // Замена парка А на парк-кандидата с архетипной таблицей {park: 30}:
    // стоянка новой остановки — из архетипа, как в сборке buildQuickWalk.
    const res = await replaceStopInPlan(
      makeInput(city, currentPlan, {
        replaceIndex: 0,
        candidates: [placeById(city, 'park_s')],
        categoryStayMinutes: { park: 30, cafe: 20 },
      }),
      city.port,
    );
    expectOk(res);
    expect(res.plan.stops[0].place.id).toBe('park_s');
    expect(res.plan.stops[0].stayMinutes).toBe(30);
    // Сохранившаяся остановка — стоянка со снапшота, не пересчитывается.
    expect(res.plan.stops[1].stayMinutes).toBe(20);
  });

  it('некорректный вход: replaceIndex вне плана и пустой бюджет — INVALID_INPUT', async () => {
    const city = makeCity(DEFS);
    const currentPlan = await buildCurrentPlan(city);

    const badIndex = await replaceStopInPlan(
      makeInput(city, currentPlan, { replaceIndex: 5 }),
      city.port,
    );
    expectFail(badIndex);
    expect(badIndex.failure.code).toBe('INVALID_INPUT');

    const badBudget = await replaceStopInPlan(
      makeInput(city, currentPlan, { budgetMinutes: 0 }),
      city.port,
    );
    expectFail(badBudget);
    expect(badBudget.failure.code).toBe('INVALID_INPUT');
  });
});
