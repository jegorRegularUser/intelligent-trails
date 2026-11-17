// src/lib/walk/__tests__/streetFirst.test.ts
// Первичный конвейер «улица первична» (walk-engine.md §19) на сетке-городе:
// пустой пул — валидная петля 0 якорей (§19.1), street-гейты (§19.4), снап к
// характерным секторам через пайплайн (§19.5), фаза добора при не вставшем
// гарнише (§19.3), до 3 альтернатив (§19.2), детерминизм §13, отказ мёртвого
// роутера.

import { describe, expect, it } from 'vitest';
import { buildStreetFirstPlans, STREET_FIRST_MAX_PLANS } from '../streetFirst';
import { loopRadiusMeters } from '../streetLoop';
import { makeCity, makeNode, SPEED_M_PER_MIN, type CityPlaceDef } from './gridCity';
import type { WalkRoutingPort } from '../ports';
import type { WalkStreetFeature, WalkStreetHints, WalkSectorHint, WalkLatLng } from '../types';

const START = makeNode(0, 0);
const RAD = Math.PI / 180;
const LAT_PER_M = 1 / (6371008.8 * RAD);

/** Точка на компасном азимуте deg на дистанции meters от старта (как в streetLoopSnap). */
function pointAtAzimuth(deg: number, meters: number): WalkLatLng {
  return [
    START[0] + Math.cos(deg * RAD) * meters * LAT_PER_M,
    START[1] + Math.sin(deg * RAD) * meters * (LAT_PER_M / Math.cos(START[0] * RAD)),
  ];
}

const azimuthOf = (p: WalkLatLng): number =>
  ((Math.atan2((p[1] - START[1]) / (LAT_PER_M / Math.cos(START[0] * RAD)), (p[0] - START[0]) / LAT_PER_M) / RAD) + 360) % 360;
const radiusOf = (p: WalkLatLng): number =>
  Math.hypot((p[0] - START[0]) / LAT_PER_M, (p[1] - START[1]) / (LAT_PER_M / Math.cos(START[0] * RAD)));

/**
 * Реалистичная фейк-геометрия (копия приёма streetLoopSnap.test.ts): радиальные
 * плечи старт↔первый/последний вейпоинт и ДУГИ между соседними — ORS так не
 * режет центр, гейт улиц не падает на честной петле. Дуга — КОРОТКАЯ (снап к
 * среде не разворачивает петлю против порядка вейпоинтов), bulge 1.0: замер
 * даёт длительность ровно 1.0·B — середина окна тюнинга [0.9, 1.15]·B при любом
 * бюджете, коррекций радиуса нет и углы розы остаются на геометрических
 * позициях (подсказки/гарниш/микро-стопы садятся в ноль отклонения).
 * Нога из двух точек (гарниш режет ногу надвое) — прямая.
 */
function fakeRing(waypoints: WalkLatLng[], bulge: number): WalkLatLng[] {
  const corners = waypoints.slice(1, -1);
  if (corners.length === 0) return [waypoints[0], waypoints[waypoints.length - 1]];
  const ring: WalkLatLng[] = [START, corners[0]];
  for (let i = 1; i < corners.length; i++) {
    const fromDeg = azimuthOf(corners[i - 1]);
    const toDeg = azimuthOf(corners[i]);
    // Короткая дуга от угла к углу (знак по ближайшему направлению): вейпоинты
    // приходят упорядоченными по внутреннему углу розы — в компасных азимутах
    // это убывание, и модульный свип уходил длинным путём (~280°), раздувая
    // петлю и уводя тюнинг радиуса в сжатие, ломая снапы фиксированных подсказок.
    let sweep = (toDeg - fromDeg + 360) % 360;
    if (sweep > 180) sweep -= 360;
    const rFrom = radiusOf(corners[i - 1]);
    const rTo = radiusOf(corners[i]);
    for (let k = 1; k <= 8; k++) {
      const f = k / 8;
      // Последняя точка дуги — ровно угол розы: ноги обязаны проходить через
      // вейпоинты (гарниш/микро-стопы меряют отклонение от геометрии ноги).
      const radius = k < 8 ? (rFrom + (rTo - rFrom) * f) * bulge : rTo;
      ring.push(pointAtAzimuth(fromDeg + sweep * f, radius));
    }
  }
  ring.push(START);
  return ring;
}

