// src/lib/walk/__tests__/microStops.test.ts
// Микро-стопы «по пути» (docs/street-interest-wave.md S4): буфер 60 м, ≤2 на
// ногу, минуты ДО гейтов (total не вылетает за 1.1·B), walk-минуты в totals,
// дедуп точки у перекрёстка, имя-фолбэк, guard long_legs.

import { describe, expect, it } from 'vitest';
import { buildStreetLoop } from '@/lib/walk/streetLoop';
import { attachMicroNotes, MICRO_STOP_MINUTES } from '@/lib/walk/internal/microStops';
import type { WalkRoutingPort } from '@/lib/walk/ports';
import type { WalkLatLng, WalkLeg, WalkStreetFeature } from '@/lib/walk/types';

const START: WalkLatLng = [55.751244, 37.618423];
const RAD = Math.PI / 180;
const LAT_PER_M = 1 / (6371008.8 * RAD);
const LNG_PER_M = LAT_PER_M / Math.cos(START[0] * RAD);

/** Нога-прямая: lat 55.75, lng 37.60 → 37.62, minutes минут. */
function straightLeg(minutes = 12): WalkLeg {
  const geometry: WalkLatLng[] = [
    [55.75, 37.6],
    [55.75, 37.62],
  ];
  return { from: geometry[0], to: geometry[1], distanceMeters: minutes * 75, durationMinutes: minutes, geometry };
}

/** Точка к северу от середины ноги-прямой на offsetM метров. */
function northOfLeg(offsetM: number, lng = 37.61): WalkLatLng {
  return [55.75 + offsetM * LAT_PER_M, lng];
}

const pointFeature = (at: WalkLatLng, kind: WalkStreetFeature['kind'], name?: string): WalkStreetFeature => ({
  kind,
  geometry: [at],
  ...(name ? { name } : {}),
});

describe('attachMicroNotes: отбор кандидатов (S4)', () => {
  it('буфер 60 м: точка в 40 м цепляется (+2 мин в ногу), в 80 м — нет', () => {
    const legs = [straightLeg()];
    attachMicroNotes({
      legs,
      features: [pointFeature(northOfLeg(40), 'viewpoint', 'Панорама')],
      budgetMinutes: 60,
      currentTotalMinutes: 12,
    });
    expect(legs[0].microNotes).toHaveLength(1);
    expect(legs[0].microNotes?.[0]).toMatchObject({ name: 'Панорама', kind: 'viewpoint' });
    expect(legs[0].durationMinutes).toBe(12 + MICRO_STOP_MINUTES);

    const far = [straightLeg()];
    attachMicroNotes({
      legs: far,
      features: [pointFeature(northOfLeg(80), 'viewpoint')],
      budgetMinutes: 60,
      currentTotalMinutes: 12,
    });
    expect(far[0].microNotes).toBeUndefined();
    expect(far[0].durationMinutes).toBe(12);
  });

  it('≤2 на ногу и кап плана: 3 кандидата → 2 ближайших, минуты ≤ min(4, остаток до 1.1·B)', () => {
    const legs = [straightLeg()];
    const features = [
      pointFeature(northOfLeg(10), 'viewpoint', 'Близкий'),
      pointFeature(northOfLeg(30), 'art', 'Средний'),
      pointFeature(northOfLeg(50), 'art', 'Дальний'),
    ];
    attachMicroNotes({ legs, features, budgetMinutes: 60, currentTotalMinutes: 12 });
    expect(legs[0].microNotes?.map((n) => n.name)).toEqual(['Близкий', 'Средний']); // отсорт по близости
    expect(legs[0].durationMinutes).toBe(12 + 2 * MICRO_STOP_MINUTES); // кап 4 минуты

    // Остаток до потолка 1.1·B < 2 минут — ни одного стопа (постфактум запрещён).
    const tight = [straightLeg()];
    attachMicroNotes({ legs: tight, features, budgetMinutes: 60, currentTotalMinutes: 64.5 });
    expect(tight[0].microNotes).toBeUndefined();
    expect(tight[0].durationMinutes).toBe(12);
  });

  it('дедуп: одна фича у перекрёстка двух ног — один стоп на ближайшей ноге', () => {
    const legA = straightLeg(12);
    const legB: WalkLeg = {
      from: [55.7505, 37.615],
      to: [55.7525, 37.615],
      distanceMeters: 900,
      durationMinutes: 12,
      geometry: [
        [55.7505, 37.615],
        [55.7525, 37.615],
      ],
    };
    const shared = northOfLeg(30, 37.615); // ~30 м от обеих ног (перекрёсток)
    const legs = [legA, legB];
    attachMicroNotes({ legs, features: [pointFeature(shared, 'art', 'Мурал')], budgetMinutes: 60, currentTotalMinutes: 24 });
    const total = legs.flatMap((leg) => leg.microNotes ?? []);
    expect(total).toHaveLength(1);
    expect(total[0].name).toBe('Мурал');
  });

  it('вода: берег = ближайшая к пути вершина геометрии; без имени — фолбэк', () => {
    const bank: WalkStreetFeature = {
      kind: 'water',
      geometry: [northOfLeg(45, 37.605), northOfLeg(25, 37.61), northOfLeg(45, 37.615)],
    };
    const legs = [straightLeg()];
    attachMicroNotes({ legs, features: [bank], budgetMinutes: 60, currentTotalMinutes: 12 });
    expect(legs[0].microNotes?.[0]).toMatchObject({ name: 'Берег воды', kind: 'water' });
    // Взят ближайший берег (25 м, 37.61), не крайние вершины.
    expect(legs[0].microNotes?.[0].name).toBe('Берег воды');
  });

  it('guard long_legs: нога у потолка 25 мин не получает стопов (+2 сломали бы гейт)', () => {
    const nearLimit = straightLeg(24);
    const ok = straightLeg(12);
    const legs = [nearLimit, ok];
    attachMicroNotes({
      legs,
      features: [pointFeature(northOfLeg(10), 'viewpoint', 'Панорама')],
      budgetMinutes: 60,
      currentTotalMinutes: 36,
    });
    expect(nearLimit.microNotes).toBeUndefined();
    expect(ok.microNotes).toHaveLength(1);
  });

  it('зелень/пешеходные не цепляются (только viewpoint/art/вода); зелёные/пустые фичи — no-op', () => {
    const legs = [straightLeg()];
    attachMicroNotes({
      legs,
      features: [pointFeature(northOfLeg(10), 'green', 'Куст'), pointFeature(northOfLeg(12), 'pedestrian')],
      budgetMinutes: 60,
      currentTotalMinutes: 12,
    });
    expect(legs[0].microNotes).toBeUndefined();
    attachMicroNotes({ legs, features: [], budgetMinutes: 60, currentTotalMinutes: 12 });
    attachMicroNotes({ legs, features: undefined, budgetMinutes: 60, currentTotalMinutes: 12 });
    expect(legs[0].microNotes).toBeUndefined();
  });
});

