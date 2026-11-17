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
  FLOOR_SHARE,
  LEG_ALT_MIN_MINUTES,
  MAX_CANDIDATES,
  MAX_LEG_MINUTES,
  SAFETY_MARGIN_SHARE,
} from './types';
import type { WalkMatrixCell, WalkRouteSegment, WalkRoutingPort } from './ports';
import {
  fractionWithinCorridor,
  haversineMeters,
  loopAreaMeters,
  polylineLengthMeters,
  splitPolylineByWaypoints,
  splitRouteMetrics,
  viaOffsetForExtraMeters,
  viaPointFor,
  zoneMetersForBudget,
} from './internal/geo';
import { isFiniteLatLng, errMessage, validateWalkCore } from './internal/geo-utils';
import { attachMicroNotes } from './internal/microStops';
import { resolveStayMinutes } from './internal/stay';
import { mulberry32 } from './internal/rng';
import { candidateScore, selectCandidates, type SelectionResult } from './selection';
import { solveWalkOrder, ringCost } from './ordering';
import { evaluateGates, SAME_STREET_CORRIDOR_M, SAME_STREET_OVERLAP_THRESHOLD } from './gates';
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
/**
 * Общий кап route-вызовов порта на одну сборку (R3.c): альтернативы — самая
 * дорогая часть квоты роутера (до 3 маршрутов одним directions-запросом, но
 * запрос за запросом). Сверх капа ноги идут обычным route, план не страдает.
 */
const MAX_ROUTE_CALLS = 24;
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
  const baseZoneMeters = baseZone(input, variants, speedKmh);
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
    routeCalls: { count: 0 },
  };
  for (const variant of variants) {
    const outcome = await buildPlanForVariant(input, ports, variant, ctx, speedKmh);
    if (outcome.plan) plans.push(outcome.plan);
    else if (outcome.failure) failures.push(outcome.failure);
  }

  if (plans.length === 0) {
    return { ok: false, failure: pickMostInformative(failures) };
  }

  plans.sort(compareWalkPlans(input.isLoop));
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

/**
 * Покрытие петли — площадь замкнутой полилинии плана, м² (детерминированный
 * тайбрейкер сортировки: «прогулка, а не кратчайший путь» — при равном скор
 * побеждает петля, накрывшая больше города). Ноги склеиваются без дублей
 * узлов на стыке; пустая геометрия/out-and-back → 0 (тайбрейкер уходит в
 * totalMinutes). Чистая функция — экспортируется для тестов.
 */
export function loopCoverage(plan: Pick<WalkPlan, 'legs'>): number {
  const points: WalkLatLng[] = [];
  for (const leg of plan.legs) {
    for (const point of leg.geometry) {
      const last = points[points.length - 1];
      if (!last || Math.abs(last[0] - point[0]) > 1e-9 || Math.abs(last[1] - point[1]) > 1e-9) {
        points.push(point);
      }
    }
  }
  return loopAreaMeters(points);
}

/** Ключи сортировки вариантов — ровно то, что читает компаратор. */
export type PlanSortKey = Pick<WalkPlan, 'allGatesPass' | 'score' | 'totalMinutes' | 'legs'>;

/**
 * Тотальный порядок вариантов (§10 волны «Прогулка»): гейты pass → скор →
 * покрытие петли (только isLoop: у А→Б площади нет) → короче. Равное
 * покрытие (out-and-back, пустая геометрия) уходит в totalMinutes.
 * Экспортируется для тестов сортировки.
 */
export function compareWalkPlans(
  isLoop: boolean,
): (a: PlanSortKey, b: PlanSortKey) => number {
  const coverageOf = (plan: PlanSortKey): number => (isLoop ? loopCoverage(plan) : 0);
  return (a, b) =>
    Number(b.allGatesPass) - Number(a.allGatesPass) ||
    b.score - a.score ||
    coverageOf(b) - coverageOf(a) ||
    a.totalMinutes - b.totalMinutes;
}

// --- Альтернативные маршруты ноги (docs/walk-loop-quality.md R3.c) ---

