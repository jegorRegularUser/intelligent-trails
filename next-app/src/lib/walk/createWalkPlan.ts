// src/lib/walk/createWalkPlan.ts
// Оркестрация движка (docs/walk-engine.md §4): зона → отбор → матрица →
// деградация по null-ячейкам → дешёвые отказы → жадный подбор остановок →
// NN + 2-opt → реальные ноги через порт → гейты → причины → альтернативы.
// Детерминизм: сидированный джиттер, никакого случайного состояния (§13).

import type {
  WalkFailure,
  WalkFailureCode,
  WalkInput,
  WalkLatLng,
  WalkLeg,
  WalkPlan,
  WalkPlanResult,
  WalkPlace,
  WalkStop,
} from './types';
import {
  BUDGET_TOLERANCE,
  DEFAULT_WALKING_SPEED_KMH,
  MAX_CANDIDATES,
  MAX_LEG_MINUTES,
  MAX_STOPS,
} from './types';
import type { WalkMatrixCell, WalkRouteSegment, WalkRoutingPort } from './ports';
import { haversineMeters } from './internal/geo';
import { resolveStayMinutes } from './internal/stay';
import { mulberry32 } from './internal/rng';
import { selectCandidates, type SelectionResult } from './selection';
import { solveWalkOrder, ringCost } from './ordering';
import { evaluateGates } from './gates';
import { buildAnchorReason } from './reasons';

// --- Параметры вариантов альтернатив (docs/walk-engine.md §11) ---

/** Джиттер весов: ±25% вокруг 1, сидированный. */
const JITTER_AMPLITUDE = 0.25;
/** Гео-джиттер: делитель радиуса петли / множитель ширины коридора. */
const ZONE_VARIANTS = [
  { radiusDivider: 4, corridorFactor: 1 },
  { radiusDivider: 3.4, corridorFactor: 1.3 },
  { radiusDivider: 5, corridorFactor: 0.75 },
] as const;

/** Доля бюджета под ходьбу при расчёте радиуса петли; остаток — stay и кривизна улиц. */
const LOOP_WALK_SHARE = 0.6;
const CORRIDOR_BASE_SHARE = 0.3;
const CORRIDOR_MIN_M = 300;
const CORRIDOR_MAX_M = 1500;

interface VariantParams {
  radiusDivider: number;
  corridorFactor: number;
  weightOf: (category: string) => number;
}

type VariantOutcome =
  | { plan: WalkPlan; failure?: undefined }
  | { plan?: undefined; failure: WalkFailure };

/**
 * Главная функция движка: план прогулки из кандидатов и порта маршрутизации.
 * До 3 альтернатив, отсортированных по гейтам и скору; либо честный отказ.
 */
export async function createWalkPlan(
  input: WalkInput,
  ports: WalkRoutingPort,
): Promise<WalkPlanResult> {
  const invalid = validateInput(input);
  if (invalid) return { ok: false, failure: invalid };

  const speedKmh = input.walkingSpeedKmh ?? DEFAULT_WALKING_SPEED_KMH;
  const speedMPerMin = (speedKmh * 1000) / 60;
  const candidates = input.candidates.filter((c) => isFiniteLatLng(c.coordinates));

  // Дешёвые отказы без порта (§4.5): нижние оценки времени по прямой линии.
  const timeFailure = cheapTimeFailure(input, candidates, speedMPerMin);
  if (timeFailure) return { ok: false, failure: timeFailure };

  const variants = buildVariants(input, candidates);
  const plans: WalkPlan[] = [];
  const failures: WalkFailure[] = [];

  for (const variant of variants) {
    const outcome = await buildVariantPlan(input, ports, variant, candidates, speedMPerMin);
    if (outcome.plan) plans.push(outcome.plan);
    else if (outcome.failure) failures.push(outcome.failure);
  }

  if (plans.length === 0) {
    return { ok: false, failure: pickMostInformative(failures) };
  }

  plans.sort(
    (a, b) =>
      Number(b.allGatesPass) - Number(a.allGatesPass) ||
      b.score - a.score ||
      a.totalMinutes - b.totalMinutes,
  );
  return { ok: true, plans };
}

