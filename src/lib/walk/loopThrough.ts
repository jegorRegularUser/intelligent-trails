// src/lib/walk/loopThrough.ts
// Уровень L2 лестницы деградации «Прогуляться сейчас» (PRODUCT: почти всегда
// прогулка): строгому движку нужно ≥2 якоря в зоне — в спальном районе их нет.
// Здесь петля строится через ЛУЧШИХ кандидатов из скор-пула, где бы они ни
// находились: K=2, потом K=1 (out-and-back). Гейты считаются честно и могут
// падать — деградация этим не блокируется, блокируется только бюджет ×1.1.
// Чистый модуль: ./types, ./ports, ./internal/*, ./gates, ./reasons.
//
// Детерминизм: попытки перебираются в фиксированном порядке (пары лучших,
// затем синглы в скор-порядке), лимит route-вызовов жёсткий.

import type {
  WalkFailure,
  WalkLatLng,
  WalkLeg,
  WalkPlan,
  WalkPlace,
  WalkStop,
} from './types';
import { BUDGET_TOLERANCE, DEFAULT_WALKING_SPEED_KMH, MAX_LEG_MINUTES } from './types';
import type { WalkRouteSegment, WalkRoutingPort } from './ports';
import { haversineMeters, splitPolylineByWaypoints, splitRouteMetrics } from './internal/geo';
import { resolveStayMinutes } from './internal/stay';
import { mulberry32 } from './internal/rng';
import { evaluateGates } from './gates';
import { buildAnchorReason, buildAnchorReasonEn } from './reasons';

/** Жёсткий лимит route-вызовов на весь перебор попыток L2. */
const MAX_ROUTE_CALLS = 5;
/** Доля бюджета времени на одно плечо петли при K=2. */
const K2_ONEWAY_SHARE = 0.3;
/** Сколько синглов K=1 перебирается после пар (замены «следующими в пуле»). */
const SINGLE_ATTEMPTS = 3;
/** Апекс треугольной петли: перпендикуляр от середины, доля дистанции. */
const TRIANGLE_APEX_SHARE = 0.35;
/** Периметр треугольника ≈ (1 + 2·√(0.25 + 0.35²))·d ≈ 2.22·d — гард бюджета. */
const TRIANGLE_PERIMETER_FACTOR = 2.22;

const DEG = Math.PI / 180;
const EARTH_M_PER_DEG = 6371008.8 * (Math.PI / 180);

export interface LoopThroughInput {
  start: WalkLatLng;
  budgetMinutes: number;
  speedKmh?: number;
  categoryWeights: Record<string, number>;
  categoryStayMinutes?: Record<string, number>;
  /** Уже отскоренные кандидаты, порядок убывания — его задаёт action. */
  candidates: WalkPlace[];
  /** Потолок якорей деградационной петли (по умолчанию 2). */
  maxStops?: number;
}

export type LoopThroughResult =
  | { ok: true; plan: WalkPlan }
  | { ok: false; failure: WalkFailure };

