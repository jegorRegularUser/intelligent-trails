// src/lib/walk/__tests__/fallback.test.ts
// Лестница деградации «Прогуляться сейчас» на сетке-городе (синтетика —
// gridCity.ts): strict ок → деградации нет; кандидаты вне зоны → L2;
// пустой пул → L3; мёртвый роутер → честный отказ strict.
//
// Числа сценария (75 м/мин): строгие зоны при бюджете 60 — R ≈ 675/794/540 м,
// поэтому кандидаты на 1000 м строгий движок не видит, а гарды L2
// (K=2: 0.30·60·75 = 1350 м; K=1: (66−30)·75/2 = 1350 м) пропускают.

import { describe, expect, it } from 'vitest';
import { buildWalkWithFallback } from '../fallback';
import { buildTriangleApex, triangleSideFor } from '../loopThrough';
import { buildShapeAngles, loopRadiusMeters } from '../streetLoop';
import { haversineMeters } from '../internal/geo';
import { isReasonStandalone } from '../uiAdapter';
import { makeCity, makeNode, type CityPlaceDef } from './gridCity';
import type { WalkRoutingPort } from '../ports';
import type { WalkInput, WalkLatLng } from '../types';

const START = makeNode(0, 0);

// Строгий сценарий: три якоря в зоне, strict строит планы сам (budget 90).
const STRICT_DEFS: CityPlaceDef[] = [
  { id: 'park', name: 'Парк', category: 'park', east: 0, north: 500, rating: 4.5 },
  { id: 'cafe', name: 'Кафе', category: 'cafe', east: 500, north: 0 },
  { id: 'cafe2', name: 'Второе кафе', category: 'cafe', east: 500, north: 500 },
  { id: 'museum', name: 'Музей', category: 'museum', east: 1000, north: 0, rating: 4.8 },
  { id: 'rest', name: 'Ресторан', category: 'restaurant', east: -500, north: 0 },
];

// Далёкие якоря: 1000 м по прямой — вне всех строгих зон, но в гардах L2.
const FAR_DEFS: CityPlaceDef[] = [
  { id: 'park_far', name: 'Далёкий парк', category: 'park', east: 1000, north: 0 },
  { id: 'park_far2', name: 'Второй далёкий парк', category: 'park', east: 0, north: 1000 },
];

function setup(defs: CityPlaceDef[], overrides: Partial<WalkInput> = {}): { city: ReturnType<typeof makeCity>; input: WalkInput } {
  const city = makeCity(defs);
  const input: WalkInput = {
    start: START,
    budgetMinutes: 90,
    categoryWeights: { park: 3, cafe: 2, museum: 2, restaurant: 1 },
    categoryStayMinutes: { park: 30, cafe: 20, museum: 45, restaurant: 40 },
    candidates: city.places,
    isLoop: true,
    ...overrides,
  };
  return { city, input };
}

/** Счётчик вызовов поверх сетки-порта: L2 и L3 платят route за каждую попытку. */
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

/** Мёртвый роутер: матрица работает, route всегда бросает. */
function deadRoutePort(port: WalkRoutingPort): WalkRoutingPort {
  return {
    route: async () => {
      throw new Error('NO_ROUTE: роутер недоступен');
    },
    matrix: (s, t) => port.matrix(s, t),
  };
}