// --- Отказы до порта ---

function cheapTimeFailure(
  input: WalkInput,
  candidates: WalkPlace[],
  speedMPerMin: number,
): WalkFailure | null {
  const limit = input.budgetMinutes * (1 + BUDGET_TOLERANCE);
  if (!input.isLoop && input.end) {
    // Любой пеший путь ≥ прямой линии: если прямая не влезает — ничего не влезет.
    const lowerBound = haversineMeters(input.start, input.end) / speedMPerMin;
    if (lowerBound > limit) {
      return {
        code: 'NOT_ENOUGH_TIME',
        detail: `даже по прямой ${round1(lowerBound)} мин — больше бюджета ${round1(input.budgetMinutes)} мин`,
      };
    }
    return null;
  }
  // Петля: минимальный кольцевой выход ≥ 2·прямая/скорость + stay ближайшего якоря.
  let minLoop = Infinity;
  for (const place of candidates) {
    const weight = input.categoryWeights[place.category];
    if (!(typeof weight === 'number' && Number.isFinite(weight) && weight > 0)) continue;
    const walk = (2 * haversineMeters(input.start, place.coordinates)) / speedMPerMin;
    minLoop = Math.min(minLoop, walk + resolveStayMinutes(place, input.categoryStayMinutes));
  }
  // Без взвешенных кандидатов проверки нет — вариант честно отвалится
  // на отборе с NO_CANDIDATES, а не с «Infinity мин» в отказе.
  if (Number.isFinite(minLoop) && minLoop > limit) {
    return {
      code: 'NOT_ENOUGH_TIME',
      detail: `даже до ближайшего якоря и обратно — не меньше ${round1(minLoop)} мин при бюджете ${round1(input.budgetMinutes)} мин`,
    };
  }
  return null;
}

// --- Один вариант плана ---

