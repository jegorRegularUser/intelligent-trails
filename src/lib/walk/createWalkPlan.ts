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
  DEFAULT_CATEGORY_LIMIT,
  DEFAULT_WALKING_SPEED_KMH,
  MAX_CANDIDATES,
  MAX_LEG_MINUTES,
} from './types';
import type { WalkMatrixCell, WalkRouteSegment, WalkRoutingPort } from './ports';
import { haversineMeters } from './internal/geo';
import { resolveStayMinutes } from './internal/stay';
import { mulberry32 } from './internal/rng';
import { selectCandidates, type SelectionResult } from './selection';
import { solveWalkOrder, ringCost } from './ordering';
import { evaluateGates } from './gates';
import { buildAnchorReason, buildAnchorReasonEn } from './reasons';

// --- Параметры вариантов альтернатив (docs/walk-engine.md §11) ---

/** Джиттер весов: ±25% вокруг 1, сидированный. */
const JITTER_AMPLITUDE = 0.25;
/** Гео-джиттер: делитель радиуса петли / множитель ширины коридора.
 *  Делители подобраны под «ходьба — главная часть бюджета»: при 4 радиус
 *  60-минутной зелёной петли выходил ~675 м, реальная ходьба получалась
 *  20–25 мин при бюджете 60 («путь 20 минут, а пишет 60»). */
const ZONE_VARIANTS = [
  { radiusDivider: 3, corridorFactor: 1 },
  { radiusDivider: 2.6, corridorFactor: 1.3 },
  { radiusDivider: 3.8, corridorFactor: 0.75 },
] as const;

/** Доля бюджета под ходьбу при расчёте радиуса петли; остаток — stay и кривизна улиц. */
const LOOP_WALK_SHARE = 0.6;
/** Разнос якорей петли (§4.6): бюджеты от этого порога получают минимальный
 *  зазор между остановками — против «трёх точек в квартале» в плотном центре. */