const LNG_PER_M = LAT_PER_M / Math.cos(START[0] * RAD);
const distMeters = (a: WalkLatLng, b: WalkLatLng): number =>
  Math.hypot((b[0] - a[0]) / LAT_PER_M, (b[1] - a[1]) / LNG_PER_M);

/** Фейк-порт: длительность от длины полилинии (полуноги гарниша не стоят как петля). */
function arcPort(bulge = 1.0): WalkRoutingPort {
  return {
    async route({ waypoints }) {
      const geometry = fakeRing(waypoints, bulge);
      let meters = 0;
      for (let i = 1; i < geometry.length; i++) meters += distMeters(geometry[i - 1], geometry[i]);
      return {
        distanceMeters: meters,
        durationSeconds: (meters / SPEED_M_PER_MIN) * 60,
        geometry,
      };
    },
    async matrix() {
      return [];
    },
  };
}

/** Фактические позиции углов розы seed 1, K=4 (как в streetLoopSnap.test.ts). */
function roseCorners(budgetMinutes: number): Array<{ deg: number; meters: number }> {
  const roseR = loopRadiusMeters(budgetMinutes * SPEED_M_PER_MIN * 0.8, 4);
  return [
    { deg: 11.9, meters: roseR * 0.956 },
    { deg: 87.0, meters: roseR * 1.094 },
    { deg: 168.5, meters: roseR * 1.044 },
    { deg: 269.3, meters: roseR * 1.023 },
  ];
}

/** Подсказки: attraction-точки на позициях углов розы — снап без отклонения. */
function hintsAtCorners(budgetMinutes: number): WalkStreetHints {
  const sectors: WalkSectorHint[] = Array.from({ length: 8 }, (_, i) => ({
    azimuthDeg: (i + 0.5) * 45,
    interest: 0,
    point: null,
  }));
  for (const corner of roseCorners(budgetMinutes)) {
    const sector = Math.floor((((corner.deg % 360) + 360) % 360) / 45);
    sectors[sector] = {
      azimuthDeg: (sector + 0.5) * 45,
      interest: 1,
      point: pointAtAzimuth(corner.deg, corner.meters),
    };
  }
  return { sectors, hasData: true };
}

const FAR_DEFS: CityPlaceDef[] = [
  { id: 'cafe_far', name: 'Далёкое кафе', category: 'cafe', east: 2000, north: 0, rating: 4.7 },
];