async function buildVariantPlan(
  input: WalkInput,
  ports: WalkRoutingPort,
  variant: VariantParams,
  candidates: WalkPlace[],
  speedMPerMin: number,
): Promise<VariantOutcome> {
  const isLoop = input.isLoop;
  const start = input.start;
  const end = input.end;
  const budget = input.budgetMinutes;
  const limit = budget * (1 + BUDGET_TOLERANCE);

  // 1. Зона поиска (§5): радиус петли или коридор А→Б.
  let zoneMeters: number;
  if (isLoop) {
    zoneMeters = (speedMPerMin * LOOP_WALK_SHARE * budget) / variant.radiusDivider;
  } else {
    const straight = haversineMeters(start, end!);
    zoneMeters = clamp(
      CORRIDOR_BASE_SHARE * straight * variant.corridorFactor,
      CORRIDOR_MIN_M,
      CORRIDOR_MAX_M,
    );
  }

  // 2. Отбор кандидатов в зону + cap 60 (§5).
  const selection = selectCandidates({
    start,
    end,
    isLoop,
    zoneMeters,
    weightOf: variant.weightOf,
    candidates,
    maxCount: MAX_CANDIDATES,
  });
  if (isLoop && selection.picked.length === 0) {
    return {
      failure: {
        code: 'NO_CANDIDATES',
        detail: `в радиусе ${Math.round(zoneMeters)} м нет кандидатов нужных категорий`,
      },
    };
  }

  // 3. Матрица времён по всем точкам сразу (§4.4); чанкинг — на стороне порта.
  const points: WalkLatLng[] = [start, ...selection.picked.map((p) => p.place.coordinates)];
  if (!isLoop) points.push(end!);
  const endIndex = points.length - 1;
  let cells: WalkMatrixCell[];
  try {
    cells = await ports.matrix(points, points);
  } catch (e) {
    return { failure: { code: 'NO_ROUTE', detail: `матрица недоступна: ${errMessage(e)}` } };
  }
  const times = buildTimeMatrix(cells, points.length);

  // 4. Деградация: null-ячейки к старту (и к финишу в А→Б) выбрасывают кандидата.
  const live = new Set<number>();
  selection.picked.forEach((_, i) => {
    const pi = i + 1;
    if (!Number.isFinite(times[0][pi]) || !Number.isFinite(times[pi][0])) return;
    if (!isLoop && (!Number.isFinite(times[pi][endIndex]) || !Number.isFinite(times[endIndex][pi]))) {
      return;
    }
    live.add(pi);
  });

  // 5. Точные отказы по матрице (§4.5).
  if (!isLoop) {
    const direct = times[0][endIndex];
    if (!Number.isFinite(direct)) {
      return { failure: { code: 'NO_ROUTE', detail: 'старт и финиш не связаны пешей сетью' } };
    }
    if (direct > limit) {
      return {
        failure: {
          code: 'NOT_ENOUGH_TIME',
          detail: `прямой путь ${round1(direct)} мин не влезает в бюджет ${round1(budget)} мин`,
        },
      };
    }
  } else {
    if (live.size < 2) {
      return {
        failure: {
          code: 'NO_CANDIDATES',
          detail: `достижимых якорей в зоне: ${live.size}, минимум для прогулки — 2`,
        },
      };
    }
    let minLoop = Infinity;
    for (const pi of live) {
      const stay = resolveStayMinutes(selection.picked[pi - 1].place, input.categoryStayMinutes);
      minLoop = Math.min(minLoop, 2 * times[0][pi] + stay);
    }
    if (minLoop > limit) {
      return {
        failure: {
          code: 'NOT_ENOUGH_TIME',
          detail: `даже до ближайшего якоря и обратно — ${round1(minLoop)} мин при бюджете ${round1(budget)} мин`,
        },
      };
    }
  }

  // 6. Жадный подбор количества остановок (§4.6): добавляем, пока влезает в 1.1·B;
  // неподходящий кандидат пропускается и не блокирует дешёвых следующих.
  const stayOf = new Map<number, number>();
  for (const pi of live) {
    stayOf.set(pi, resolveStayMinutes(selection.picked[pi - 1].place, input.categoryStayMinutes));
  }
  let chosen: number[] = [];
  for (let pi = 1; pi <= selection.picked.length; pi++) {
    if (!live.has(pi)) continue;
    if (chosen.length >= MAX_STOPS) break;
    const tentative = [...chosen, pi];
    const order = solveWalkOrder(times, tentative, { isLoop, endIndex });
    const stays = tentative.reduce((sum, v) => sum + stayOf.get(v)!, 0);
    if (order.walkMinutes + stays <= limit + 1e-9) chosen = tentative;
  }

  if (isLoop && chosen.length < 2) {
    return {
      failure: {
        code: 'NO_CANDIDATES',
        detail:
          chosen.length === 0
            ? 'в бюджет не влезает ни один якорь'
            : 'в бюджет влезает только один якорь, минимум для прогулки — 2',
      },
    };
  }

  // 7. Финальный порядок: NN + 2-opt (§7).
  const finalOrder = solveWalkOrder(times, chosen, { isLoop, endIndex });
  if (!Number.isFinite(finalOrder.walkMinutes)) {
    return { failure: { code: 'NO_ROUTE', detail: 'в подобранном наборе есть недостижимые переходы' } };
  }

  // 7b. Зеркало кольца (§7): 2-opt видит только времена и слеп к геометрии —
  // при равной стоимости два зеркальных обхода для него неотличимы, но один
  // может возвращаться по той же улице. Гейт улиц проверяется на реальных
  // ногах, поэтому при его провале пробуем обратный порядок и оставляем
  // вариант с большим числом пройденных гейтов.
  const sequencesToTry: number[][] = [finalOrder.sequence];
  if (isLoop && finalOrder.sequence.length >= 2) {
    const reversed = finalOrder.sequence.slice().reverse();
    if (ringCost(times, reversed, { isLoop, endIndex }) <= finalOrder.walkMinutes + 1e-9) {
      sequencesToTry.push(reversed);
    }
  }
  const totalGates = isLoop ? 4 : 3;

  const assemblePlan = async (
    sequence: number[],
  ): Promise<{ plan: WalkPlan; failure?: undefined } | { plan?: undefined; failure: WalkFailure }> => {
    // 8. Реальные ноги через роутинг (§4.8): «улицы, а не прямые линии».
    const legPath = isLoop ? [0, ...sequence, 0] : [0, ...sequence, endIndex];
    const legs: WalkLeg[] = [];
    for (let i = 0; i < legPath.length - 1; i++) {
      const from = points[legPath[i]];
      const to = points[legPath[i + 1]];
    let segment: WalkRouteSegment;
    try {
      segment = await ports.route({ waypoints: [from, to] });
    } catch (e) {
      return { failure: { code: 'NO_ROUTE', detail: `нога ${i + 1} не построена: ${errMessage(e)}` } };
    }
    if (
      !Number.isFinite(segment.distanceMeters) ||
      segment.distanceMeters < 0 ||
      !Number.isFinite(segment.durationSeconds) ||
      segment.durationSeconds < 0
    ) {
      return { failure: { code: 'NO_ROUTE', detail: `нога ${i + 1}: порт вернул некорректные метрики` } };
    }
      legs.push({
        from,
        to,
        distanceMeters: segment.distanceMeters,
        durationMinutes: segment.durationSeconds / 60,
        geometry: segment.geometry ?? [],
      });
    }

    // 9. Итоги и скор (§10).
    const stops: WalkStop[] = sequence.map((pi) => ({
      place: selection.picked[pi - 1].place,
      stayMinutes: stayOf.get(pi)!,
      reason: '',
    }));
    const totalWalkMinutes = legs.reduce((sum, leg) => sum + leg.durationMinutes, 0);
    const totalStayMinutes = stops.reduce((sum, stop) => sum + stop.stayMinutes, 0);
    const totalMinutes = totalWalkMinutes + totalStayMinutes;
    const longLegs = legs.filter((leg) => leg.durationMinutes > MAX_LEG_MINUTES + 1e-6).length;
    const score =
      stops.reduce((sum, stop) => sum + variant.weightOf(stop.place.category), 0) - longLegs;

    // 10. Причины якорей (§9) — факты выбора, по-русски.
    assignReasons(stops, selection, isLoop);

    // 11. Гейты качества (§8).
    const gates = evaluateGates({
      budgetMinutes: budget,
      totalMinutes,
      stops,
      legDurations: legs.map((leg) => leg.durationMinutes),
      legGeometries: legs.map((leg) => leg.geometry),
      isLoop,
    });

    return {
      plan: {
        stops,
        legs,
        totalWalkMinutes,
        totalStayMinutes,
        totalMinutes,
        score,
        gates,
        allGatesPass: gates.every((g) => g.pass),
      },
    };
  };

  let bestPlan: WalkPlan | null = null;
  let bestPassedGates = -1;
  let lastFailure: WalkFailure | null = null;
  for (const sequence of sequencesToTry) {
    const attempt = await assemblePlan(sequence);
    if (attempt.failure) {
      lastFailure = attempt.failure;
      continue;
    }
    const passedGates = attempt.plan.gates.filter((g) => g.pass).length;
    if (passedGates > bestPassedGates) {
      bestPlan = attempt.plan;
      bestPassedGates = passedGates;
    }
    if (bestPassedGates === totalGates) break; // идеально — зеркала не нужны
  }

  if (!bestPlan) {
    return { failure: lastFailure ?? { code: 'NO_ROUTE', detail: 'ноги маршрута не построены' } };
  }
  return { plan: bestPlan };
}