const GAP_MIN_BUDGET = 45;
const GAP_MIN_METERS = 300;
const GAP_ZONE_DIVISOR = 2.5;
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

  // ЕДИНЫЙ отбор + ЕДИНАЯ матрица на все варианты: матрица (N+1)² — самая
  // дорогая часть по квоте роутера, а зоны трёх вариантов перекрываются почти
  // полностью (максимальная зона включает две другие). Раньше каждый вариант
  // строил свою матрицу — расход клеток был ×3.
  const baseWeightOf = (category: string): number => {
    const w = input.categoryWeights[category];
    return typeof w === 'number' && Number.isFinite(w) && w > 0 ? w : 0;
  };
  const baseZoneMeters = baseZone(input, variants, speedMPerMin);
  const baseSelection = selectCandidates({
    start: input.start,
    end: input.end,
    isLoop: input.isLoop,
    zoneMeters: baseZoneMeters,
    weightOf: baseWeightOf,
    candidates,
    maxCount: MAX_CANDIDATES,
  });
  if (input.isLoop && baseSelection.picked.length === 0) {
    return {
      ok: false,
      failure: {
        code: 'NO_CANDIDATES',
        detail: `в радиусе ${Math.round(baseZoneMeters)} м нет кандидатов нужных категорий`,
      },
    };
  }

  const points: WalkLatLng[] = [input.start, ...baseSelection.picked.map((p) => p.place.coordinates)];
  if (!input.isLoop) points.push(input.end!);
  const endIndex = points.length - 1;
  let cells: WalkMatrixCell[];
  try {
    cells = await ports.matrix(points, points);
  } catch (e) {
    return { ok: false, failure: { code: 'NO_ROUTE', detail: `матрица недоступна: ${errMessage(e)}` } };
  }
  const times = buildTimeMatrix(cells, points.length);

  // Деградация: null-ячейки к старту (и к финишу в А→Б) выбрасывают кандидата
  // из всех вариантов разом — матрица общая, и verdict общий.
  const liveBase = new Set<number>();
  baseSelection.picked.forEach((_, i) => {
    const pi = i + 1;
    if (!Number.isFinite(times[0][pi]) || !Number.isFinite(times[pi][0])) return;
    if (!input.isLoop && (!Number.isFinite(times[pi][endIndex]) || !Number.isFinite(times[endIndex][pi]))) {
      return;
    }
    liveBase.add(pi);
  });
  if (!input.isLoop) {
    const direct = times[0][endIndex];
    if (!Number.isFinite(direct)) {
      return { ok: false, failure: { code: 'NO_ROUTE', detail: 'старт и финиш не связаны пешей сетью' } };
    }
    if (direct > input.budgetMinutes * (1 + BUDGET_TOLERANCE)) {
      return {
        ok: false,
        failure: {
          code: 'NOT_ENOUGH_TIME',
          detail: `прямой путь ${round1(direct)} мин не влезает в бюджет ${round1(input.budgetMinutes)} мин`,
        },
      };
    }
  } else if (liveBase.size < 2) {
    return {
      ok: false,
      failure: {
        code: 'NO_CANDIDATES',
        detail: `достижимых якорей в зоне: ${liveBase.size}, минимум для прогулки — 2`,
      },
    };
  }

  const ctx: VariantContext = {
    baseSelection,
    points,
    times,
    endIndex,
    liveBase,
  };
  for (const variant of variants) {
    const outcome = await buildPlanForVariant(input, ports, variant, ctx, speedMPerMin);
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
  // Дедуп по составу якорей: джиттер весов и радиусы зон при кучном пуле
  // дают три КЛОНА одного плана («Вариант 1 из 3» листает одно и то же).
  // Слайдер честен, только когда варианты различаются набором мест.
  const seen = new Set<string>();
  const uniquePlans = plans.filter((plan) => {
    const signature = planSignature(plan);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
  return { ok: true, plans: uniquePlans };
}

/** Состав якорей без порядка: планы с одним набором мест — один вариант. */
function planSignature(plan: WalkPlan): string {
  return plan.stops
    .map((stop) => stop.place.id)
    .sort()
    .join(',');
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

// --- Один вариант плана (на единой матрице) ---

export interface VariantContext {
  /** Отбор по максимальной зоне, базовые веса без джиттера. */
  baseSelection: SelectionResult;
  /** Старт + отобранные кандидаты (А→Б: + финиш). Индексы совпадают с times. */
  points: WalkLatLng[];
  times: number[][];
  /** Индекс финиша в points (А→Б); в петле замыкание — в старт (0). */
  endIndex: number;
  /** Индексы точек с живой связкой к старту (и финишу в А→Б). */
  liveBase: Set<number>;
}

/** Максимальная зона из всех вариантов — база единого отбора (§5). */
function baseZone(
  input: WalkInput,
  variants: VariantParams[],
  speedMPerMin: number,
): number {
  if (input.isLoop) {
    const minDivider = Math.min(...variants.map((v) => v.radiusDivider));
    return (speedMPerMin * LOOP_WALK_SHARE * input.budgetMinutes) / minDivider;
  }
  const straight = haversineMeters(input.start, input.end!);
  const maxFactor = Math.max(...variants.map((v) => v.corridorFactor));
  return clamp(
    CORRIDOR_BASE_SHARE * straight * maxFactor,
    CORRIDOR_MIN_M,
    CORRIDOR_MAX_M,
  );
}

/** Потолок остановок растёт с бюджетом: длинная прогулка с 6 якорями
 *  забивалась долгими стоянками и проваливала walk_share (ходьба < 35%). */
function maxStopsForBudget(budget: number): number {
  if (budget <= 45) return 4;
  if (budget <= 75) return 6;
  return 8;
}

async function buildPlanForVariant(
  input: WalkInput,
  ports: WalkRoutingPort,
  variant: VariantParams,
  ctx: VariantContext,
  speedMPerMin: number,
): Promise<VariantOutcome> {
  const isLoop = input.isLoop;
  const budget = input.budgetMinutes;
  const limit = budget * (1 + BUDGET_TOLERANCE);
  const { baseSelection, points, times, endIndex, liveBase } = ctx;

  // 1. Зона варианта (§5) — фильтр единого отбора.
  let zoneMeters: number;
  if (isLoop) {
    zoneMeters = (speedMPerMin * LOOP_WALK_SHARE * budget) / variant.radiusDivider;
  } else {
    const straight = haversineMeters(input.start, input.end!);
    zoneMeters = clamp(
      CORRIDOR_BASE_SHARE * straight * variant.corridorFactor,
      CORRIDOR_MIN_M,
      CORRIDOR_MAX_M,
    );
  }

  // 2. Отбор варианта: подмножество базового списка, порядок — джиттер-скор
  //    (та же формула selectCandidates: 2·вес + рейтинг/5 − нормированная
  //    близость). Без сети — матрица общая, индексы базовые.
  const baseIndexByPlace = new Map<string, number>();
  baseSelection.picked.forEach((p, i) => baseIndexByPlace.set(`${p.place.id}`, i + 1));
  const normDenom = Math.max(zoneMeters, 1);
  const scored: Array<{ bi: number; score: number; prox: number }> = [];
  for (const [place, prox] of baseSelection.proximity) {
    const bi = baseIndexByPlace.get(`${place.id}`);
    if (bi === undefined || !liveBase.has(bi)) continue;
    if (!(prox <= zoneMeters)) continue; // зона варианта
    const w = variant.weightOf(place.category);
    if (!(w > 0)) continue;
    scored.push({ bi, prox, score: 2 * w + (place.rating ?? 0) / 5 - prox / normDenom });
  }
  scored.sort((a, b) => b.score - a.score); // стабильная сортировка (детерминизм)
  if (isLoop && scored.length === 0) {
    return {
      failure: {
        code: 'NO_CANDIDATES',
        detail: `в радиусе ${Math.round(zoneMeters)} м нет кандидатов нужных категорий`,
      },
    };
  }

  // 3. Точный отказ петли по живому подмножеству (§4.5).
  if (isLoop) {
    let minLoop = Infinity;
    for (const { bi } of scored) {
      const stay = resolveStayMinutes(baseSelection.picked[bi - 1].place, input.categoryStayMinutes);
      minLoop = Math.min(minLoop, 2 * times[0][bi] + stay);
    }
    if (Number.isFinite(minLoop) && minLoop > limit) {
      return {
        failure: {
          code: 'NOT_ENOUGH_TIME',
          detail: `даже до ближайшего якоря и обратно — ${round1(minLoop)} мин при бюджете ${round1(budget)} мин`,
        },
      };
    }
  }

  // 4. Жадный подбор остановок (§4.6): пока влезает в 1.1·B; кап категории,
  //    gap-разнос и живость — как раньше, но индексы глобальные (points).
  const stayOf = new Map<number, number>();
  for (const { bi } of scored) {
    stayOf.set(bi, resolveStayMinutes(baseSelection.picked[bi - 1].place, input.categoryStayMinutes));
  }
  const limitOfCategory = (category: string): number =>
    input.categoryLimits?.[category] ?? DEFAULT_CATEGORY_LIMIT;
  const maxStops = maxStopsForBudget(budget);

  const minGapMeters = isLoop && budget >= GAP_MIN_BUDGET
    ? Math.max(GAP_MIN_METERS, zoneMeters / GAP_ZONE_DIVISOR)
    : 0;
  const farEnough = (bi: number, chosenSeq: number[]): boolean => {
    if (!minGapMeters) return true;
    const p = baseSelection.picked[bi - 1].place.coordinates;
    return chosenSeq.every((j) => haversineMeters(p, baseSelection.picked[j - 1].place.coordinates) >= minGapMeters);
  };

  const greedy = (useGap: boolean): number[] => {
    const counts = new Map<string, number>();
    const chosenSeq: number[] = [];
    for (const { bi } of scored) {
      if (!liveBase.has(bi)) continue;
      if (chosenSeq.length >= maxStops) break;
      const category = baseSelection.picked[bi - 1].place.category;
      if ((counts.get(category) ?? 0) >= limitOfCategory(category)) continue;
      if (useGap && !farEnough(bi, chosenSeq)) continue;
      const tentative = [...chosenSeq, bi];
      const order = solveWalkOrder(times, tentative, { isLoop, endIndex });
      const stays = tentative.reduce((sum, v) => sum + stayOf.get(v)!, 0);
      if (order.walkMinutes + stays <= limit + 1e-9) {
        chosenSeq.push(bi);
        counts.set(category, (counts.get(category) ?? 0) + 1);
      }
    }
    return chosenSeq;
  };

  let chosen = greedy(true);
  if (isLoop && chosen.length < 2) chosen = greedy(false);

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

  // 5. Финальный порядок: NN + 2-opt (§7).
  const finalOrder = solveWalkOrder(times, chosen, { isLoop, endIndex });
  if (!Number.isFinite(finalOrder.walkMinutes)) {
    return { failure: { code: 'NO_ROUTE', detail: 'в подобранном наборе есть недостижимые переходы' } };
  }

  // 5b. Зеркало кольца (§7): при равной стоимости два зеркальных обхода для
  // 2-opt неотличимы, но один может возвращаться по той же улице.
  const sequencesToTry: number[][] = [finalOrder.sequence];
  if (isLoop && finalOrder.sequence.length >= 2) {
    const reversed = finalOrder.sequence.slice().reverse();
    if (ringCost(times, reversed, { isLoop, endIndex }) <= finalOrder.walkMinutes + 1e-9) {
      sequencesToTry.push(reversed);
    }
  }
  const totalGates = isLoop ? 5 : 3;

  const assemblePlan = async (
    sequence: number[],
  ): Promise<{ plan: WalkPlan; failure?: undefined } | { plan?: undefined; failure: WalkFailure }> => {
    // 6. Реальные ноги через роутинг (§4.8): «улицы, а не прямые линии».
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

    // 7. Итоги и скор (§10).
    const stops: WalkStop[] = sequence.map((bi) => ({
      place: baseSelection.picked[bi - 1].place,
      stayMinutes: stayOf.get(bi)!,
      reason: '',
    }));
    const totalWalkMinutes = legs.reduce((sum, leg) => sum + leg.durationMinutes, 0);
    const totalStayMinutes = stops.reduce((sum, stop) => sum + stop.stayMinutes, 0);
    const totalMinutes = totalWalkMinutes + totalStayMinutes;
    const longLegs = legs.filter((leg) => leg.durationMinutes > MAX_LEG_MINUTES + 1e-6).length;
    const score =
      stops.reduce((sum, stop) => sum + variant.weightOf(stop.place.category), 0) - longLegs;

    // 8. Причины якорей (§9) — факты варианта: best-of-category по его
    //    скор-порядку, closest — минимальная близость среди выбранных.
    const proximities = stops.map((stop) => baseSelection.proximity.get(stop.place) ?? 0);
    const minProximity = proximities.length > 0 ? Math.min(...proximities) : 0;
    const bestOfCategory = new Map<string, string>();
    for (const { bi } of scored) {
      const place = baseSelection.picked[bi - 1].place;
      if (!bestOfCategory.has(place.category)) bestOfCategory.set(place.category, `${place.id}`);
    }
    const zoneWord = isLoop ? ('радиусе' as const) : ('коридоре' as const);
    stops.forEach((stop, i) => {
      const facts = {
        place: stop.place,
        zoneWord,
        isBestOfCategory: bestOfCategory.get(stop.place.category) === `${stop.place.id}`,
        isClosest: proximities[i] <= minProximity + 1e-9,
        proximityMeters: proximities[i],
      };
      stop.reason = buildAnchorReason(facts);
      stop.reasonEn = buildAnchorReasonEn(facts);
    });

    // 9. Гейты качества (§8).
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