export interface LegVariantCandidate {
  distanceMeters: number;
  durationMinutes: number;
  geometry: WalkLatLng[];
}

/**
 * Выбор варианта ноги среди ответов routeAlternatives. Правила дока:
 *  (а) минимум пересечения с уже принятыми ногами — та же механика, что у
 *      гейта «та же улица» (коридор 30 м, короткая нога в коридоре длинной);
 *  (б) при равном пересечении — самый длинный, влезающий в потолок 1.1·B
 *      (fitsCeiling — оценка полного плана с этой ногой);
 *  (в) тайбрейкер — порядок входа: основной маршрут у порта всегда первый.
 * Кандидаты без геометрии (<2 точек) из сравнения пересечений исключены:
 * fractionWithinCorridor на пустой полилинии даёт 0, и такая нога вытесняла
 * бы честные. Возвращает ИНДЕКС выбранного; -1 — ни один не влезает в
 * потолок (вызывающая сторона оставляет основной как есть). Чистая функция —
 * тестируется на синтетических полилиниях без порта.
 */
export function chooseLegVariant(
  candidates: LegVariantCandidate[],
  acceptedGeometries: WalkLatLng[][],
  fitsCeiling: (durationMinutes: number) => boolean,
): number {
  let best = -1;
  let bestOverlap = Infinity;
  let bestMinutes = -1;
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    if (!fitsCeiling(candidate.durationMinutes)) continue;
    if (candidate.geometry.length < 2) continue;
    const overlap = maxOverlapOnAccepted(candidate.geometry, acceptedGeometries);
    if (
      overlap < bestOverlap - 1e-9 ||
      (overlap <= bestOverlap + 1e-9 && candidate.durationMinutes > bestMinutes)
    ) {
      best = i;
      bestOverlap = overlap;
      bestMinutes = candidate.durationMinutes;
    }
  }
  if (best >= 0) return best;
  // Сравнимых геометрий нет вовсе — первый влезающий (основной первым).
  for (let i = 0; i < candidates.length; i++) {
    if (fitsCeiling(candidates[i].durationMinutes)) return i;
  }
  return -1;
}

/** Максимум доли перекрытия geometry с уже принятыми ногами петли. */
function maxOverlapOnAccepted(
  geometry: WalkLatLng[],
  accepted: WalkLatLng[][],
): number {
  let max = 0;
  for (const other of accepted) {
    if (other.length < 2) continue;
    // Замер по КОРОТКОЙ ноге пары — как в гейте улиц (gates.ts): после
    // ресемплинга плотность точек неравномерна, длина честнее числа точек.
    const [shorter, longer] =
      polylineLengthMeters(geometry) <= polylineLengthMeters(other)
        ? [geometry, other]
        : [other, geometry];
    max = Math.max(max, fractionWithinCorridor(shorter, longer, SAME_STREET_CORRIDOR_M));
  }
  return max;
}

function validMetrics(segment: WalkRouteSegment): boolean {
  return (
    Number.isFinite(segment.distanceMeters) &&
    segment.distanceMeters >= 0 &&
    Number.isFinite(segment.durationSeconds) &&
    segment.durationSeconds >= 0
  );
}

// --- Коридор бюджета (docs/walk-loop-quality.md R1) ---

const FLOOR_EPS = 1e-9;
/** Максимум via-удлинённых ног на план (R1.c): иначе одна короткая петля
 *  раздувается в серию крючков без остановок. */
const MAX_VIA_LEGS = 2;
/** Tune-кап на ногу (R1.c, как в streetLoop): 3 route-вызова на попытку. */
const VIA_TUNE_ATTEMPTS = 3;
/** Коррекция офсета: недолёт растёт, перелёт сжимается (коэффициенты streetLoop). */
const VIA_GROW_FACTOR = 1.3;
const VIA_SHRINK_FACTOR = 0.85;

/**
 * Чистый предикат недобора (R1.d): план короче пола коридора 0.9·B. Граница
 * (ровно пол) и перебор — не недобор. Экшен зовёт его после сборки, чтобы
 * решить, эскалировать ли пул кандидатов второй волной (≤1 эскалация).
 */
