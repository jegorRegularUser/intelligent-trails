// src/lib/walk/__tests__/garnish.test.ts
// Якоря-«гарниш» уличной петли (walk-engine.md §19.3) и замена гарниша
// street-плана (§19.6) на сетке-городе (синтетика — gridCity.ts): коридор
// 200 м, порядок «вес × качество», бюджет-гард 1.1·B (не влез — 0 якорей,
// план валиден), один якорь на ногу, кап категории, причины §9; замена
// меняет только две ноги, петля переезжает по ссылке.

import { describe, expect, it } from 'vitest';
import {
  attachGarnish,
  garnishScore,
  reserveMinutesForGarnish,
  selectGarnishCandidates,
  GARNISH_CORRIDOR_M,
  GARNISH_MAX_STOPS,
} from '../garnish';
import { replaceStreetGarnish } from '../replaceStop';
import { makeCity, makeNode, SPEED_M_PER_MIN } from './gridCity';
import type { WalkLeg, WalkPlace, WalkStop } from '../types';

// Кольцо 4×1000 м по узлам сетки: (0,0) → (1000,0) → (1000,1000) → (0,1000) → (0,0).
// Каждая нога — ровно 1000 м = 13.33 мин; вся петля 53.3 мин ходьбы.
const RING: Array<[number, number]> = [
  [0, 0],
  [1000, 0],
  [1000, 1000],
  [0, 1000],
];

function buildRingLegs(): WalkLeg[] {
  const nodes = RING.map(([e, n]) => makeNode(e, n));
  const path = [...nodes, nodes[0]];
  const legs: WalkLeg[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    legs.push({
      from: path[i],
      to: path[i + 1],
      distanceMeters: 1000,
      durationMinutes: 1000 / SPEED_M_PER_MIN,
      geometry: [path[i], path[i + 1]], // сетка: нога — прямая по линии узлов
    });
  }
  return legs;
}

const place = (id: string, category: string, east: number, north: number, rating?: number): WalkPlace => ({
  id,
  name: id,
  category,
  coordinates: makeNode(east, north),
  ...(rating !== undefined ? { rating } : {}),
});

const STAY = { cafe: 20, park: 25, shopping: 40 } as Record<string, number>;
const WEIGHTS = { cafe: 3, park: 2, shopping: 1 } as Record<string, number>;

const walkMinutesOf = (legs: WalkLeg[]): number => legs.reduce((sum, l) => sum + l.durationMinutes, 0);

describe('selectGarnishCandidates: коридор и порядок', () => {
  const legs = buildRingLegs();

  it('кандидат на ноге — годен с отклонением 0; дальше коридора — мимо', () => {
    const onLeg = selectGarnishCandidates({
      legs,
      candidates: [place('cafe', 'cafe', 500, 0)],
      categoryWeights: WEIGHTS,
    });
    expect(onLeg).toHaveLength(1);
    expect(onLeg[0].legIndex).toBe(0);
    expect(onLeg[0].deviationMeters).toBeLessThan(1);

    // 300 м к югу от нижней ноги — вне коридора 200 м.
    const far = selectGarnishCandidates({
      legs,
      candidates: [place('far', 'cafe', 500, -300)],
      categoryWeights: WEIGHTS,
    });
    expect(far).toHaveLength(0);
    expect(GARNISH_CORRIDOR_M).toBe(200);
  });

  it('порядок: вес × качество, тайбрейкеры — отклонение, затем вход', () => {
    const candidates = [
      place('shop_no_rating', 'shopping', 500, 1000), // вес 1, качество 1 → 1
      place('cafe_rated', 'cafe', 500, 0, 5), // вес 3 × (1+5/5) = 6
      place('cafe_plain', 'cafe', 999, 0), // вес 3 × 1 = 3, отклонение > 0
      place('park', 'park', 0, 500), // вес 2 × 1 = 2
    ];
    const ordered = selectGarnishCandidates({ legs, candidates, categoryWeights: WEIGHTS });
    expect(ordered.map((c) => c.place.id)).toEqual(['cafe_rated', 'cafe_plain', 'park', 'shop_no_rating']);
    expect(garnishScore(WEIGHTS, place('x', 'cafe', 0, 0))).toBe(3);
    expect(garnishScore(WEIGHTS, place('x', 'cafe', 0, 0, 5))).toBe(6);
    expect(garnishScore(WEIGHTS, place('x', 'unknown', 0, 0))).toBe(0); // нет веса — не годен
  });

  it('резерв: stay лучшего взвешенного + запас, потолки 0.5·B и 45 мин; пустой пул — 0', () => {
    expect(
      reserveMinutesForGarnish({
        candidates: [place('cafe', 'cafe', 500, 0), place('park', 'park', 0, 500)],
        categoryWeights: WEIGHTS,
        categoryStayMinutes: STAY,
        budgetMinutes: 90,
      }),
    ).toBe(25); // cafe 20 + 5
    // Потолок 0.5·B: B=30 → max 15, shopping 40+5=45 → 15.
    expect(
      reserveMinutesForGarnish({
        candidates: [place('shop', 'shopping', 500, 0)],
        categoryWeights: WEIGHTS,
        categoryStayMinutes: STAY,
        budgetMinutes: 30,
      }),
    ).toBe(15);
    expect(
      reserveMinutesForGarnish({
        candidates: [],
        categoryWeights: WEIGHTS,
        budgetMinutes: 90,
      }),
    ).toBe(0);
  });
});