describe('buildWalkWithFallback: лестница деградации', () => {
  it('strict ок — планы без признака деградации', async () => {
    // Бюджет 75: ходьба лучшей строгой петли (26.7 мин) ≥ 35% бюджета
    // (walk_share pass); варианты с кучкованием честно падают на walk_share,
    // но деградационными они не считаются — это альтернативы, не лестница.
    const { city, input } = setup(STRICT_DEFS, { budgetMinutes: 75 });
    const res = await buildWalkWithFallback(input, city.port);
    if (!res.ok) throw new Error(`ожидались планы, получен отказ ${res.failure.code}: ${res.failure.detail}`);

    expect(res.plans.length).toBeGreaterThanOrEqual(1);
    for (const plan of res.plans) {
      expect(plan.degraded).toBeUndefined();
    }
    expect(res.plans[0].allGatesPass).toBe(true);
  });

  it('кандидаты вне строгих зон → L2 с одним якорем: реальная геометрия, бюджет в допуске', async () => {
    const { city, input } = setup(FAR_DEFS, { budgetMinutes: 60 });
    const counted = countingPort(city.port);
    const res = await buildWalkWithFallback(input, counted.port);
    if (!res.ok) throw new Error(`ожидался деградационный план, получен отказ ${res.failure.code}: ${res.failure.detail}`);

    expect(res.plans).toHaveLength(1);
    const plan = res.plans[0];
    expect(plan.degraded).toEqual({ level: 'partial' });
    // Один якорь: пары кандидатов не набирается, K=1 — треугольная петля
    // (start → кандидат → апекс на перпендикуляре → start), не out-and-back.
    expect(plan.stops).toHaveLength(1);
    expect(plan.stops[0].place.id).toBe('park_far');
    expect(plan.stops[0].stayMinutes).toBe(30); // categoryStayMinutes, не дефолтная таблица
    expect(plan.stops[0].reason.trim().length).toBeGreaterThan(0);
    // Реальная геометрия сетки: три ноги, петля замкнута.
    expect(plan.legs).toHaveLength(3);
    expect(plan.legs[0].from).toEqual(START);
    expect(plan.legs[0].to).toEqual(plan.stops[0].place.coordinates);
    expect(plan.legs[2].to).toEqual(START);
    for (const leg of plan.legs) {
      expect(leg.geometry.length).toBeGreaterThanOrEqual(2);
      expect(leg.durationMinutes).toBeGreaterThan(0);
    }
    // Бюджет ×1.1: периметр треугольника ≈ 2.2·1000 м ≈ 29.3 мин + 30 стоянки ≤ 66.
    expect(plan.totalMinutes).toBeLessThanOrEqual(60 * 1.1 + 1e-6);
    // Строгий движок отказал до route (зоны пусты); L2 потратил два вызова:
    // пара кандидатов отвергнута бюджетом (113 мин), треугольный сингл принят.
    expect(counted.calls.route).toBe(2);
  });

  it('K=2 не влезает в бюджет → перебор продолжает K=1 со следующим кандидатом', async () => {
    const { city, input } = setup(FAR_DEFS, { budgetMinutes: 60 });
    const res = await buildWalkWithFallback(input, city.port);
    if (!res.ok) throw new Error(`ожидался деградационный план, получен отказ ${res.failure.code}`);

    // Пара на 1000+2000+1000 м с двумя стоянками — 113 мин против лимита 66;
    // сингл из первого годного влезает.
    expect(res.plans[0].stops).toHaveLength(1);
    expect(res.plans[0].degraded).toEqual({ level: 'partial' });
    expect(res.plans[0].totalMinutes).toBeLessThanOrEqual(60 * 1.1 + 1e-6);
  });

  it('кандидатов ноль → L3: уличная петля в бюджет ×1.15, якорей нет, гейты честные', async () => {
    const { city, input } = setup([], { budgetMinutes: 60 });
    const counted = countingPort(city.port);
    const res = await buildWalkWithFallback(input, counted.port);
    if (!res.ok) throw new Error(`ожидался план-петля, получен отказ ${res.failure.code}: ${res.failure.detail}`);

    expect(res.plans).toHaveLength(1);
    const plan = res.plans[0];
    expect(plan.degraded).toEqual({ level: 'loop-only' });
    expect(plan.stops).toHaveLength(0);
    // Квадрат: старт + 4 вейпоинта + замыкание → 5 разрезанных ног.
    expect(plan.legs).toHaveLength(5);
    expect(plan.legs[0].from).toEqual(START);
    expect(plan.legs[4].to).toEqual(START);
    for (const leg of plan.legs) {
      expect(leg.geometry.length).toBeGreaterThanOrEqual(2);
    }
    // Коррекции радиуса обязаны посадить петлю в окно 0.5..1.15 бюджета
    // (манхэттен-периметр квадрата ≤ 1.414 евклидова, ×0.85² гасит любой запас).
    expect(plan.totalMinutes).toBeLessThanOrEqual(60 * 1.15 + 1e-6);
    // Гейты честные: без якорей anchors падает, полный pass невозможен.
    expect(plan.allGatesPass).toBe(false);
    expect(plan.gates.find((g) => g.gate === 'anchors')?.pass).toBe(false);
    expect(counted.calls.route).toBeGreaterThanOrEqual(1);
  });

  it('route мёртв при живой матрице → честный отказ strict (NO_ROUTE), без планов', async () => {
    const { city, input } = setup(STRICT_DEFS);
    const counted = countingPort(deadRoutePort(city.port));
    const res = await buildWalkWithFallback(input, counted.port);

    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('ожидался отказ');
    // strict построил порядок по матрице и упал на первой ноге — его отказ и возвращаем.
    expect(res.failure.code).toBe('NO_ROUTE');
    expect(res.failure.detail).toContain('не построена');
    // Детерминированный счётчик: strict — 3 варианта × 2 зеркала кольца = 6,
    // L2 — кап 5 попыток (с фолбэками треугольника), L3 — 5 вариантов розы
    // (квадрат ×4 поворота + треугольник).
    expect(counted.calls.route).toBe(6 + 5 + 5);
    expect(counted.calls.matrix).toBeGreaterThanOrEqual(1);
  });

  it('детерминизм: та же точка и сид → та же петля бит-в-бит', async () => {
    const a = await buildWalkWithFallback(setup([], { budgetMinutes: 60 }).input, makeCity([]).port);
    const b = await buildWalkWithFallback(setup([], { budgetMinutes: 60 }).input, makeCity([]).port);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('buildWalkWithFallback: причины якорей — человеческий язык (M5)', () => {
  const CATEGORY_WORDS = [
    // названия категорий реестра, RU и EN-ключ
    'кафе', 'ресторан', 'парк', 'музей', 'кинотеатр', 'бар', 'магазин',
    'смотровая площадка', 'достопримечательность', 'набережная', 'рынок',
    'cafe', 'restaurant', 'park', 'museum', 'cinema', 'bar', 'shopping',
    'viewpoint', 'attraction', 'waterfront', 'market',
  ];

  it('ни одна причина на планах фикстур не содержит «скора» и «в радиусе»; standalone не повторяет категорию', async () => {
    const { city, input } = setup(STRICT_DEFS, { budgetMinutes: 75 });
    const res = await buildWalkWithFallback(input, city.port);
    if (!res.ok) throw new Error(`ожидались планы, получен отказ ${res.failure.code}: ${res.failure.detail}`);
    expect(res.plans.length).toBeGreaterThan(0);

    for (const plan of res.plans) {
      for (const stop of plan.stops) {
        const ru = stop.reason.toLowerCase();
        const en = (stop.reasonEn ?? '').toLowerCase();
        // Табу на язык скоринга (docs/ux-human-wave.md M5).
        expect(stop.reason.length).toBeGreaterThan(0);
        expect(ru).not.toContain('скор');
        expect(ru).not.toContain('в радиусе');
        expect(ru).not.toContain('лучший скор');
        expect(en).not.toContain('score');
        expect(en).not.toContain('radius');
        // Все формулы reasons.ts самодостаточны: standalone-причина не
        // начинается и вообще не содержит голого имени категории.
        expect(isReasonStandalone(stop.reason)).toBe(true);
        for (const word of CATEGORY_WORDS) {
          expect(ru.startsWith(word)).toBe(false);
          expect(ru.includes(word)).toBe(false);
        }
      }
    }
  });
});

describe('streetLoop: математика радиуса', () => {
  it('R решается из желаемого периметра правильного K-угольника', () => {
    // L = 3600 м: квадрат — 8·sin(45°)·R... R = L / (2·4·sin(π/4)) ≈ 636.4;
    // треугольник — R = L / (6·sin(60°)) ≈ 692.8.
    expect(loopRadiusMeters(3600, 4)).toBeCloseTo(636.396, 2);
    expect(loopRadiusMeters(3600, 3)).toBeCloseTo(692.82, 2);
    // При том же периметре радиус ПАДАЕТ с ростом числа сторон:
    // периметр 2·R·K·sin(π/K) растёт (K·sin(π/K) → π), R = L / периметр.
    expect(loopRadiusMeters(3600, 6)).toBeLessThan(loopRadiusMeters(3600, 3));
  });
});

describe('streetLoop: углы розы', () => {
  it('монотонный свип и зазор ≥65° даже при враждебном джиттере', () => {
    const DEG = Math.PI / 180;
    for (const corners of [3, 4]) {
      // Чередующийся джиттер максимально раздвигает порядок генерации.
      const jitter = Array.from({ length: corners }, (_, i) => (i % 2 === 0 ? 12 : -12) * DEG);
      const angles = buildShapeAngles(corners, jitter);
      for (let i = 1; i < angles.length; i++) {
        expect(angles[i]).toBeGreaterThan(angles[i - 1]);
        expect(angles[i] - angles[i - 1]).toBeGreaterThanOrEqual(65 * DEG - 1e-9);
      }
      // Циклический зазор: петля углов замкнута без «в догонку».
      expect(angles[0] + 2 * Math.PI - angles[angles.length - 1]).toBeGreaterThanOrEqual(
        65 * DEG - 1e-9,
      );
    }
  });
});

describe('streetLoop: реакция на перекрытие улиц', () => {
  const BAD_DURATION_SECONDS = 2880; // 48 мин — в окне 30..69, коррекций радиуса нет

  /**
   * Фейк-роутер: первые badCalls вызовов возвращают полилинию «туда-обратно»
   * (обратный ход по тем же улицам → перекрытие ~100%, гейт улиц честно
   * падает), остальные — реальную сеточную петлю через grid-порт.
   */
  function overlappingPort(
    grid: WalkRoutingPort,
    badCalls: number | 'all',
  ): { port: WalkRoutingPort; calls: { route: number } } {
    const calls = { route: 0 };
    const port: WalkRoutingPort = {
      async route(req) {
        calls.route += 1;
        const bad = badCalls === 'all' || calls.route <= badCalls;
        if (!bad) return grid.route(req);
        const forward = await grid.route(req);
        return {
          distanceMeters: forward.distanceMeters * 2,
          durationSeconds: BAD_DURATION_SECONDS,
          // Петля плюс обратный ход по тем же улицам.
          geometry: [...forward.geometry, ...forward.geometry.slice(0, -1).reverse()],
          source: 'pack',
        };
      },
      matrix: (s, t) => grid.matrix(s, t),
    };
    return { calls, port };
  }

  it('базовая роза даёт перекрытие → уход в следующий вариант, итог проходит гейт улиц', async () => {
    const { city, input } = setup([], { budgetMinutes: 60 });
    const fake = overlappingPort(city.port, 1);
    const res = await buildWalkWithFallback(input, fake.port);
    if (!res.ok) throw new Error(`ожидался план-петля, получен отказ ${res.failure.code}: ${res.failure.detail}`);

    const plan = res.plans[0];
    expect(plan.degraded).toEqual({ level: 'loop-only' });
    // Генератор ушёл в поворот розы: первый вариант был отбракован гейтом.
    expect(fake.calls.route).toBeGreaterThanOrEqual(2);
    // Принятый вариант — чистая петля без повторов улиц.
    expect(plan.gates.find((g) => g.gate === 'loop_no_repeat_street')?.pass).toBe(true);
    expect(plan.totalMinutes).toBeLessThanOrEqual(60 * 1.15 + 1e-6);
  });

  it('все варианты перекрываются → отдаётся план с минимальным перекрытием, не отказ', async () => {
    const { city, input } = setup([], { budgetMinutes: 60 });
    const fake = overlappingPort(city.port, 'all');
    const res = await buildWalkWithFallback(input, fake.port);
    if (!res.ok) throw new Error(`ожидался план-петля, получен отказ ${res.failure.code}: ${res.failure.detail}`);

    const plan = res.plans[0];
    expect(plan.degraded).toEqual({ level: 'loop-only' });
    // Лучший из худших: гейт улиц честно провален, но прогулка выдана.
    expect(plan.gates.find((g) => g.gate === 'loop_no_repeat_street')?.pass).toBe(false);
    // 5 вариантов розы × 1 вызов (длительность в окне — коррекций нет).
    expect(fake.calls.route).toBe(5);
    expect(plan.totalMinutes).toBeLessThanOrEqual(60 * 1.15 + 1e-6);
  });
});

describe('loopThrough: треугольная петля K=1', () => {
  it('апекс на серединном перпендикуляре, 0.35·d, сторона детерминирована стартом', () => {
    const start = makeNode(0, 0);
    const candidate = makeNode(1000, 0);
    const d = haversineMeters(start, candidate);
    const apex = buildTriangleApex(start, candidate, 1);
    const apexMirrored = buildTriangleApex(start, candidate, -1);
    const mid: WalkLatLng = [(start[0] + candidate[0]) / 2, (start[1] + candidate[1]) / 2];

    // Дистанция от середины до апекса ≈ 0.35·d (±10 м).
    expect(haversineMeters(mid, apex)).toBeCloseTo(0.35 * d, -1);
    expect(haversineMeters(mid, apexMirrored)).toBeCloseTo(0.35 * d, -1);
    // Серединный перпендикуляр: |апекс−старт| = |апекс−кандидат|.
    expect(haversineMeters(apex, start)).toBeCloseTo(haversineMeters(apex, candidate), 3);
    // Стороны зеркальны относительно линии старт-кандидат.
    expect(haversineMeters(apex, apexMirrored)).toBeCloseTo(0.7 * d, -1);
  });

  it('сторона треугольника детерминирована координатами старта', () => {
    const s = makeNode(0, 0);
    const side = triangleSideFor(s);
    expect([1, -1]).toContain(side);
    expect(triangleSideFor(s)).toBe(side);
  });

  it('NO_ROUTE у треугольника → фолбэк на out-and-back (2 ноги, тот же якорь)', async () => {
    const city = makeCity([
      { id: 'park_far', name: 'Далёкий парк', category: 'park', east: 1000, north: 0 },
    ]);
    // Треугольник — 4 вейпоинта и бросает; out-and-back — 3 и работает.
    const port: WalkRoutingPort = {
      route: async (req) => {
        if (req.waypoints.length >= 4) throw new Error('NO_ROUTE: треугольник недоступен');
        return city.port.route(req);
      },
      matrix: (s, t) => city.port.matrix(s, t),
    };
    const input: WalkInput = {
      start: START,
      budgetMinutes: 60,
      categoryWeights: { park: 3 },
      categoryStayMinutes: { park: 30 },
      candidates: city.places,
      isLoop: true,
    };
    const res = await buildWalkWithFallback(input, port);
    if (!res.ok) throw new Error(`ожидался деградационный план, получен отказ ${res.failure.code}`);

    const plan = res.plans[0];
    expect(plan.degraded).toEqual({ level: 'partial' });
    expect(plan.stops).toHaveLength(1);
    expect(plan.stops[0].place.id).toBe('park_far');
    expect(plan.legs).toHaveLength(2); // out-and-back: туда и назад по одной улице
    expect(plan.legs[1].to).toEqual(START);
    expect(plan.totalMinutes).toBeLessThanOrEqual(60 * 1.1 + 1e-6);
  });
});
