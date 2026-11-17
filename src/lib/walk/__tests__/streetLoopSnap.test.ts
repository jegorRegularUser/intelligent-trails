// src/lib/walk/__tests__/streetLoopSnap.test.ts
// Умная роза (docs/street-interest-wave.md S3): снап к attraction-точкам
// внутри buildWaypoints, порог интереса, кап отклонения 30% радиуса, дедуп
// MIN_ANGLE_GAP_DEG, стабильность между tune-шагами, ретрай на route-отказ,
// флаг streetInterest вместо loop-only при ≥2 снапнутых секторах.
// Углы розы фиксированы сидом (детерминизм §13): для seed 1, K=4 углы падают
// в сектора 0/1/3/5 на компасных азимутах 11.9°/87.0°/168.5°/269.3°.

import { describe, expect, it } from 'vitest';
import {
  buildStreetLoop,
  INTEREST_SNAP_THRESHOLD,
  SNAP_MAX_RADIUS_SHARE,
  loopRadiusMeters,
  snapWaypointsToHints,
} from '@/lib/walk/streetLoop';
import type { WalkRoutingPort } from '@/lib/walk/ports';
import type { WalkLatLng, WalkPlan, WalkSectorHint, WalkStreetHints } from '@/lib/walk/types';

const START: WalkLatLng = [55.751244, 37.618423];
const RAD = Math.PI / 180;
const LAT_PER_M = 1 / (6371008.8 * RAD);

/** Точка на компасном азимуте deg (север = 0°) на дистанции meters от старта. */
function pointAtAzimuth(deg: number, meters: number): WalkLatLng {
  return [
    START[0] + Math.cos(deg * RAD) * meters * LAT_PER_M,
    START[1] + Math.sin(deg * RAD) * meters * (LAT_PER_M / Math.cos(START[0] * RAD)),
  ];
}

/** Радиус розы бюджета 60 мин (детерминированный, без роутинга). */
const ROSE_R = loopRadiusMeters(60 * 75 * 0.8, 4);

/** Фактические позиции углов розы seed 1, K=4 (компасный азимут, радиус). */
const CORNERS: Array<{ deg: number; meters: number }> = [
  { deg: 11.9, meters: ROSE_R * 0.956 },
  { deg: 87.0, meters: ROSE_R * 1.094 },
  { deg: 168.5, meters: ROSE_R * 1.044 },
  { deg: 269.3, meters: ROSE_R * 1.023 },
];

const samePoint = (a: WalkLatLng, b: WalkLatLng): boolean =>
  Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;

/** Подсказки: attraction-точки стоят на позициях углов розы — снап без отклонения. */
function hintsAtCorners(interest = 1): WalkStreetHints {
  const sectorOfCorner = (deg: number): number => Math.floor((((deg % 360) + 360) % 360) / 45);
  const sectors: WalkSectorHint[] = Array.from({ length: 8 }, (_, i) => ({
    azimuthDeg: (i + 0.5) * 45,
    interest: 0,
    point: null,
  }));
  for (const corner of CORNERS) {
    const sector = sectorOfCorner(corner.deg);
    sectors[sector] = {
      azimuthDeg: (sector + 0.5) * 45,
      interest,
      point: pointAtAzimuth(corner.deg, corner.meters),
    };
  }
  return { sectors, hasData: true };
}

interface FakePortPlan {
  /** Минуты по номеру вызова (по умолчанию 40 — в окне бюджета 60 [30..69]). */
  minutesByCall?: (callIndex: number) => number;
  /** Бросок вместо ответа: снапнутые точки «не маршрутизируются» (ретрай, B3). */
  failIf?: (waypoints: WalkLatLng[]) => boolean;
}

function makeRecordingPort(plan: FakePortPlan = {}): { port: WalkRoutingPort; calls: WalkLatLng[][] } {
  const calls: WalkLatLng[][] = [];
  const port: WalkRoutingPort = {
    async route({ waypoints }) {
      calls.push(waypoints.map((p) => [p[0], p[1]] as WalkLatLng));
      if (plan.failIf?.(waypoints)) throw new Error('NO_ROUTE у снапнутых точек');
      const minutes = plan.minutesByCall ? plan.minutesByCall(calls.length) : 40;
      return {
        distanceMeters: minutes * 75,
        durationSeconds: minutes * 60,
        geometry: fakeRing(waypoints),
      };
    },
    async matrix() {
      return [];
    },
  };
  return { port, calls };
}

const LNG_PER_M = LAT_PER_M / Math.cos(START[0] * RAD);

const azimuthOf = (p: WalkLatLng): number =>
  ((Math.atan2((p[1] - START[1]) / LNG_PER_M, (p[0] - START[0]) / LAT_PER_M) / RAD) + 360) % 360;

const radiusOf = (p: WalkLatLng): number =>
  Math.hypot((p[0] - START[0]) / LAT_PER_M, (p[1] - START[1]) / LNG_PER_M);