export function isUnderfloor(
  plan: Pick<WalkPlan, 'totalMinutes'>,
  budgetMinutes: number,
): boolean {
  return plan.totalMinutes < budgetMinutes * FLOOR_SHARE - FLOOR_EPS;
}

export interface FillToFloorParams {
  /** Порядок остановок (индексы матрицы) и ноги реальных метрик. */
  sequence: number[];
  legs: WalkLeg[];
  budgetMinutes: number;
  /** Матричная ходьба текущего кольца — база оценок добора (R1.b). */
  matrixWalkMinutes: number;
  /** Матрица минут; индекс 0 — старт, endIndex — финиш А→Б. */
  times: number[][];
  points: WalkLatLng[];
  /** stay кандидата по индексу матрицы. */
  stayOf: Map<number, number>;
  /** Кандидаты добора в скор-порядке (индексы матрицы), не выбранные ранее. */
  pool: number[];
  categoryOf: (bi: number) => string;
  limitOfCategory: (category: string) => number;
  /** Та же политика, что у жадного набора: maxStopsForBudget (R1.b). */
  maxStops: number;
  farEnough: (bi: number, sequence: number[]) => boolean;
  isLoop: boolean;
  endIndex: number;
  ports: WalkRoutingPort;
  /** Счётчик вызовов порта — общий на сборку (R3.c). */
  routeCalls: { count: number };
}

export interface FillToFloorResult {
  sequence: number[];
  legs: WalkLeg[];
  matrixWalkMinutes: number;
}

/**
 * Добор до пола коридора 0.9·B (R1): сначала остановками из пула (та же
 * политика, что у жадного набора: maxStops, кап категории, gap; оценка по
 * матрице с запасом SAFETY_MARGIN, вставка заменяет одну ногу двумя), затем
 * via-удлинением длиннейших ног. Реальный total после каждого добора
 * проверяется на потолок 1.1·B — вылетел, откат последнего добора и стоп
 * (инвариант §12 walk-engine.md). Не дотянули — план возвращается как есть:
 * недобор честно видит гейт budget, фиктивных минут нет. L2/L3 деградации
 * эта функция не касается.
 */