export async function buildLoopThroughCandidates(
  input: LoopThroughInput,
  ports: WalkRoutingPort,
): Promise<LoopThroughResult> {
  const invalid = validateInput(input);
  if (invalid) return { ok: false, failure: invalid };

  const speedMPerMin = ((input.speedKmh ?? DEFAULT_WALKING_SPEED_KMH) * 1000) / 60;
  const limit = input.budgetMinutes * (1 + BUDGET_TOLERANCE);
  const maxStops = input.maxStops ?? 2;
  const pool = input.candidates;

  // Дедуп по id/координатам; годные сохраняют скор-порядок входа.
  const seenIds = new Set<string>();
  const seenCoords = new Set<string>();
  const fitForK = (place: WalkPlace, corners: 1 | 2, stay: number): boolean => {
    const straight = haversineMeters(input.start, place.coordinates);
    if (corners === 2) {
      return straight <= K2_ONEWAY_SHARE * input.budgetMinutes * speedMPerMin;
    }
    // Треугольная петля: периметр ≈ 2.22·d, два плеча по прямой + апекс
    // должны влезть в 1.1·B мин минус стоянка.
    return straight <= ((limit - stay) * speedMPerMin) / TRIANGLE_PERIMETER_FACTOR;
  };

  const fitK2: WalkPlace[] = [];
  const fitK1: WalkPlace[] = [];
  for (const place of pool) {
    const idKey = `${place.id}`;
    const coordKey = `${place.coordinates[0].toFixed(6)},${place.coordinates[1].toFixed(6)}`;
    if (seenIds.has(idKey) || seenCoords.has(coordKey)) continue;
    seenIds.add(idKey);
    seenCoords.add(coordKey);
    const stay = resolveStayMinutes(place, input.categoryStayMinutes);
    if (maxStops >= 2 && fitForK(place, 2, stay)) fitK2.push(place);
    if (fitForK(place, 1, stay)) fitK1.push(place);
  }

  // Порядок попыток: пара лучших, пара с заменой последнего следующим,
  // затем синглы по скор-порядку. Каждая попытка — один route-вызов
  // (сингл платит до двух: треугольник + фолбэк out-and-back).
  const attempts: WalkPlace[][] = [];
  if (fitK2.length >= 2) {
    attempts.push([fitK2[0], fitK2[1]]);
    if (fitK2.length >= 3) attempts.push([fitK2[0], fitK2[2]]);
  }
  for (const place of fitK1.slice(0, SINGLE_ATTEMPTS)) {
    attempts.push([place]);
  }

  // Факты причин по всему кандидатскому пулу: prev-соседа нет — близость к старту.
  const proximities = pool.map((c) => haversineMeters(c.coordinates, input.start));
  const minProximity = proximities.length > 0 ? Math.min(...proximities) : 0;
  const weightOf = (category: string): number => {
    const raw = input.categoryWeights[category];
    return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : 0;
  };

  const validMetrics = (segment: WalkRouteSegment): boolean =>
    Number.isFinite(segment.distanceMeters) &&
    segment.distanceMeters >= 0 &&
    Number.isFinite(segment.durationSeconds) &&
    segment.durationSeconds >= 0;

  let routeCalls = 0;
  let lastDetail = fitK2.length === 0 && fitK1.length === 0
    ? 'нет кандидатов в пределах гардов по прямой'
    : 'все попытки не влезли в бюджет или не построились';

  const tryRoute = async (waypoints: WalkLatLng[]): Promise<WalkRouteSegment | null> => {
    try {
      const segment = await ports.route({ waypoints });
      if (!validMetrics(segment)) {
        lastDetail = 'порт вернул некорректные метрики петли';
        return null;
      }
      return segment;
    } catch (e) {
      lastDetail = `петля через кандидатов не построилась: ${errMessage(e)}`;
      return null;
    }
  };

  for (const attempt of attempts) {
    if (routeCalls >= MAX_ROUTE_CALLS) break;
    const cuts: WalkLatLng[] = attempt.map((p) => p.coordinates);
    const isSingle = attempt.length === 1;

    // K=1 — треугольная петля вместо out-and-back: out-and-back ходит 100%
    // туда-сюда по одной улице. Апекс — на перпендикуляре от середины линии
    // старт-кандидат, сторона детерминирована координатами старта. Роутер
    // упал на треугольнике — фолбэк на старый out-and-back: честно хуже,
    // но лучше ничего.
    const shapeCuts = isSingle
      ? [...cuts, buildTriangleApex(input.start, cuts[0], triangleSideFor(input.start))]
      : cuts;
    routeCalls += 1;
    let segment = await tryRoute([input.start, ...shapeCuts, input.start]);
    if (segment === null && isSingle && routeCalls < MAX_ROUTE_CALLS) {
      routeCalls += 1;
      segment = await tryRoute([input.start, ...cuts, input.start]);
      if (segment !== null) {
        shapeCuts.length = cuts.length; // фолбэк: резка только по кандидату
      }
    }
    if (segment === null) continue;

    // Маршрутная полилиния проходит через все вейпоинты подряд — режем на ноги
    // по ближайшим вершинам, метрики раскладываем пропорционально длине.
    const segments = splitPolylineByWaypoints(segment.geometry ?? [], shapeCuts);
    const metrics = splitRouteMetrics(segments, segment.distanceMeters, segment.durationSeconds);
    const shapeWaypoints: WalkLatLng[] = [input.start, ...shapeCuts, input.start];
    const legs: WalkLeg[] = shapeWaypoints.slice(0, -1).map((from, i) => ({
      from,
      to: shapeWaypoints[i + 1],
      distanceMeters: metrics[i].distanceMeters,
      durationMinutes: metrics[i].durationMinutes,
      geometry: segments[i],
    }));

    const stops: WalkStop[] = attempt.map((place) => {
      const idx = pool.findIndex((c) => c === place);
      const proximity = idx >= 0 ? proximities[idx] : haversineMeters(input.start, place.coordinates);
      const facts = {
        place,
        zoneWord: 'радиусе' as const,
        isBestOfCategory: pool.findIndex((c) => c.category === place.category) === idx,
        isClosest: proximity <= minProximity + EPS,
        proximityMeters: proximity,
      };
      return {
        place,
        stayMinutes: resolveStayMinutes(place, input.categoryStayMinutes),
        reason: buildAnchorReason(facts),
        reasonEn: buildAnchorReasonEn(facts),
      };
    });

    const totalWalkMinutes = legs.reduce((sum, leg) => sum + leg.durationMinutes, 0);
    const totalStayMinutes = stops.reduce((sum, s) => sum + s.stayMinutes, 0);
    const totalMinutes = totalWalkMinutes + totalStayMinutes;
    // Перебор продолжается, пока итог не влезает в бюджет ×1.1; нижнюю границу
    // деградация не добирает — «что есть, то есть». Гейты считаются честно,
    // их провал не блокирует: это запасной уровень лестницы.
    if (totalMinutes > limit + EPS) {
      lastDetail = `петля через «${attempt.map((p) => p.name).join('», «')}» — около ${Math.round(totalMinutes)} мин при бюджете ${Math.round(input.budgetMinutes)} мин`;
      continue;
    }

    const longLegs = legs.filter((leg) => leg.durationMinutes > MAX_LEG_MINUTES + 1e-6).length;
    const gates = evaluateGates({
      budgetMinutes: input.budgetMinutes,
      totalMinutes,
      stops,
      legDurations: legs.map((leg) => leg.durationMinutes),
      legGeometries: legs.map((leg) => leg.geometry),
      isLoop: true,
    });

    const plan: WalkPlan = {
      stops,
      legs,
      totalWalkMinutes,
      totalStayMinutes,
      totalMinutes,
      score: stops.reduce((sum, s) => sum + weightOf(s.place.category), 0) - longLegs,
      gates,
      allGatesPass: gates.every((g) => g.pass),
      degraded: { level: 'partial' },
    };
    return { ok: true, plan };
  }

  return {
    ok: false,
    failure: { code: 'NO_CANDIDATES', detail: `петля по кандидатам не сошлась: ${lastDetail}` },
  };
}