/**
 * Реалистичная фейк-геометрия: радиальные плечи старт↔первый/последний вейпоинт
 * и ДУГИ между соседними (компасный обход розы — по убыванию азимута). Хорды
 * между почти диаметральными углами резали бы центр, ноги пересекались бы и
 * гейт улиц честно падал; ORS так не отвечает — дуги повторяют его поведение.
 */
function fakeRing(waypoints: WalkLatLng[]): WalkLatLng[] {
  const corners = waypoints.slice(1, -1);
  const ring: WalkLatLng[] = [START, corners[0]];
  for (let i = 1; i < corners.length; i++) {
    const fromDeg = azimuthOf(corners[i - 1]);
    const toDeg = azimuthOf(corners[i]);
    const sweep = ((fromDeg - toDeg + 360) % 360);
    const rFrom = radiusOf(corners[i - 1]);
    const rTo = radiusOf(corners[i]);
    const steps = 8;
    for (let k = 1; k <= steps; k++) {
      const f = k / steps;
      ring.push(pointAtAzimuth(fromDeg - sweep * f, rFrom + (rTo - rFrom) * f));
    }
  }
  ring.push(START);
  return ring;
}

const attractionPointsOf = (hints: WalkStreetHints): WalkLatLng[] =>
  hints.sectors.flatMap((s) => (s.point ? [s.point] : []));

describe('snapWaypointsToHints: чистая функция (S3)', () => {
  const geometric = CORNERS.map((c) => pointAtAzimuth(c.deg, c.meters));

  it('снап при interest на пороге включительно, ниже порога — геометрия', () => {
    const hints = hintsAtCorners(INTEREST_SNAP_THRESHOLD);
    const snapped = snapWaypointsToHints(START, ROSE_R, geometric, hints);
    expect(snapped.snappedIndices).toHaveLength(4);
    snapped.points.forEach((point, i) => expect(samePoint(point, hints.sectors.find((s) => s.point && samePoint(point, s.point))?.point ?? point)).toBe(true));

    const weak = hintsAtCorners(INTEREST_SNAP_THRESHOLD - 0.01);
    const notSnapped = snapWaypointsToHints(START, ROSE_R, geometric, weak);
    expect(notSnapped.snappedIndices).toHaveLength(0);
    notSnapped.points.forEach((point, i) => expect(samePoint(point, geometric[i])).toBe(true));
  });

  it('кап отклонения: точка дальше 30% радиуса не тянет (граница pinned)', () => {
    const hints: WalkStreetHints = {
      sectors: [
        { azimuthDeg: 22.5, interest: 1, point: pointAtAzimuth(0, ROSE_R * (1 - SNAP_MAX_RADIUS_SHARE)) },
        ...Array.from({ length: 7 }, (_, i) => ({ azimuthDeg: (i + 1.5) * 45, interest: 0, point: null })),
      ],
      hasData: true,
    };
    const atLimit = snapWaypointsToHints(START, ROSE_R, [pointAtAzimuth(0, ROSE_R)], hints);
    expect(atLimit.snappedIndices).toEqual([0]); // ровно на границе капа — снап

    const beyond: WalkStreetHints = {
      sectors: [
        { ...hints.sectors[0], point: pointAtAzimuth(0, ROSE_R * (1 - SNAP_MAX_RADIUS_SHARE - 0.01)) },
        ...hints.sectors.slice(1),
      ],
      hasData: true,
    };
    const tooFar = snapWaypointsToHints(START, ROSE_R, [pointAtAzimuth(0, ROSE_R)], beyond);
    expect(tooFar.snappedIndices).toHaveLength(0);
    expect(samePoint(tooFar.points[0], pointAtAzimuth(0, ROSE_R))).toBe(true);
  });

  it('hasData=false → геометрия бит-в-бит (деградация без пустых массивов)', () => {
    const hints: WalkStreetHints = { sectors: [], hasData: false };
    const result = snapWaypointsToHints(START, ROSE_R, geometric, hints);
    expect(result.points).toEqual(geometric);
    expect(result.snappedIndices).toHaveLength(0);
  });

  it('дедуп MIN_ANGLE_GAP_DEG: сходящиеся снапы — слабейший по интересу откатывается', () => {
    // Геометрия: точки на 10° и 60° (разнос 50° у геометрии не важен — важен
    // разнос ПОСЛЕ снапа). Подсказки тянут их к 20° и 50° — после снапа 30°.
    const geoPair: WalkLatLng[] = [pointAtAzimuth(10, 500), pointAtAzimuth(60, 500)];
    const hints: WalkStreetHints = {
      sectors: [
        { azimuthDeg: 22.5, interest: 1.0, point: pointAtAzimuth(20, 500) }, // сектор 0
        { azimuthDeg: 67.5, interest: 0.9, point: pointAtAzimuth(50, 500) }, // сектор 1
        ...Array.from({ length: 6 }, (_, i) => ({ azimuthDeg: (i + 2.5) * 45, interest: 0, point: null })),
      ],
      hasData: true,
    };
    const result = snapWaypointsToHints(START, ROSE_R, geoPair, hints);
    // Оба снапятся (отклонение 5° ≈ 43 м ≤ 30% радиуса), но 20° и 50° — 30° < 65°:
    // слабейший (интерес 0.9) откатывается к геометрической точке.
    expect(result.snappedIndices).toEqual([0]);
    expect(samePoint(result.points[0], pointAtAzimuth(20, 500))).toBe(true);
    expect(samePoint(result.points[1], geoPair[1])).toBe(true);
  });

  it('детерминизм: тот же вход → бит-в-бит тот же выход (стабильность между tune-шагами)', () => {
    const hints = hintsAtCorners();
    expect(snapWaypointsToHints(START, ROSE_R, geometric, hints)).toEqual(
      snapWaypointsToHints(START, ROSE_R, geometric, hints),
    );
  });
});

