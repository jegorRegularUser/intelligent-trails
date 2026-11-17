// src/lib/walk/streetFirst.ts
// Первичный конвейер «улица первична» (docs/walk-engine.md §19, ревизия
// 2026-11-18): для всех прогулочных вайбов, кроме дождя, план строится ОТ
// УЛИЦЫ — уличная петля (streetLoop, умная роза со снапом к характерным
// секторам) сама заполняет бюджет, а POI-якоря — гарниш 0–2 в коридоре
// петли, только если влезают в бюджет после уличного времени. План с
// 0 якорей — валиден и хорош.
//
// Фазы (§19.1–19.3):
//   1. резерв под гарниш → петля на B − reserve, до 3 чистых вариантов;
//   2. гарниш в коридор каждой петли (0–2 якоря, бюджет-гард 1.1·B);
//   3. добор: если гарниш не встал и итог недобрал пола 0.9·B — петля
//      перестраивается на полный бюджет (улицы не кончаются — петля обязана
//      уметь заполнить бюджет сама). Фаза не запускается при живом гарнише:
//      план с якорем и недобором честнее петли без содержимого.
//
// Отказы: только NO_ROUTE петли (роутер недоступен) или INVALID_INPUT —
// пустой пул кандидатов это 0 гарниша, а не отказ прогулки. Детерминизм §13:
// фиксированный сид розы, порядок вариантов = порядок альтернатив.
//
// Чистый модуль: ./types, ./ports, ./internal/*, ./gates, ./garnish,
// ./streetLoop — никакого UI, vibes и сети (кандидаты приходят
// отскоренными, порядок задаёт action).

import type {
  WalkFailure,
  WalkLatLng,
  WalkPlace,
  WalkPlan,
  WalkStreetFeature,
  WalkStreetHints,
} from './types';
import { FLOOR_SHARE } from './types';
import type { WalkRoutingPort } from './ports';
import { validateWalkCore } from './internal/geo-utils';
import { buildStreetLoop } from './streetLoop';
import {
  attachGarnish,
  reserveMinutesForGarnish,
  selectGarnishCandidates,
} from './garnish';
import { evaluateGates } from './gates';

/** Общий кап route-вызовов порта на всю сборку street-first (§19.2). */
export const STREET_FIRST_ROUTE_CAP = 28;
/** Максимум чистых вариантов-альтернатив (§19.2). */
export const STREET_FIRST_MAX_PLANS = 3;
/** Допуск оценки к полу бюджета в фазе добора. */
const FLOOR_EPS = 1e-9;

export interface StreetFirstInput {
  start: WalkLatLng;
  budgetMinutes: number;
  speedKmh?: number;
  /** Кандидаты в скор-порядке экшена (гарниш-пул; пустой — валиден). */
  candidates: WalkPlace[];
  categoryWeights: Record<string, number>;
  categoryStayMinutes?: Record<string, number>;
  categoryLimits?: Record<string, number>;
  /** Данные среды (S6): hints → снап розы, features → микро-стопы и гейт. */
  streetHints?: WalkStreetHints;
  streetFeatures?: WalkStreetFeature[];
  ports: WalkRoutingPort;
}

export type StreetFirstResult =
  | { ok: true; plans: WalkPlan[] }
  | { ok: false; failure: WalkFailure };

/**
 * Сборка уличных планов (§19): до 3 альтернатив, отсортированных приоритетом
 * вариантов розы; маркировка kind 'street' + факты снапа; деградация
 * 'street-no-data' при отсутствии данных среды (§19.5).
 */