export async function fillToFloor(params: FillToFloorParams): Promise<FillToFloorResult> {
  const { budgetMinutes, times, points, stayOf, ports, routeCalls } = params;
  const floor = budgetMinutes * FLOOR_SHARE;
  const ceiling = budgetMinutes * (1 + BUDGET_TOLERANCE);
  const estimateCap = ceiling - budgetMinutes * SAFETY_MARGIN_SHARE;

  const sequence = params.sequence.slice();
  const legs = params.legs.slice();
  let matrixWalk = params.matrixWalkMinutes;

  const staysOf = (seq: number[]): number =>
    seq.reduce((sum, bi) => sum + (stayOf.get(bi) ?? 0), 0);
  const walkOf = (ls: WalkLeg[]): number =>
    ls.reduce((sum, leg) => sum + leg.durationMinutes, 0);
  const totalOf = (seq: number[], ls: WalkLeg[]): number => walkOf(ls) + staysOf(seq);
  const tail = params.isLoop ? 0 : params.endIndex;

  // --- R1.b: добор остановками ---
  const chosen = new Set(sequence);
  const counts = new Map<string, number>();
  for (const bi of sequence) {
    const category = params.categoryOf(bi);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  const skipped = new Set<number>();
  for (const bi of params.pool) {
    if (totalOf(sequence, legs) >= floor - FLOOR_EPS) break; // пол достигнут
    if (chosen.has(bi) || skipped.has(bi)) continue;
    if (sequence.length >= params.maxStops) break;
    const category = params.categoryOf(bi);
    if ((counts.get(category) ?? 0) >= params.limitOfCategory(category)) continue;
    if (!params.farEnough(bi, sequence)) continue;
    const stay = stayOf.get(bi) ?? 0;
    // Лучшее плечо вставки по матрице: кандидат создаёт ДВЕ ноги из одной
    // (R1.b), оценка — через матрицу этих двух плеч.
    let bestPos = -1;
    let bestDelta = Infinity;
    for (let pos = 0; pos <= sequence.length; pos++) {
      const prev = pos === 0 ? 0 : sequence[pos - 1];
      const next = pos === sequence.length ? tail : sequence[pos];
      if (
        !Number.isFinite(times[prev][bi]) ||
        !Number.isFinite(times[bi][next]) ||
        !Number.isFinite(times[prev][next])
      ) {
        continue;
      }
      const delta = times[prev][bi] + times[bi][next] - times[prev][next];
      if (delta < bestDelta) {
        bestDelta = delta;
        bestPos = pos;
      }
    }
    if (bestPos < 0) {
      skipped.add(bi);
      continue;
    }
    const estimate = matrixWalk + bestDelta + staysOf(sequence) + stay;
    if (estimate > estimateCap + FLOOR_EPS) {
      skipped.add(bi);
      continue;
    }

    // Пересборка двух плеч реальным роутингом и честный бюджет.
    const prevPoint = points[bestPos === 0 ? 0 : sequence[bestPos - 1]];
    const nextPoint = points[bestPos === sequence.length ? tail : sequence[bestPos]];
    const midPoint = points[bi];
    routeCalls.count += 1;
    const rebuiltA = await routeLeg(ports, prevPoint, midPoint);
    routeCalls.count += 1;
    const rebuiltB = await routeLeg(ports, midPoint, nextPoint);
    if (!rebuiltA || !rebuiltB) {
      // Маршрутный отказ — кандидат пропускается, добор продолжается.
      skipped.add(bi);
      continue;
    }
    const trialSequence = sequence.slice();
    trialSequence.splice(bestPos, 0, bi);
    const trialLegs = legs.slice();
    trialLegs.splice(bestPos, 1, rebuiltA, rebuiltB);
    if (totalOf(trialSequence, trialLegs) > ceiling + FLOOR_EPS) {
      // Реальный total вылетел за 1.1·B — откат последнего добора и стоп:
      // матрица здесь врёт сильнее запаса, потолок — инвариант §12.
      break;
    }
    sequence.splice(bestPos, 0, bi);
    legs.splice(bestPos, 1, rebuiltA, rebuiltB);
    matrixWalk += bestDelta;
    chosen.add(bi);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  // --- R1.c: via-удлинение ноги ---
  const viaTried = new Set<WalkLeg>();
  let viaLegs = 0;
  while (totalOf(sequence, legs) < floor - FLOOR_EPS && viaLegs < MAX_VIA_LEGS) {
    // Кандидат — длиннейшая нога ≤ MAX_LEG_MINUTES − 2 мин: удлинённая нога
    // не должна пострадать от гейта long_legs (gates.ts).
    let pick = -1;
    let pickMinutes = -1;
    for (let i = 0; i < legs.length; i++) {
      if (viaTried.has(legs[i])) continue;
      if (legs[i].durationMinutes > MAX_LEG_MINUTES - 2 + FLOOR_EPS) continue;
      // Вырожденная нога (нули метрик) не удлиняется: крючка из точки не бывает.
      if (legs[i].durationMinutes <= 0 || legs[i].distanceMeters <= 0) continue;
      if (legs[i].durationMinutes > pickMinutes) {
        pick = i;
        pickMinutes = legs[i].durationMinutes;
      }
    }
    if (pick < 0) break;
    const leg = legs[pick];
    viaTried.add(leg);

    const missingMinutes = floor - totalOf(sequence, legs);
    const walkMinutes = walkOf(legs);
    const walkMeters = legs.reduce((sum, l) => sum + l.distanceMeters, 0);
    const planSpeed = walkMinutes > 0 ? walkMeters / walkMinutes : 0;
    if (!(planSpeed > 0)) break;
    // Целевое удлинение Δ — недостающие минуты × фактическая скорость плана:
    // реальные ноги несут кривизну улиц и профиль роутера (R1.c).
    let offset = viaOffsetForExtraMeters(leg.distanceMeters, missingMinutes * planSpeed);
    const side = viaSideFor(leg.from, leg.to);
    let accepted = false;
    let lastFitting: { subA: WalkLeg; subB: WalkLeg } | null = null;

    for (let attempt = 0; attempt < VIA_TUNE_ATTEMPTS && !accepted; attempt++) {
      const via = viaPointFor(leg.from, leg.to, offset, side);
      routeCalls.count += 1;
      let segment: WalkRouteSegment | null = null;
      try {
        const fetched = await ports.route({ waypoints: [leg.from, via, leg.to] });
        if (validMetrics(fetched)) segment = fetched;
      } catch {
        segment = null;
      }
      if (!segment || (segment.geometry ?? []).length < 2) {
        break; // NO_ROUTE или вырожденная геометрия — исходная нога сохраняется, следующая нога
      }
      const viaMinutes = segment.durationSeconds / 60;
      const pieces = splitPolylineByWaypoints(segment.geometry ?? [], [via]);
      const metrics = splitRouteMetrics(pieces, segment.distanceMeters, segment.durationSeconds);
      const subA: WalkLeg = {
        from: leg.from,
        to: via,
        distanceMeters: metrics[0].distanceMeters,
        durationMinutes: metrics[0].durationMinutes,
        geometry: pieces[0],
      };
      const subB: WalkLeg = {
        from: via,
        to: leg.to,
        distanceMeters: metrics[1].distanceMeters,
        durationMinutes: metrics[1].durationMinutes,
        geometry: pieces[1],
      };
      const newTotal = totalOf(sequence, legs) - leg.durationMinutes + viaMinutes;
      // Гейт loop_no_repeat_street обязан пройти: via может замкнуть
      // «туда-обратно» — проверяем пару плеч и оба плеча против остальных
      // ног (плечи одной ногой — иначе перекрытие размывается по кускам).
      const others = legs.filter((_, i) => i !== pick).map((l) => l.geometry);
      const legsOk =
        subA.durationMinutes <= MAX_LEG_MINUTES + FLOOR_EPS &&
        subB.durationMinutes <= MAX_LEG_MINUTES + FLOOR_EPS;
      if (!viaStreetClean(subA.geometry, subB.geometry, others) || !legsOk) break;
      if (newTotal > ceiling + FLOOR_EPS) {
        offset *= VIA_SHRINK_FACTOR;
        continue;
      }
      if (newTotal < floor - FLOOR_EPS) {
        // Влезает в потолок, пола не дотянул — запасной кандидат на случай,
        // если grow-попытки исчерпаются.
        lastFitting = { subA, subB };
        offset *= VIA_GROW_FACTOR;
        continue;
      }
      legs.splice(pick, 1, subA, subB);
      viaLegs += 1;
      accepted = true;
    }
    if (!accepted && lastFitting) {
      // Tune-попытки исчерпаны: берём последний результат в потолке — пол
      // может остаться недотянутым, гейт budget покажет недобор честно.
      legs.splice(pick, 1, lastFitting.subA, lastFitting.subB);
      viaLegs += 1;
    }
  }

  return { sequence, legs, matrixWalkMinutes: matrixWalk };
}

/** Одна нога обычным route: отказ порта/мусорные метрики → null (не бросает). */
async function routeLeg(
  ports: WalkRoutingPort,
  from: WalkLatLng,
  to: WalkLatLng,
): Promise<WalkLeg | null> {
  let segment: WalkRouteSegment;
  try {
    segment = await ports.route({ waypoints: [from, to] });
  } catch {
    return null;
  }
  if (!validMetrics(segment)) return null;
  return {
    from,
    to,
    distanceMeters: segment.distanceMeters,
    durationMinutes: segment.durationSeconds / 60,
    geometry: segment.geometry ?? [],
  };
}

/** Гейт улиц для via-кандидата: пара плеч + оба плеча (как одна нога) против остальных. */
function viaStreetClean(
  subA: WalkLatLng[],
  subB: WalkLatLng[],
  others: WalkLatLng[][],
): boolean {
  if (maxOverlapOnAccepted(subA, [subB]) > SAME_STREET_OVERLAP_THRESHOLD) return false;
  const combined =
    subB.length > 0 && subA.length > 0
      ? [...subA, ...subB.slice(1)]
      : [...subA, ...subB];
  return maxOverlapOnAccepted(combined, others) <= SAME_STREET_OVERLAP_THRESHOLD;
}

/** Сторона перпендикуляра via — детерминированно от координат ноги (§13). */
function viaSideFor(a: WalkLatLng, b: WalkLatLng): 1 | -1 {
  const seed =
    (Math.abs(Math.round(a[0] * 1e7)) ^
      Math.abs(Math.round(a[1] * 1e7)) ^
      Math.abs(Math.round(b[0] * 1e7)) ^
      Math.abs(Math.round(b[1] * 1e7))) >>> 0;
  return mulberry32(seed)() < 0.5 ? 1 : -1;
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
  /** Счётчик вызовов порта на сборку: общий для всех вариантов и зеркал
   *  (кап MAX_ROUTE_CALLS — квота роутера, R3.c). */
  routeCalls: { count: number };
}

/** Максимальная зона из всех вариантов — база единого отбора (§5). */
function baseZone(
  input: WalkInput,
  variants: VariantParams[],
  speedKmh: number,
): number {
  if (input.isLoop) {
    const minDivider = Math.min(...variants.map((v) => v.radiusDivider));
    return zoneMetersForBudget(input.budgetMinutes, speedKmh, LOOP_WALK_SHARE, minDivider);
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

/**
 * Минимальная зона вариантов петли (R2): самый узкий радиус из ZONE_VARIANTS.
 * Экшен режет пул диверсификации этой зоной — иначе сектора зальют шорт-лист
 * кандидатами, которых узкий вариант отсечёт по зоне (selection.ts), и он
 * умрёт NO_CANDIDATES. Экспортируется для actions/quickWalk.
 */
export function minimalLoopZoneMeters(
  budgetMinutes: number,
  speedKmh: number = DEFAULT_WALKING_SPEED_KMH,
): number {
  const maxDivider = Math.max(...ZONE_VARIANTS.map((v) => v.radiusDivider));
  return zoneMetersForBudget(budgetMinutes, speedKmh, LOOP_WALK_SHARE, maxDivider);
}

async function buildPlanForVariant(
  input: WalkInput,
  ports: WalkRoutingPort,
  variant: VariantParams,
  ctx: VariantContext,
  speedKmh: number,
): Promise<VariantOutcome> {
  const isLoop = input.isLoop;
  const budget = input.budgetMinutes;
  const limit = budget * (1 + BUDGET_TOLERANCE);
  const { baseSelection, points, times, endIndex, liveBase } = ctx;

  // 1. Зона варианта (§5) — фильтр единого отбора.
  let zoneMeters: number;
  if (isLoop) {
    zoneMeters = zoneMetersForBudget(budget, speedKmh, LOOP_WALK_SHARE, variant.radiusDivider);
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
    // Вариантный скор — та же формула, что у базового отбора (R2):
    // единая candidateScore, иначе отбор и вариант разъедутся.
    scored.push({ bi, prox, score: candidateScore(w, place.rating ?? 0, prox, normDenom) });
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
    //    Длинные ноги (матричная оценка > LEG_ALT_MIN_MINUTES) просят у порта
    //    альтернативы (R3.c): берётся маршрут с минимумом пересечения с уже
    //    принятыми ногами; при равном — длиннейший, влезающий в потолок.
    const legPath = isLoop ? [0, ...sequence, 0] : [0, ...sequence, endIndex];
    let legs: WalkLeg[] = [];
    const totalStayEstimate = sequence.reduce((sum, bi) => sum + stayOf.get(bi)!, 0);
    for (let i = 0; i < legPath.length - 1; i++) {
      const from = points[legPath[i]];
      const to = points[legPath[i + 1]];
      const matrixMinutes = times[legPath[i]][legPath[i + 1]];
      // Оценка потолка §12: матричный план этой сборки, где матричное плечо
      // замещено реальной ногой-кандидатом.
      const fitsCeiling = (legMinutes: number): boolean =>
        finalOrder.walkMinutes + totalStayEstimate - matrixMinutes + legMinutes <= limit + 1e-9;

      let segment: WalkRouteSegment | null = null;
      let routeVariant: 'alt' | undefined;
      if (
        matrixMinutes > LEG_ALT_MIN_MINUTES &&
        ctx.routeCalls.count < MAX_ROUTE_CALLS &&
        typeof ports.routeAlternatives === 'function'
      ) {
        ctx.routeCalls.count += 1;
        try {
          const alternatives = (await ports.routeAlternatives({ waypoints: [from, to] })).filter(
            validMetrics,
          );
          if (alternatives.length > 0) {
            const chosenIndex = chooseLegVariant(
              alternatives.map((s) => ({
                distanceMeters: s.distanceMeters,
                durationMinutes: s.durationSeconds / 60,
                geometry: s.geometry ?? [],
              })),
              legs.map((leg) => leg.geometry),
              fitsCeiling,
            );
            // Ничего не влезло в потолок — оставляем основной, как есть.
            const index = chosenIndex >= 0 ? chosenIndex : 0;
            segment = alternatives[index];
            routeVariant = index > 0 ? 'alt' : undefined;
          }
        } catch {
          // Отказ альтернативного запроса — не отказ ноги: ниже обычный
          // route даст либо метрики, либо честный NO_ROUTE наверх.
        }
      }
      if (!segment) {
        try {
          segment = await ports.route({ waypoints: [from, to] });
        } catch (e) {
          return { failure: { code: 'NO_ROUTE', detail: `нога ${i + 1} не построена: ${errMessage(e)}` } };
        }
        ctx.routeCalls.count += 1;
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
        ...(routeVariant ? { routeVariant } : {}),
      });
    }

    // 6b. Коридор бюджета (R1): пол 0.9·B → добор остановками из пула →
    //     via-удлинение ног. Потолок 1.1·B — инвариант: добор с откатом.
    const chosenSet = new Set(sequence);
    const filled = await fillToFloor({
      sequence,
      legs,
      budgetMinutes: budget,
      matrixWalkMinutes: finalOrder.walkMinutes,
      times,
      points,
      stayOf,
      pool: scored.filter(({ bi }) => !chosenSet.has(bi)).map(({ bi }) => bi),
      categoryOf: (bi) => baseSelection.picked[bi - 1].place.category,
      limitOfCategory,
      maxStops,
      farEnough,
      isLoop,
      endIndex,
      ports,
      routeCalls: ctx.routeCalls,
    });
    const finalSequence = filled.sequence;
    legs = filled.legs;

    // Микро-стопы «по пути» (S4/B2): минуты цепляются к ногам ДО итогов и
    // гейтов — кап держит total в потолке 1.1·B, walk_share не перевирается.
    attachMicroNotes({
      legs,
      features: input.streetFeatures,
      budgetMinutes: budget,
      currentTotalMinutes:
        legs.reduce((sum, leg) => sum + leg.durationMinutes, 0) +
        finalSequence.reduce((sum, bi) => sum + (stayOf.get(bi) ?? 0), 0),
    });

    // 7. Итоги и скор (§10).
    const stops: WalkStop[] = finalSequence.map((bi) => ({
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
  // Стержень (старт/бюджет/candidates) — общий с лестницей деградации (R6);
  // ниже — специфика движка: финиш А→Б, скорость, веса.
  const coreIssue = validateWalkCore(input);
  if (coreIssue) return { code: 'INVALID_INPUT', detail: coreIssue };
  if (!input.isLoop) {
    if (!input.end || !isFiniteLatLng(input.end)) {
      return { code: 'INVALID_INPUT', detail: 'режим А→Б (isLoop: false) требует end: [широта, долгота]' };
    }
    if (haversineMeters(input.start, input.end) < 1) {
      return { code: 'INVALID_INPUT', detail: 'старт и финиш совпадают — для кольца используйте isLoop: true' };
    }
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
  return null;
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