describe('attachGarnish: вставка в петлю', () => {
  it('два якоря на разных ногах: разрез ног, порядок кольца, честные итоги и причины', async () => {
    const city = makeCity([]);
    const legs = buildRingLegs();
    const candidates = selectGarnishCandidates({
      legs,
      candidates: [place('cafe', 'cafe', 500, 0, 4.7), place('park', 'park', 0, 500)],
      categoryWeights: WEIGHTS,
    });
    const calls = { count: 0, max: 28 };

    const result = await attachGarnish({
      budgetMinutes: 90,
      legs,
      candidates,
      categoryWeights: WEIGHTS,
      categoryStayMinutes: STAY,
      ports: city.port,
      routeCalls: calls,
    });

    expect(result.added).toBe(2);
    expect(result.stops.map((s) => s.place.id)).toEqual(['cafe', 'park']); // порядок кольца
    expect(result.slots).toEqual([0, 4]); // park съехал на +1 после разреза ноги 0
    expect(result.legs).toHaveLength(6);
    // Нога 0 разрезана через кафе: (0,0) → (500,0) → (1000,0); детур 0 на сетке.
    expect(result.legs[0].to).toEqual(result.stops[0].place.coordinates);
    expect(result.legs[1].from).toEqual(result.stops[0].place.coordinates);
    // Парк на ноге 3 (исходной): (0,1000) → (0,500) → (0,0) — теперь слот 4.
    expect(result.legs[4].to).toEqual(result.stops[1].place.coordinates);
    // Итоги: ходьба 53.3 (детур 0), stay 45, total ≤ 1.1·90.
    expect(walkMinutesOf(result.legs)).toBeCloseTo(4000 / SPEED_M_PER_MIN, 6);
    expect(result.stops.reduce((sum, s) => sum + s.stayMinutes, 0)).toBe(45);
    expect(walkMinutesOf(result.legs) + 45).toBeLessThanOrEqual(90 * 1.1 + 1e-9);
    // Причины §9: лучший в категории (рейтинг — дополнение) + EN-твин.
    expect(result.stops[0].reason).toBe('Лучший выбор рядом, рейтинг 4.7');
    expect(result.stops[1].reason).toBe('Лучший выбор рядом');
    for (const stop of result.stops) {
      expect((stop.reasonEn ?? '').length).toBeGreaterThan(0);
    }
  });

  it('бюджет-гард: якорь, не влезающий в 1.1·B, пропускается — 0 якорей валиден', async () => {
    const city = makeCity([]);
    const legs = buildRingLegs(); // 53.3 мин ходьбы
    const candidates = selectGarnishCandidates({
      legs,
      candidates: [place('museum', 'museum', 500, 0)],
      categoryWeights: { museum: 3 },
    });
    const result = await attachGarnish({
      budgetMinutes: 60, // потолок 66: 53.3 + stay 45 (дефолтная таблица музея) — мимо
      legs,
      candidates,
      categoryWeights: { museum: 3 },
      ports: city.port,
      routeCalls: { count: 0, max: 28 },
    });
    expect(result.added).toBe(0);
    expect(result.stops).toHaveLength(0);
    expect(result.legs).toHaveLength(4); // петля не тронута
  });

  it('один якорь на ногу и кап GARNISH_MAX_STOPS=2; кап категории архетипа', async () => {
    const city = makeCity([]);
    const legs = buildRingLegs();
    // Три кафе на трёх разных ногах: кап категории 2 (дефолт движка) режет третье.
    const candidates = selectGarnishCandidates({
      legs,
      candidates: [
        place('cafe1', 'cafe', 500, 0),
        place('cafe2', 'cafe', 1000, 500),
        place('cafe3', 'cafe', 0, 500),
      ],
      categoryWeights: { cafe: 3 },
    });
    const result = await attachGarnish({
      budgetMinutes: 120, // потолок 132: 53.3 + 2×20 = 93.3 — влезает и третье бы влезло
      legs,
      candidates,
      categoryWeights: { cafe: 3 },
      ports: city.port,
      routeCalls: { count: 0, max: 28 },
    });
    expect(result.added).toBe(2);
    expect(result.stops.map((s) => s.place.id)).toEqual(['cafe1', 'cafe2']);
    expect(GARNISH_MAX_STOPS).toBe(2);
  });
});