describe('buildStreetLoop: снап, флаг и ретрай (S3)', () => {
  it('все углы снапнуты → attraction-точки в route-вызове, план streetInterest без loop-only', async () => {
    const hints = hintsAtCorners();
    const { port, calls } = makeRecordingPort();

    const result = await buildStreetLoop({ start: START, budgetMinutes: 60, ports: port, streetHints: hints });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const plan: WalkPlan = result.plan;
    expect(plan.streetInterest).toBe(true);
    expect(plan.degraded).toBeUndefined();
    // Первый вариант прошёл гейт улиц — один route-вызов, все 4 точки внутри.
    expect(calls).toHaveLength(1);
    for (const attraction of attractionPointsOf(hints)) {
      expect(calls[0].some((w) => samePoint(w, attraction))).toBe(true);
    }
  });

  it('интерес ниже порога → геометрическая роза, честный loop-only', async () => {
    const hints = hintsAtCorners(INTEREST_SNAP_THRESHOLD - 0.01);
    const { port, calls } = makeRecordingPort();

    const result = await buildStreetLoop({ start: START, budgetMinutes: 60, ports: port, streetHints: hints });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.degraded).toEqual({ level: 'loop-only' });
    expect(result.plan.streetInterest).toBeUndefined();
    for (const attraction of attractionPointsOf(hints)) {
      expect(calls[0].some((w) => samePoint(w, attraction))).toBe(false);
    }
  });

  it('стабильность снапа между tune-шагами: короткая петля растёт ×1.3 — точки остаются', async () => {
    const hints = hintsAtCorners();
    // Вызов 1 — недобор (20 < 30 мин) → радиус ×1.3; вызов 2 — в окне.
    const { port, calls } = makeRecordingPort({ minutesByCall: (n) => (n === 1 ? 20 : 40) });

    const result = await buildStreetLoop({ start: START, budgetMinutes: 60, ports: port, streetHints: hints });

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(2);
    // Отклонение снапнутой точки от выросшего угла = 0.3·R угла ≤ капа 0.3·R
    // — снап переживает tune-шаг: та же attraction-точка в обоих вызовах.
    for (const attraction of attractionPointsOf(hints)) {
      expect(calls[0].some((w) => samePoint(w, attraction))).toBe(true);
      expect(calls[1].some((w) => samePoint(w, attraction))).toBe(true);
    }
  });

  it('ретрай на отказ route со снапнутыми точками: повтор варианта с геометрией, честный loop-only', async () => {
    const hints = hintsAtCorners();
    const attractions = attractionPointsOf(hints);
    const { port, calls } = makeRecordingPort({
      failIf: (waypoints) => attractions.some((a) => waypoints.some((w) => samePoint(w, a))),
    });

    const result = await buildStreetLoop({ start: START, budgetMinutes: 60, ports: port, streetHints: hints });

    // Все варианты снапнуты и все отказали → ретрай с геометрией спасает:
    // честная деградация, не ошибка экрана (B3).
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.degraded).toEqual({ level: 'loop-only' });
    expect(result.plan.streetInterest).toBeUndefined();
    expect(calls).toHaveLength(2); // первый вариант: снап-попытка + геометрический ретрай
    for (const attraction of attractions) {
      expect(calls[0].some((w) => samePoint(w, attraction))).toBe(true);
      expect(calls[1].some((w) => samePoint(w, attraction))).toBe(false);
    }
  });

  it('без подсказок — прежняя геометрическая роза (поле undefined, не пустой массив)', async () => {
    const { port, calls } = makeRecordingPort();

    const result = await buildStreetLoop({ start: START, budgetMinutes: 60, ports: port });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.degraded).toEqual({ level: 'loop-only' });
    expect(result.plan.streetInterest).toBeUndefined();
    expect(calls).toHaveLength(1);
  });
});