describe('attachMicroNotes: интеграция с петлёй L3 (S4)', () => {
  it('микро-минуты в totals и в гейты: total ≤ 1.1·B, anchors не засчитывает стопы', async () => {
    // Фейк-порт с дугами (как в streetLoopSnap.test.ts): радиальные плечи +
    // дуги между соседними вейпоинтами, бюджет 60 → ходьба 40 мин.
    const azimuthOf = (p: WalkLatLng): number =>
      ((Math.atan2((p[1] - START[1]) / LNG_PER_M, (p[0] - START[0]) / LAT_PER_M) / RAD) + 360) % 360;
    const radiusOf = (p: WalkLatLng): number =>
      Math.hypot((p[0] - START[0]) / LAT_PER_M, (p[1] - START[1]) / LNG_PER_M);
    const ring = (waypoints: WalkLatLng[]): WalkLatLng[] => {
      const corners = waypoints.slice(1, -1);
      const ringPoints: WalkLatLng[] = [START, corners[0]];
      for (let i = 1; i < corners.length; i++) {
        const fromDeg = azimuthOf(corners[i - 1]);
        const sweep = ((fromDeg - azimuthOf(corners[i]) + 360) % 360);
        const rFrom = radiusOf(corners[i - 1]);
        const rTo = radiusOf(corners[i]);
        for (let k = 1; k <= 8; k++) {
          const f = k / 8;
          ringPoints.push(pointAtAzimuth(fromDeg - sweep * f, rFrom + (rTo - rFrom) * f));
        }
      }
      ringPoints.push(START);
      return ringPoints;
    };
    const pointAtAzimuth = (deg: number, meters: number): WalkLatLng => [
      START[0] + Math.cos(deg * RAD) * meters * LAT_PER_M,
      START[1] + Math.sin(deg * RAD) * meters * LNG_PER_M,
    ];
    const port: WalkRoutingPort = {
      async route({ waypoints }) {
        return { distanceMeters: 3000, durationSeconds: 40 * 60, geometry: ring(waypoints) };
      },
      async matrix() {
        return [];
      },
    };

    // Фича-точка на первом вейпоинте розы (seed 1: компас 87°, радиус 696 м).
    const onPath = pointAtAzimuth(87, 696);
    const result = await buildStreetLoop({
      start: START,
      budgetMinutes: 60,
      ports: port,
      streetFeatures: [pointFeature(onPath, 'viewpoint', 'Мариинская панорама')],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const plan = result.plan;
    const notesOnLegs = plan.legs.flatMap((leg) => leg.microNotes ?? []);
    expect(notesOnLegs.some((n) => n.name === 'Мариинская панорама')).toBe(true);
    // Минуты в totals как walk: totalMinutes = Σ ног (включая микро) + 0 stay.
    const legSum = plan.legs.reduce((sum, leg) => sum + leg.durationMinutes, 0);
    expect(plan.totalWalkMinutes).toBeCloseTo(legSum, 9);
    expect(plan.totalMinutes).toBe(plan.totalWalkMinutes);
    // Инвариант B2: микро-минуты не пробивают потолок 1.1·B.
    expect(plan.totalMinutes).toBeLessThanOrEqual(66 + 1e-9);
    // Гейт anchors у street-плана не выпускается (§19.4): микро-стопы — не
    // якоря, а stops пуст; микростопы не гейтуются ничем.
    expect(plan.stops).toHaveLength(0);
    expect(plan.gates.find((g) => g.gate === 'anchors')).toBeUndefined();
    expect(plan.kind).toBe('street');
  });
});