// --- Варианты альтернатив (§11) ---

function buildVariants(input: WalkInput, candidates: WalkPlace[]): VariantParams[] {
  const baseWeights = new Map<string, number>();
  for (const place of candidates) {
    if (baseWeights.has(place.category)) continue;
    const raw = input.categoryWeights[place.category];
    baseWeights.set(
      place.category,
      typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : 0,
    );
  }

  const jitters = ZONE_VARIANTS.map((_, index) => {
    if (index === 0) return null;
    const rng = mulberry32(index); // сиды 1 и 2 — фиксированы (детерминизм §13)
    const jitter = new Map<string, number>();
    for (const category of baseWeights.keys()) {
      jitter.set(category, 1 + JITTER_AMPLITUDE * (2 * rng() - 1));
    }
    return jitter;
  });

  return ZONE_VARIANTS.map((zone, index) => {
    const jitter = jitters[index];
    return {
      radiusDivider: zone.radiusDivider,
      corridorFactor: zone.corridorFactor,
      weightOf: (category: string): number => {
        const base = baseWeights.get(category) ?? 0;
        if (base <= 0) return 0;
        return jitter ? base * (jitter.get(category) ?? 1) : base;
      },
    };
  });
}

// --- Валидация и утилиты ---

function validateInput(input: WalkInput): WalkFailure | null {
  if (!isFiniteLatLng(input.start)) {
    return { code: 'INVALID_INPUT', detail: 'start: ожидается [широта, долгота] с конечными числами' };
  }
  if (!input.isLoop) {
    if (!input.end || !isFiniteLatLng(input.end)) {
      return { code: 'INVALID_INPUT', detail: 'режим А→Б (isLoop: false) требует end: [широта, долгота]' };
    }
    if (haversineMeters(input.start, input.end) < 1) {
      return { code: 'INVALID_INPUT', detail: 'старт и финиш совпадают — для кольца используйте isLoop: true' };
    }
  }
  if (
    typeof input.budgetMinutes !== 'number' ||
    !Number.isFinite(input.budgetMinutes) ||
    input.budgetMinutes <= 0
  ) {
    return { code: 'INVALID_INPUT', detail: 'budgetMinutes: положительное конечное число' };
  }
  if (input.walkingSpeedKmh !== undefined) {
    const speed = input.walkingSpeedKmh;
    if (typeof speed !== 'number' || !Number.isFinite(speed) || speed <= 0 || speed > 15) {
      return { code: 'INVALID_INPUT', detail: 'walkingSpeedKmh: значение в диапазоне (0, 15]' };
    }
  }
  const hasPositiveWeight =
    !!input.categoryWeights &&
    typeof input.categoryWeights === 'object' &&
    Object.values(input.categoryWeights).some(
      (v) => typeof v === 'number' && Number.isFinite(v) && v > 0,
    );
  if (!hasPositiveWeight) {
    return { code: 'INVALID_INPUT', detail: 'categoryWeights: нужен хотя бы один конечный вес > 0' };
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

function buildTimeMatrix(cells: WalkMatrixCell[], size: number): number[][] {
  const times: number[][] = Array.from({ length: size }, () => Array<number>(size).fill(Infinity));
  for (let i = 0; i < size; i++) times[i][i] = 0;
  for (const cell of cells) {
    const { sourceIndex, targetIndex, durationSeconds } = cell;
    if (sourceIndex < 0 || sourceIndex >= size || targetIndex < 0 || targetIndex >= size) continue;
    if (durationSeconds === null || durationSeconds === undefined) continue;
    const minutes = durationSeconds / 60;
    if (Number.isFinite(minutes) && minutes >= 0) times[sourceIndex][targetIndex] = minutes;
  }
  return times;
}

function assignReasons(stops: WalkStop[], selection: SelectionResult, isLoop: boolean): void {
  const zoneWord = isLoop ? 'радиусе' : 'коридоре';
  const proximities = stops.map((stop) => selection.proximity.get(stop.place) ?? 0);
  const minProximity = proximities.length > 0 ? Math.min(...proximities) : 0;
  stops.forEach((stop, i) => {
    stop.reason = buildAnchorReason({
      place: stop.place,
      zoneWord,
      isBestOfCategory: selection.bestByCategory.get(stop.place.category) === stop.place,
      isClosest: proximities[i] <= minProximity + 1e-9,
      proximityMeters: proximities[i],
    });
  });
}

/** Когда ни один вариант не дал плана — самый информативный отказ. */
const FAILURE_PRIORITY: WalkFailureCode[] = ['NOT_ENOUGH_TIME', 'NO_ROUTE', 'NO_CANDIDATES', 'INVALID_INPUT'];

function pickMostInformative(failures: WalkFailure[]): WalkFailure {
  for (const code of FAILURE_PRIORITY) {
    const found = failures.find((f) => f.code === code);
    if (found) return found;
  }
  return { code: 'NO_CANDIDATES', detail: 'не удалось построить ни один вариант плана' };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