export async function buildStreetFirstPlans(
  input: StreetFirstInput,
): Promise<StreetFirstResult> {
  const invalid = validateInput(input);
  if (invalid) return { ok: false, failure: invalid };

  const calls = { count: 0, max: STREET_FIRST_ROUTE_CAP };
  const hasStreetData = input.streetHints?.hasData === true;

  // Фаза 1: петля на бюджет минус резерв под гарниш (§19.3).
  const reserve = reserveMinutesForGarnish({
    candidates: input.candidates,
    categoryWeights: input.categoryWeights,
    categoryStayMinutes: input.categoryStayMinutes,
    budgetMinutes: input.budgetMinutes,
  });
  const loopBudget = Math.max(1, input.budgetMinutes - reserve);
  const loop = await buildStreetLoop(
    {
      start: input.start,
      budgetMinutes: loopBudget,
      speedKmh: input.speedKmh,
      streetHints: input.streetHints,
      streetFeatures: input.streetFeatures,
      maxCleanPlans: STREET_FIRST_MAX_PLANS,
      routeCalls: calls,
      ports: input.ports,
    },
  );
  if (!loop.ok) return loop;
  const loopPlans = [loop.plan, ...(loop.extraPlans ?? [])];

  // Фаза 2: гарниш в коридор каждой петли — 0 якорей валиден (§19.3).
  const plans: WalkPlan[] = [];
  for (const loopPlan of loopPlans) {
    plans.push(await garnishPlan(input, loopPlan, hasStreetData, calls));
  }

  // Фаза 3 (§19.3): гарниш не встал и главная петля недобрала пола —
  // перестраиваем на полный бюджет. У rebuilt-планов гарниш не ищется:
  // при полном бюджете комнаты под стоянку почти нет, а repeated-поиск
  // потратил бы остаток капа впустую.
  const primary = plans[0];
  const underfloor = primary.totalMinutes < input.budgetMinutes * FLOOR_SHARE - FLOOR_EPS;
  if (reserve > 0 && primaryGarnishCount(primary) === 0 && underfloor && calls.count < calls.max) {
    const rebuilt = await buildStreetLoop({
      start: input.start,
      budgetMinutes: input.budgetMinutes,
      speedKmh: input.speedKmh,
      streetHints: input.streetHints,
      streetFeatures: input.streetFeatures,
      maxCleanPlans: STREET_FIRST_MAX_PLANS,
      routeCalls: calls,
      ports: input.ports,
    });
    if (rebuilt.ok) {
      const rebuiltPlans = [rebuilt.plan, ...(rebuilt.extraPlans ?? [])].map((plan) =>
        markStreetPlan(plan, hasStreetData),
      );
      return { ok: true, plans: rebuiltPlans };
    }
    // Перестройка не сошлась — отдаём планы фазы 1/2 как есть: недобор
    // честно видит гейт бюджета, фиктивных минут нет (§12).
  }

  return { ok: true, plans };
}

/** Число якорей-гарниша на плане (stops — всегда гарниш у street-плана). */
function primaryGarnishCount(plan: WalkPlan): number {
  return plan.stops.length;
}

/**
 * Гарниш одной петли + финальная сборка плана: реальные ноги после вставок,
 * честные итоги, уличные гейты (§19.4), маркировка §19.5.
 */
async function garnishPlan(
  input: StreetFirstInput,
  loopPlan: WalkPlan,
  hasStreetData: boolean,
  calls: { count: number; max: number },
): Promise<WalkPlan> {
  const plan = markStreetPlan(loopPlan, hasStreetData);

  const eligible = selectGarnishCandidates({
    legs: plan.legs,
    candidates: input.candidates,
    categoryWeights: input.categoryWeights,
  });
  if (eligible.length === 0 || calls.count >= calls.max) return plan;

  const garnish = await attachGarnish({
    budgetMinutes: input.budgetMinutes,
    legs: plan.legs,
    categoryWeights: input.categoryWeights,
    categoryStayMinutes: input.categoryStayMinutes,
    categoryLimits: input.categoryLimits,
    streetFeatures: input.streetFeatures,
    ports: input.ports,
    routeCalls: calls,
    candidates: eligible,
  });

  const totalWalkMinutes = garnish.legs.reduce((sum, leg) => sum + leg.durationMinutes, 0);
  const totalStayMinutes = garnish.stops.reduce((sum, stop) => sum + stop.stayMinutes, 0);
  const longLegs = garnish.legs.filter((l) => l.durationMinutes > 25 + 1e-6).length;
  const gates = evaluateGates({
    budgetMinutes: input.budgetMinutes,
    totalMinutes: totalWalkMinutes + totalStayMinutes,
    stops: garnish.stops,
    legDurations: garnish.legs.map((leg) => leg.durationMinutes),
    legGeometries: garnish.legs.map((leg) => leg.geometry),
    isLoop: true,
    planType: 'street',
    streetSnappedSectors: plan.streetSnappedSectors,
    streetHasData: hasStreetData,
  });

  return {
    ...plan,
    stops: garnish.stops,
    legs: garnish.legs,
    totalWalkMinutes,
    totalStayMinutes,
    totalMinutes: totalWalkMinutes + totalStayMinutes,
    score:
      garnish.stops.reduce(
        (sum, stop) => sum + (input.categoryWeights[stop.place.category] ?? 0),
        0,
      ) - longLegs,
    gates,
    allGatesPass: gates.every((g) => g.pass),
  };
}

/** Маркировка уличного плана (§19.5): kind всегда, деградация — по данным среды. */
function markStreetPlan(plan: WalkPlan, hasStreetData: boolean): WalkPlan {
  return {
    ...plan,
    kind: 'street',
    ...(hasStreetData ? {} : { degraded: { level: 'street-no-data' as const } }),
  };
}

function validateInput(input: StreetFirstInput): WalkFailure | null {
  // Стержень старт/бюджет (R6); кандидаты у street-first могут быть пусты —
  // это 0 гарниша, а не отказ (§19.1).
  const coreIssue = validateWalkCore(input);
  if (coreIssue) return { code: 'INVALID_INPUT', detail: coreIssue };
  return null;
}