describe('buildStreetFirstPlans: конвейер «улица первична» (§19)', () => {
  it('пустой пул — валидная петля 0 якорей: street-гейты без anchors/long_legs (§19.1, §19.4)', async () => {
    const city = makeCity([]);
    const res = await buildStreetFirstPlans({
      start: START,
      budgetMinutes: 60,
      candidates: [],
      categoryWeights: { cafe: 3 },
      ports: city.port,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.plans.length).toBeGreaterThanOrEqual(1);
    const plan = res.plans[0];
    expect(plan.kind).toBe('street');
    expect(plan.stops).toHaveLength(0);
    // Нет данных среды → заметка деградации §19.5.
    expect(plan.degraded).toEqual({ level: 'street-no-data' });
    // Уличный набор гейтов: anchors и long_legs не выпускаются, street_interest
    // тоже (данных нет) — бюджет, ходьба, улицы; полный pass честен.
    const names = plan.gates.map((g) => g.gate).sort();
    expect(names).toEqual(['budget', 'loop_no_repeat_street', 'walk_share']);
    expect(plan.allGatesPass).toBe(true);
    expect(plan.totalMinutes).toBeLessThanOrEqual(60 * 1.15 + 1e-6);
  });

  it('данные среды со снапом → streetInterest, гейт интереса; вариант-приоритет: снапнутый первый', async () => {
    const res = await buildStreetFirstPlans({
      start: START,
      budgetMinutes: 60,
      candidates: [],
      categoryWeights: { cafe: 3 },
      streetHints: hintsAtCorners(60),
      ports: arcPort(),
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const plan = res.plans[0];
    expect(plan.streetInterest).toBe(true);
    expect(plan.degraded).toBeUndefined();
    expect(plan.streetSnappedSectors).toBeGreaterThanOrEqual(2);
    const interestGate = plan.gates.find((g) => g.gate === 'street_interest');
    expect(interestGate?.pass).toBe(true);
    // Альтернативы: повороты розы мимо подсказок — их гейт интереса честно падает.
    const second = res.plans[1];
    if (second) {
      expect(second.gates.find((g) => g.gate === 'street_interest')?.pass).toBe(false);
    }
  });

  it('гарниш в коридоре: якорь у угла розы влезает в бюджет после уличного времени', async () => {
    // Кафе ровно в угле розы бюджета 65 (90 − резерв 25): детур 0, stay 20 —
    // 61 + 20 = 81 ≤ 99. Резерв — stay лучшего кандидата + запас (§19.3).
    const corner = roseCorners(65)[1];
    const cafe = {
      id: 'cafe_corner',
      name: 'Кафе у розы',
      category: 'cafe',
      coordinates: pointAtAzimuth(corner.deg, corner.meters),
    };
    const res = await buildStreetFirstPlans({
      start: START,
      budgetMinutes: 90,
      candidates: [cafe],
      categoryWeights: { cafe: 3 },
      categoryStayMinutes: { cafe: 20 },
      ports: arcPort(),
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const plan = res.plans[0];
    expect(plan.stops).toHaveLength(1);
    expect(plan.stops[0].place.id).toBe('cafe_corner');
    expect(plan.stops[0].stayMinutes).toBe(20);
    expect(plan.stops[0].reason.length).toBeGreaterThan(0);
    expect(plan.legs.length).toBe(5 + 1); // петля + разрез ноги через якорь
    expect(plan.totalMinutes).toBeLessThanOrEqual(90 * 1.1 + 1e-9);
    expect(plan.gates.find((g) => g.gate === 'budget')?.pass).toBe(true);
  });

  it('гарниш не встал (вне коридора) и недобор пола → фаза добора: петля на полный бюджет', async () => {
    const city = makeCity(FAR_DEFS);
    const res = await buildStreetFirstPlans({
      start: START,
      budgetMinutes: 90,
      candidates: city.places, // кафе за 2000 м — вне коридора 200 м любой розы
      categoryWeights: { cafe: 3 },
      categoryStayMinutes: { cafe: 20 },
      ports: city.port,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const plan = res.plans[0];
    // Гарниш не встал: 0 якорей — валидно; недобор добирается перестройкой
    // на полный бюджет (§19.3) — улицы не кончаются.
    expect(plan.stops).toHaveLength(0);
    expect(plan.totalMinutes).toBeGreaterThanOrEqual(90 * 0.9 - 1e-6);
    expect(plan.gates.find((g) => g.gate === 'budget')?.pass).toBe(true);
  });

  it('до 3 альтернатив, они различаются; детерминизм бит-в-бит (§13)', async () => {
    const res = await buildStreetFirstPlans({
      start: START,
      budgetMinutes: 60,
      candidates: [],
      categoryWeights: { cafe: 3 },
      ports: makeCity([]).port,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.plans.length).toBeGreaterThanOrEqual(2);
    expect(res.plans.length).toBeLessThanOrEqual(STREET_FIRST_MAX_PLANS);
    const signatures = res.plans.map((plan) => JSON.stringify(plan.legs.map((l) => l.from)));
    expect(new Set(signatures).size).toBe(res.plans.length);

    const again = await buildStreetFirstPlans({
      start: START,
      budgetMinutes: 60,
      candidates: [],
      categoryWeights: { cafe: 3 },
      ports: makeCity([]).port,
    });
    expect(JSON.stringify(res.plans)).toBe(JSON.stringify(again.ok ? again.plans : null));
  });

  it('мёртвый роутер → честный отказ NO_ROUTE', async () => {
    const deadPort: WalkRoutingPort = {
      route: async () => {
        throw new Error('NO_ROUTE: роутер недоступен');
      },
      matrix: async () => [],
    };
    const res = await buildStreetFirstPlans({
      start: START,
      budgetMinutes: 60,
      candidates: [],
      categoryWeights: { cafe: 3 },
      ports: deadPort,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.failure.code).toBe('NO_ROUTE');
  });

  it('микро-стопы фич улиц цепляются к ногам через пайплайн (S4)', async () => {
    const corner = roseCorners(60)[1];
    const feature: WalkStreetFeature = {
      kind: 'viewpoint',
      name: 'Мариинская панорама',
      geometry: [pointAtAzimuth(corner.deg, corner.meters)],
    };
    const res = await buildStreetFirstPlans({
      start: START,
      budgetMinutes: 60,
      candidates: [],
      categoryWeights: { cafe: 3 },
      streetFeatures: [feature],
      ports: arcPort(),
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const notes = res.plans[0].legs.flatMap((leg) => leg.microNotes ?? []);
    expect(notes.some((n) => n.name === 'Мариинская панорама')).toBe(true);
  });
});