describe('replaceStreetGarnish: замена гарниша без пересборки петли (§19.6)', () => {
  /** План с одним якорем-кафе на ноге 0: 6 ног кольца. */
  async function garnishPlan(): Promise<{ legs: WalkLeg[]; stops: WalkStop[] }> {
    const city = makeCity([]);
    const legs = buildRingLegs();
    const candidates = selectGarnishCandidates({
      legs,
      candidates: [place('cafe', 'cafe', 500, 0)],
      categoryWeights: WEIGHTS,
    });
    const result = await attachGarnish({
      budgetMinutes: 90,
      legs,
      candidates,
      categoryWeights: WEIGHTS,
      categoryStayMinutes: STAY,
      ports: city.port,
      routeCalls: { count: 0, max: 28 },
    });
    return { legs: result.legs, stops: result.stops };
  }

  it('якорь меняется, петля переезжает по ссылке, перестроены только две ноги', async () => {
    const city = makeCity([]);
    const { legs, stops } = await garnishPlan();
    expect(stops).toHaveLength(1);

    const result = await replaceStreetGarnish(
      {
        start: makeNode(0, 0),
        budgetMinutes: 90,
        categoryWeights: WEIGHTS,
        categoryStayMinutes: STAY,
        currentPlan: { stops, legs },
        replaceIndex: 0,
        // Первый кандидат — лучший в категории (голова причины его), второй —
        // крюк в 500 м от петли: перебор дойдёт до него после бюджет-гарда.
        candidates: [place('cafe_near', 'cafe', 500, 100), place('cafe2', 'cafe', 500, -500, 4.9)],
        currentGatesPassed: 4,
      },
      city.port,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const plan = result.plan;
    expect(plan.kind).toBe('street');
    expect(plan.stops).toHaveLength(1);
    expect(plan.stops[0].place.id).toBe('cafe2');
    expect(plan.stops[0].reason).toContain('крюка'); // 500 м от петли — честный крюк
    expect(plan.legs).toHaveLength(5); // 4 ноги кольца + разрез через якорь
    // Ноги вне заменяемой пары — те же ссылки (переиспользование §19.6).
    expect(plan.legs[2]).toBe(legs[2]);
    expect(plan.legs[4]).toBe(legs[4]);
    // Заменённая пара: конец первой — новый якорь.
    expect(plan.legs[0].to).toEqual(plan.stops[0].place.coordinates);
    expect(plan.legs[1].from).toEqual(plan.stops[0].place.coordinates);
    // Бюджет: кольцо 53.3 + 2×13.3 заменённой пары (детур на сетке) + stay 20.
    expect(plan.totalMinutes).toBeLessThanOrEqual(90 * 1.1 + 1e-9);
    // Уличный набор гейтов без anchors; факт снапа переносится как есть.
    expect(plan.gates.find((g) => g.gate === 'anchors')).toBeUndefined();
  });

  it('ноги без геометрии — честный отказ: петлю нельзя уничтожить перестройкой', async () => {
    const city = makeCity([]);
    const { legs, stops } = await garnishPlan();
    const bare = legs.map((leg) => ({ ...leg, geometry: [] }));
    const result = await replaceStreetGarnish(
      {
        start: makeNode(0, 0),
        budgetMinutes: 90,
        categoryWeights: WEIGHTS,
        currentPlan: { stops, legs: bare },
        replaceIndex: 0,
        candidates: [place('cafe2', 'cafe', 500, -500)],
      },
      city.port,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.code).toBe('INVALID_INPUT');
  });

  it('ноги не кольцо — INVALID_INPUT; нулевой пул — NO_CANDIDATES', async () => {
    const city = makeCity([]);
    const { legs, stops } = await garnishPlan();
    const broken = legs.slice(1); // первый узел не совпадает со стартом
    const ring = await replaceStreetGarnish(
      {
        start: makeNode(0, 0),
        budgetMinutes: 90,
        categoryWeights: WEIGHTS,
        currentPlan: { stops, legs: broken },
        replaceIndex: 0,
        candidates: [place('cafe2', 'cafe', 500, -500)],
      },
      city.port,
    );
    expect(ring.ok).toBe(false);
    if (!ring.ok) expect(ring.failure.code).toBe('INVALID_INPUT');

    const empty = await replaceStreetGarnish(
      {
        start: makeNode(0, 0),
        budgetMinutes: 90,
        categoryWeights: WEIGHTS,
        currentPlan: { stops, legs },
        replaceIndex: 0,
        candidates: [],
      },
      city.port,
    );
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.failure.code).toBe('NO_CANDIDATES');
  });
});