// --- Треугольная петля K=1 ---

/**
 * Апекс треугольной петли: на перпендикуляре к линии старт-кандидат, поднятом
 * из середины, на дистанции TRIANGLE_APEX_SHARE·d. Серединный перпендикуляр —
 * |апекс−старт| = |апекс−кандидат|: плечи петли симметричны. Чистая функция —
 * тестируется отдельно.
 */
export function buildTriangleApex(
  start: WalkLatLng,
  candidate: WalkLatLng,
  side: 1 | -1,
): WalkLatLng {
  const latPerM = 1 / EARTH_M_PER_DEG;
  const lngPerM = 1 / (EARTH_M_PER_DEG * Math.cos(start[0] * DEG));
  const dxM = (candidate[1] - start[1]) / lngPerM;
  const dyM = (candidate[0] - start[0]) / latPerM;
  const length = Math.hypot(dxM, dyM) || 1;
  const offset = TRIANGLE_APEX_SHARE * length * side;
  const mid: WalkLatLng = [(start[0] + candidate[0]) / 2, (start[1] + candidate[1]) / 2];
  // Перпендикуляр к (dx, dy) — (-dy, dx).
  const offsetX = (-dyM / length) * offset;
  const offsetY = (dxM / length) * offset;
  return [mid[0] + offsetY * latPerM, mid[1] + offsetX * lngPerM];
}

/** Сторона треугольника — детерминированно от координат старта (§13). */
export function triangleSideFor(start: WalkLatLng): 1 | -1 {
  const seed =
    (Math.abs(Math.round(start[0] * 1e7)) ^ Math.abs(Math.round(start[1] * 1e7))) >>> 0;
  return mulberry32(seed)() < 0.5 ? 1 : -1;
}

const EPS = 1e-9;

function validateInput(input: LoopThroughInput): WalkFailure | null {
  if (!isFiniteLatLng(input.start)) {
    return { code: 'INVALID_INPUT', detail: 'start: ожидается [широта, долгота] с конечными числами' };
  }
  if (
    typeof input.budgetMinutes !== 'number' ||
    !Number.isFinite(input.budgetMinutes) ||
    input.budgetMinutes <= 0
  ) {
    return { code: 'INVALID_INPUT', detail: 'budgetMinutes: положительное конечное число' };
  }
  if (!Array.isArray(input.candidates)) {
    return { code: 'INVALID_INPUT', detail: 'candidates: массив мест' };
  }
  return null;
}

function isFiniteLatLng(p: unknown): p is WalkLatLng {
  return (
    Array.isArray(p) &&
    p.length === 2 &&
    Number.isFinite(p[0]) &&
    Number.isFinite(p[1]) &&
    Math.abs(p[0] as number) <= 90 &&
    Math.abs(p[1] as number) <= 180
  );
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
