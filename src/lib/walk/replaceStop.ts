// src/lib/walk/replaceStop.ts
// Локальная замена одной остановки петли (PRODUCT.md, принцип 3): меняется
// сегмент, а не вся прогулка. Порядок остальных остановок и их ноги сохраняются:
// переезжают как есть только ноги, прилегавшие к заменяемой, геометрия остальных
// переиспользуется по ссылке. Чистый модуль движка — как createWalkPlan:
// только ./types, ./ports, ./internal/*, ./gates, ./reasons, никакого UI и сети.
//
// Детерминизм: кандидаты перебираются в порядке входа (скор-порядок задаёт
// action), никакого случайного состояния. Выбор — первый план со всеми
// пройденными гейтами; иначе фолбэк с максимумом пройденных гейтов
// (не хуже базы текущего плана минус один — замена вносит новые ноги,
// гейт улиц может деградировать) и бюджетом в пределах BUDGET_TOLERANCE.
//
// Ревизия 2026-11-18 «улица первична» (walk-engine.md §19.6): у street-плана
// якоря — гарниш НА петле из вершин розы; replaceStreetGarnish меняет якорь,
// не трогая петлю: кольцевые вершины выводятся из legs[i].from/to, соседние
// ноги якоря перестраиваются, вся остальная петля переезжает по ссылке.

import type {
  GateReport,
  WalkFailure,
  WalkLatLng,
  WalkLeg,
  WalkPlan,
  WalkPlace,
  WalkStop,
} from './types';
import { BUDGET_TOLERANCE, DEFAULT_CATEGORY_LIMIT, MAX_LEG_MINUTES } from './types';
import type { WalkMatrixCell, WalkRoutingPort } from './ports';
import { closestPointOnPolyline, haversineMeters } from './internal/geo';
import { isFiniteLatLng, errMessage, validateWalkCore } from './internal/geo-utils';
import { resolveStayMinutes } from './internal/stay';
import { evaluateGates } from './gates';
import { buildAnchorReason, buildAnchorReasonEn } from './reasons';

/**
 * План, который можно пересобрать точечно. От движка приходит целиком
 * (WalkPlan структурно совместим), от клиента — обычно без legs и gates:
 * UiWalkPlan не несёт ни отчётов гейтов, ни гарантированной геометрии ног.
 * Чего не передано — движок честно перестраивает сам: без legs пересобираются
 * ВСЕ ноги, без gates база фолбэка берётся из currentGatesPassed.
 */
export type ReplaceablePlan = Pick<WalkPlan, 'stops'> & {
  legs?: WalkLeg[];
  gates?: GateReport[];
};

export interface ReplaceStopInput {
  /** Старт петли — он же её замыкание. */
  start: WalkLatLng;
  budgetMinutes: number;
  /** Веса категорий для скора плана (как в WalkInput, без джиттера вариантов). */
  categoryWeights: Record<string, number>;
  /** Переопределение таблицы stay — только для НОВОЙ остановки. */
  categoryStayMinutes?: Record<string, number>;
  currentPlan: ReplaceablePlan;
  /** Индекс заменяемой остановки в currentPlan.stops. */
  replaceIndex: number;
  /** Уже отскоренные кандидаты, порядок убывания — его задаёт action. */
  candidates: WalkPlace[];
  /** Сколько гейтов пройдено у текущего плана, когда отчётов gates нет
   *  (клиент знает только булев флаг). Нет данных — база 0. */
  currentGatesPassed?: number;
}

export type ReplaceStopResult =
  | { ok: true; plan: WalkPlan }
  | { ok: false; failure: WalkFailure };

const EPS = 1e-9;

export async function replaceStopInPlan(
  input: ReplaceStopInput,
  ports: WalkRoutingPort,
): Promise<ReplaceStopResult> {
  const invalid = validateInput(input);
  if (invalid) return { ok: false, failure: invalid };

  const stops = input.currentPlan.stops;
  const k = input.replaceIndex;
  const pool = input.candidates;

  // Соседи заменяемой по кольцу: края упираются в старт (петля).
  const prevPoint: WalkLatLng = k === 0 ? input.start : stops[k - 1].place.coordinates;
  const nextPoint: WalkLatLng =
    k === stops.length - 1 ? input.start : stops[k + 1].place.coordinates;

  // Ноги соседей переиспользуются только при полной длине петли (stops+1):
  // расхождение — чужие или битые данные, честнее перестроить всю петлю.
  const oldLegs =
    input.currentPlan.legs && input.currentPlan.legs.length === stops.length + 1
      ? input.currentPlan.legs
      : undefined;

  // Кандидат не должен дублировать уже стоящие остановки ни id, ни координатами.
  const takenIds = new Set(
    stops.filter((_, i) => i !== k).map((s) => `${s.place.id}`),
  );
  const takenCoords = new Set(
    stops.filter((_, i) => i !== k).map((s) => coordKey(s.place.coordinates)),
  );

  // База фолбэка: сколько гейтов прошло у текущего плана. Отчётов нет —
  // доверяем числу от клиента, а без него считаем базу нулевой.
  const baselineGates = input.currentPlan.gates
    ? input.currentPlan.gates.filter((g) => g.pass).length
    : (input.currentGatesPassed ?? 0);

  const limit = input.budgetMinutes * (1 + BUDGET_TOLERANCE);
  const stayOfOthers = stops
    .filter((_, i) => i !== k)
    .reduce((sum, s) => sum + s.stayMinutes, 0);

  // Факты причин по кандидатскому пулу: лучший в категории — первый в пуле
  // (он отсортирован по скору), closest — минимум прямого расстояния до
  // prev-соседа; prev у всех кандидатов общий, считаем один раз.
  const proximities = pool.map((c) => haversineMeters(c.coordinates, prevPoint));
  const minProximity = proximities.length > 0 ? Math.min(...proximities) : 0;

  const weightOf = (category: string): number => {
    const raw = input.categoryWeights[category];
    return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : 0;
  };

  let best: { plan: WalkPlan; passedGates: number } | null = null;
  let routeFailures = 0;
  let gateFailures = 0;

  // Деталь отказа — самая информативная, а не последняя по порядку перебора:
  // маршрутные причины (упал порт) важнее метрик (числа бюджета), метрики —
  // «уже стоит в плане». При равном приоритете остаётся первое сообщение.
  let lastDetail = 'кандидаты не переданы';
  let detailPriority = -1;
  const noteDetail = (priority: number, text: string): void => {
    if (priority > detailPriority) {
      detailPriority = priority;
      lastDetail = text;
    }
  };
  const DETAIL_ROUTE = 3;
  const DETAIL_METRICS = 2;
  const DETAIL_UNREACHABLE = 1;
  const DETAIL_DUPLICATE = 0;

  for (let i = 0; i < pool.length; i++) {
    const candidate = pool[i];
    if (takenIds.has(`${candidate.id}`) || takenCoords.has(coordKey(candidate.coordinates))) {
      noteDetail(DETAIL_DUPLICATE, `«${candidate.name}» уже стоит в плане`);
      continue;
    }

    // 1. Точечная проверка времён по маленькой матрице [prev, candidate, next]:
    // null-ячейки и заведомый перерасход/длинные ноги отсекают кандидата
    // до заказов route. Матрица и маршрут считаются одним роутером, так что
    // расхождение оценок — секунды.
    const trio: WalkLatLng[] = [prevPoint, candidate.coordinates, nextPoint];
    let times: number[][];
    try {
      times = buildTrioTimes(await ports.matrix(trio, trio));
    } catch (e) {
      routeFailures += 1;
      noteDetail(DETAIL_ROUTE, `матрица недоступна: ${errMessage(e)}`);
      continue;
    }
    const tPrevCand = times[0][1];
    const tCandNext = times[1][2];
    if (!Number.isFinite(tPrevCand) || !Number.isFinite(tCandNext)) {
      noteDetail(DETAIL_UNREACHABLE, `«${candidate.name}» недостижим пешком от соседей`);
      continue;
    }
    if (tPrevCand > MAX_LEG_MINUTES + 1e-6 || tCandNext > MAX_LEG_MINUTES + 1e-6) {
      noteDetail(DETAIL_METRICS, `нога до «${candidate.name}» длиннее ${MAX_LEG_MINUTES} мин`);
      continue;
    }

    const stayNew = resolveStayMinutes(candidate, input.categoryStayMinutes);
    if (oldLegs) {
      // Оценка полных итогов без route: ноги соседей реиспользуются с их
      // метриками, заменяется только пара, прилегавшая к заменяемой.
      const reusedWalk = oldLegs.reduce(
        (sum, leg, j) => (j === k || j === k + 1 ? sum : sum + leg.durationMinutes),
        0,
      );
      const estTotal = reusedWalk + tPrevCand + tCandNext + stayNew + stayOfOthers;
      if (estTotal > limit + EPS) {
        noteDetail(
          DETAIL_METRICS,
          `кольцо с «${candidate.name}» — около ${Math.round(estTotal)} мин при бюджете ${Math.round(input.budgetMinutes)} мин`,
        );
        continue;
      }
    }

    // 2. Новые ноги через реальный роутинг: prev→candidate→next; остальные
    // ноги кольца переезжают по ссылке вместе с геометрией.
    let newLegs: WalkLeg[];
    if (oldLegs) {
      const first = await buildLeg(ports, prevPoint, candidate.coordinates);
      const second = await buildLeg(ports, candidate.coordinates, nextPoint);
      if (!first || !second) {
        routeFailures += 1;
        noteDetail(DETAIL_ROUTE, `нога до «${candidate.name}» не построена`);
        continue;
      }
      newLegs = [...oldLegs.slice(0, k), first, second, ...oldLegs.slice(k + 2)];
    } else {
      // Ног нет — перестраиваем всю петлю по новым остановкам.
      const ringCoords: WalkLatLng[] = [
        ...stops.slice(0, k).map((s) => s.place.coordinates),
        candidate.coordinates,
        ...stops.slice(k + 1).map((s) => s.place.coordinates),
      ];
      const path: WalkLatLng[] = [input.start, ...ringCoords, input.start];
      newLegs = [];
      let broken = false;
      for (let j = 0; j < path.length - 1 && !broken; j++) {
        const leg = await buildLeg(ports, path[j], path[j + 1]);
        if (!leg) {
          routeFailures += 1;
          noteDetail(DETAIL_ROUTE, `кольцо с «${candidate.name}» не маршрутизируется`);
          broken = true;
        } else {
          newLegs.push(leg);
        }
      }
      if (broken) continue;
    }

    // 3. Полные итоги, скор как в createWalkPlan (веса категорий минус
    // длинные ноги), гейты на реальных ногах. Причина новой остановки —
    // из фактов кандидатского пула (§9), как у якорей createWalkPlan.
    const isBestOfCategory = pool.findIndex((c) => c.category === candidate.category) === i;
    const isClosest = proximities[i] <= minProximity + EPS;
    const reasonFacts = {
      place: candidate,
      zoneWord: 'радиусе' as const,
      isBestOfCategory,
      isClosest,
      proximityMeters: proximities[i],
    };
    const candidateStop: WalkStop = {
      place: candidate,
      stayMinutes: stayNew,
      reason: buildAnchorReason(reasonFacts),
      reasonEn: buildAnchorReasonEn(reasonFacts),
    };
    const newStops: WalkStop[] = [...stops.slice(0, k), candidateStop, ...stops.slice(k + 1)];

    const totalWalkMinutes = newLegs.reduce((sum, leg) => sum + leg.durationMinutes, 0);
    const totalStayMinutes = newStops.reduce((sum, s) => sum + s.stayMinutes, 0);
    const totalMinutes = totalWalkMinutes + totalStayMinutes;
    const longLegs = newLegs.filter((leg) => leg.durationMinutes > MAX_LEG_MINUTES + 1e-6).length;
    const gates = evaluateGates({
      budgetMinutes: input.budgetMinutes,
      totalMinutes,
      stops: newStops,
      legDurations: newLegs.map((leg) => leg.durationMinutes),
      legGeometries: newLegs.map((leg) => leg.geometry),
      isLoop: true,
    });
    const plan: WalkPlan = {
      stops: newStops,
      legs: newLegs,
      totalWalkMinutes,
      totalStayMinutes,
      totalMinutes,
      score: newStops.reduce((sum, s) => sum + weightOf(s.place.category), 0) - longLegs,
      gates,
      allGatesPass: gates.every((g) => g.pass),
    };

    // 4. Первый кандидат со всеми гейтами закрывает задачу — порядок пула
    // и есть приоритет. Остальные идут в фолбэк: бюджет в допуске и гейтов
    // не больше одного провала от базы текущего плана. Допуск −1 — потому
    // что замена вносит НОВЫЕ ноги: гейт улиц (перекрытие) у кандидата
    // может упасть из-за геометрии именно этого сегмента, при этом все
    // остальные качества плана сохранены. Требование «не хуже базы» без
    // допуска делало отказ почти гарантированным («достойной замены
    // рядом не нашлось» на каждом шаге). Из равных берём первого.
    if (plan.allGatesPass) {
      return { ok: true, plan };
    }
    gateFailures += 1;
    const budgetOk = gates.find((g) => g.gate === 'budget')?.pass ?? false;
    const passedGates = gates.filter((g) => g.pass).length;
    if (
      budgetOk &&
      passedGates >= Math.max(baselineGates - 1, 0) &&
      (!best || passedGates > best.passedGates)
    ) {
      best = { plan, passedGates };
    }
  }

  if (best) return { ok: true, plan: best.plan };

  // Честный отказ: недоступность маршрута информативнее «нет кандидатов».
  if (routeFailures > 0 && gateFailures === 0) {
    return {
      ok: false,
      failure: { code: 'NO_ROUTE', detail: `замена не сошлась: ${lastDetail}` },
    };
  }
  return {
    ok: false,
    failure: { code: 'NO_CANDIDATES', detail: `ни один кандидат не подошёл: ${lastDetail}` },
  };
}

// --- Сборка одной ноги через порт ---

async function buildLeg(
  ports: WalkRoutingPort,
  from: WalkLatLng,
  to: WalkLatLng,
): Promise<WalkLeg | null> {
  let segment;
  try {
    segment = await ports.route({ waypoints: [from, to] });
  } catch {
    return null; // отказ порта не фатален: пробуем следующего кандидата
  }
  if (
    !Number.isFinite(segment.distanceMeters) ||
    segment.distanceMeters < 0 ||
    !Number.isFinite(segment.durationSeconds) ||
    segment.durationSeconds < 0
  ) {
    return null;
  }
  return {
    from,
    to,
    distanceMeters: segment.distanceMeters,
    durationMinutes: segment.durationSeconds / 60,
    geometry: segment.geometry ?? [],
  };
}

/** Матрица 3×3 из плоских ячеек порта; дырки — Infinity (недостижимость). */
function buildTrioTimes(cells: WalkMatrixCell[]): number[][] {
  const times: number[][] = Array.from({ length: 3 }, () => Array<number>(3).fill(Infinity));
  for (let i = 0; i < 3; i++) times[i][i] = 0;
  for (const cell of cells) {
    if (cell.sourceIndex < 0 || cell.sourceIndex > 2 || cell.targetIndex < 0 || cell.targetIndex > 2) {
      continue;
    }
    if (cell.durationSeconds === null || cell.durationSeconds === undefined) continue;
    const minutes = cell.durationSeconds / 60;
    if (Number.isFinite(minutes) && minutes >= 0) times[cell.sourceIndex][cell.targetIndex] = minutes;
  }
  return times;
}

// --- Валидация и утилиты ---

function validateInput(input: ReplaceStopInput): WalkFailure | null {
  // Стержень старт/бюджет/candidates — общий модуль geo-utils (R6).
  const coreIssue = validateWalkCore(input);
  if (coreIssue) return { code: 'INVALID_INPUT', detail: coreIssue };
  const stops = input.currentPlan?.stops;
  if (!Array.isArray(stops) || stops.length === 0) {
    return { code: 'INVALID_INPUT', detail: 'currentPlan.stops: непустой массив остановок' };
  }
  if (
    !Number.isInteger(input.replaceIndex) ||
    input.replaceIndex < 0 ||
    input.replaceIndex >= stops.length
  ) {
    return { code: 'INVALID_INPUT', detail: 'replaceIndex: индекс внутри currentPlan.stops' };
  }
  for (const stop of stops) {
    if (!stop?.place || !isFiniteLatLng(stop.place.coordinates)) {
      return { code: 'INVALID_INPUT', detail: 'остановка без корректных координат места' };
    }
    if (!Number.isFinite(stop.stayMinutes) || stop.stayMinutes < 0) {
      return { code: 'INVALID_INPUT', detail: `stayMinutes у «${stop.place.name}»: конечное число ≥ 0` };
    }
  }
  return null;
}

function coordKey(p: WalkLatLng): string {
  return `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
}

// --- Замена гарниша уличного плана (walk-engine.md §19.6) --------------------

export interface ReplaceStreetGarnishInput {
  /** Старт петли — он же её замыкание. */
  start: WalkLatLng;
  budgetMinutes: number;
  /** Веса категорий для скора плана. */
  categoryWeights: Record<string, number>;
  /** Переопределение таблицы stay — только для НОВОГО якоря. */
  categoryStayMinutes?: Record<string, number>;
  /** Потолок остановок одной категории (гарниш живёт под теми же капами). */
  categoryLimits?: Record<string, number>;
  /**
   * Текущий street-план: stops (гарниш) и ПОЛНЫЕ ноги петли с геометриями —
   * кольцевые вершины розы выводятся из legs[i].from/to. Без геометрий
   * заменить нельзя: перестройка старт→якорь→старт уничтожила бы петлю.
   */
  currentPlan: { stops: WalkStop[]; legs: WalkLeg[] };
  /** Индекс заменяемого якоря в currentPlan.stops. */
  replaceIndex: number;
  /** Уже отскоренные кандидаты, порядок убывания — его задаёт action. */
  candidates: WalkPlace[];
  /** Сколько гейтов прошло у текущего плана — база фолбэка. */
  currentGatesPassed?: number;
  /**
   * Отчёт гейта street_interest текущего плана (факт снапа не меняется —
   * петля не трогается): переносится в новый план как есть.
   */
  streetInterestReport?: GateReport;
}

export type ReplaceStreetGarnishResult =
  | { ok: true; plan: WalkPlan }
  | { ok: false; failure: WalkFailure };

const STREET_EPS = 1e-9;

/**
 * Замена якоря-гарниша street-плана (§19.6): петля не пересобирается —
 * только две ноги к новому кандидату. Кольцевые вершины выводятся из ног:
 * legs[i].from → legs[i].to идут по кольцу «старт → вершины розы → якоря →
 * старт»; заменяемый якорь — кольцевая вершина legs[v].to, соседи — legs[v].from
 * и legs[v+1].to. Кандидаты перебираются в скор-порядке; trio-матрица и
 * бюджет-гард — та же механика, что у replaceStopInPlan; выбор — первый план
 * со всеми гейтами, иначе фолбэк «не хуже базы −1» (§16). Маркировка kind
 * 'street' сохраняется; streetInterest/degraded не переносятся (прецедент §16).
 */
export async function replaceStreetGarnish(
  input: ReplaceStreetGarnishInput,
  ports: WalkRoutingPort,
): Promise<ReplaceStreetGarnishResult> {
  const invalid = validateStreetGarnishInput(input);
  if (invalid) return { ok: false, failure: invalid };

  const stops = input.currentPlan.stops;
  const legs = input.currentPlan.legs;
  const k = input.replaceIndex;
  const pool = input.candidates;
  const anchor = stops[k].place.coordinates;

  // Слот якоря в кольце: нога, чей конец — заменяемый якорь.
  const slot = legs.findIndex((leg) => samePoint(leg.to, anchor));
  if (slot < 0 || slot + 1 >= legs.length) {
    return {
      ok: false,
      failure: { code: 'INVALID_INPUT', detail: 'заменяаемый якорь не лежит на кольце ног' },
    };
  }
  const prevPoint: WalkLatLng = legs[slot].from;
  const nextPoint: WalkLatLng = legs[slot + 1].to;
  // Ноги соседей переиспользуются по ссылке; заменяются ровно две.
  const keptLegs = legs.filter((_, i) => i !== slot && i !== slot + 1);

  // Кандидат не должен дублировать стоящие якоря ни id, ни координатами.
  const takenIds = new Set(stops.filter((_, i) => i !== k).map((s) => `${s.place.id}`));
  const takenCoords = new Set(
    stops.filter((_, i) => i !== k).map((s) => coordKey(s.place.coordinates)),
  );

  const baselineGates = input.currentGatesPassed ?? 0;
  const limit = input.budgetMinutes * (1 + BUDGET_TOLERANCE);
  const stayOfOthers = stops.filter((_, i) => i !== k).reduce((sum, s) => sum + s.stayMinutes, 0);
  const keepWalk = keptLegs.reduce((sum, leg) => sum + leg.durationMinutes, 0);
  // Отклонение кандидата от заменяемой ноги — честная близость «по пути» (§9).
  const oldGeometry = legs[slot].geometry;
  const deviationOf = (place: WalkPlace): number => {
    if (oldGeometry.length >= 2) {
      return closestPointOnPolyline(place.coordinates, oldGeometry).distanceMeters;
    }
    return haversineMeters(place.coordinates, prevPoint);
  };

  const weightOf = (category: string): number => {
    const raw = input.categoryWeights[category];
    return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : 0;
  };
  const bestOfCategory = new Map<string, string>();
  for (const place of pool) {
    if (!bestOfCategory.has(place.category)) bestOfCategory.set(place.category, `${place.id}`);
  }

  let best: { plan: WalkPlan; passedGates: number } | null = null;
  let routeFailures = 0;
  let gateFailures = 0;
  let lastDetail = 'кандидаты не переданы';
  let detailPriority = -1;
  const noteDetail = (priority: number, text: string): void => {
    if (priority > detailPriority) {
      detailPriority = priority;
      lastDetail = text;
    }
  };
  const DETAIL_ROUTE = 3;
  const DETAIL_METRICS = 2;
  const DETAIL_UNREACHABLE = 1;
  const DETAIL_DUPLICATE = 0;

  for (let i = 0; i < pool.length; i++) {
    const candidate = pool[i];
    if (takenIds.has(`${candidate.id}`) || takenCoords.has(coordKey(candidate.coordinates))) {
      noteDetail(DETAIL_DUPLICATE, `«${candidate.name}» уже стоит в плане`);
      continue;
    }
    const category = candidate.category;
    const categoryCap = input.categoryLimits?.[category] ?? DEFAULT_CATEGORY_LIMIT;
    const sameCategoryAround = stops.filter(
      (s, idx) => idx !== k && s.place.category === category,
    ).length;
    if (sameCategoryAround >= categoryCap) {
      noteDetail(DETAIL_METRICS, `потолок категории «${category}» в плане исчерпан`);
      continue;
    }

    // 1. Trio-матрица [prev, candidate, next]: недостижимость и длинные ноги —
    //    до заказов route (та же механика, что у replaceStopInPlan).
    const trio: WalkLatLng[] = [prevPoint, candidate.coordinates, nextPoint];
    let times: number[][];
    try {
      times = buildTrioTimes(await ports.matrix(trio, trio));
    } catch (e) {
      routeFailures += 1;
      noteDetail(DETAIL_ROUTE, `матрица недоступна: ${errMessage(e)}`);
      continue;
    }
    const tPrevCand = times[0][1];
    const tCandNext = times[1][2];
    if (!Number.isFinite(tPrevCand) || !Number.isFinite(tCandNext)) {
      noteDetail(DETAIL_UNREACHABLE, `«${candidate.name}» недостижим пешком от соседей`);
      continue;
    }
    if (tPrevCand > MAX_LEG_MINUTES + 1e-6 || tCandNext > MAX_LEG_MINUTES + 1e-6) {
      noteDetail(DETAIL_METRICS, `нога до «${candidate.name}» длиннее ${MAX_LEG_MINUTES} мин`);
      continue;
    }

    const stayNew = resolveStayMinutes(candidate, input.categoryStayMinutes);
    if (keepWalk + tPrevCand + tCandNext + stayNew + stayOfOthers > limit + STREET_EPS) {
      noteDetail(
        DETAIL_METRICS,
        `кольцо с «${candidate.name}» — около ${Math.round(
          keepWalk + tPrevCand + tCandNext + stayNew + stayOfOthers,
        )} мин при бюджете ${Math.round(input.budgetMinutes)} мин`,
      );
      continue;
    }

    // 2. Две новые ноги; петля (остальные ноги) переезжает по ссылке.
    const legA = await buildLeg(ports, prevPoint, candidate.coordinates);
    if (!legA) {
      routeFailures += 1;
      noteDetail(DETAIL_ROUTE, `нога до «${candidate.name}» не построена`);
      continue;
    }
    const legB = await buildLeg(ports, candidate.coordinates, nextPoint);
    if (!legB) {
      routeFailures += 1;
      noteDetail(DETAIL_ROUTE, `нога от «${candidate.name}» не построена`);
      continue;
    }

    // 3. Новый план: якорь встаёт на место старого в порядке кольца, причина —
    //    из фактов кандидатского пула (§9), близость — отклонение от петли.
    const deviation = deviationOf(candidate);
    const reasonFacts = {
      place: candidate,
      zoneWord: 'радиусе' as const,
      isBestOfCategory: bestOfCategory.get(category) === `${candidate.id}`,
      isClosest: deviation <= minDeviation(pool, deviationOf) + STREET_EPS,
      proximityMeters: deviation,
    };
    const candidateStop: WalkStop = {
      place: candidate,
      stayMinutes: stayNew,
      reason: buildAnchorReason(reasonFacts),
      reasonEn: buildAnchorReasonEn(reasonFacts),
    };
    const newStops: WalkStop[] = [...stops.slice(0, k), candidateStop, ...stops.slice(k + 1)];
    const newLegs: WalkLeg[] = legs.slice();
    newLegs.splice(slot, 2, legA, legB);

    const totalWalkMinutes = newLegs.reduce((sum, leg) => sum + leg.durationMinutes, 0);
    const totalStayMinutes = newStops.reduce((sum, s) => sum + s.stayMinutes, 0);
    const totalMinutes = totalWalkMinutes + totalStayMinutes;
    const longLegs = newLegs.filter((leg) => leg.durationMinutes > MAX_LEG_MINUTES + 1e-6).length;
    const coreGates = evaluateGates({
      budgetMinutes: input.budgetMinutes,
      totalMinutes,
      stops: newStops,
      legDurations: newLegs.map((leg) => leg.durationMinutes),
      legGeometries: newLegs.map((leg) => leg.geometry),
      isLoop: true,
      planType: 'street',
    });
    // Факт снапа не пересчитывается (петля не трогалась) — перенос как есть.
    const gates = input.streetInterestReport ? [...coreGates, input.streetInterestReport] : coreGates;
    const plan: WalkPlan = {
      stops: newStops,
      legs: newLegs,
      totalWalkMinutes,
      totalStayMinutes,
      totalMinutes,
      score: newStops.reduce((sum, s) => sum + weightOf(s.place.category), 0) - longLegs,
      gates,
      allGatesPass: gates.every((g) => g.pass),
      kind: 'street',
    };

    // 4. Первый кандидат со всеми гейтами закрывает задачу; фолбэк — бюджет
    //    в допуске и гейтов не больше одного провала от базы (замена вносит
    //    новые ноги, гейт улиц может деградировать) — политика §16.
    if (plan.allGatesPass) {
      return { ok: true, plan };
    }
    gateFailures += 1;
    const budgetOk = gates.find((g) => g.gate === 'budget')?.pass ?? false;
    const passedGates = gates.filter((g) => g.pass).length;
    if (
      budgetOk &&
      passedGates >= Math.max(baselineGates - 1, 0) &&
      (!best || passedGates > best.passedGates)
    ) {
      best = { plan, passedGates };
    }
  }

  if (best) return { ok: true, plan: best.plan };

  if (routeFailures > 0 && gateFailures === 0) {
    return {
      ok: false,
      failure: { code: 'NO_ROUTE', detail: `замена не сошлась: ${lastDetail}` },
    };
  }
  return {
    ok: false,
    failure: { code: 'NO_CANDIDATES', detail: `ни один кандидат не подошёл: ${lastDetail}` },
  };
}

/** Минимальное отклонение кандидатов пула от петли (для факта «по пути»). */
function minDeviation(pool: WalkPlace[], deviationOf: (place: WalkPlace) => number): number {
  let min = Number.POSITIVE_INFINITY;
  for (const place of pool) {
    const d = deviationOf(place);
    if (d < min) min = d;
  }
  return Number.isFinite(min) ? min : 0;
}

function samePoint(a: WalkLatLng, b: WalkLatLng): boolean {
  return Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
}

function validateStreetGarnishInput(input: ReplaceStreetGarnishInput): WalkFailure | null {
  const coreIssue = validateWalkCore(input);
  if (coreIssue) return { code: 'INVALID_INPUT', detail: coreIssue };
  const stops = input.currentPlan?.stops;
  if (!Array.isArray(stops) || stops.length === 0) {
    return { code: 'INVALID_INPUT', detail: 'currentPlan.stops: непустой массив якорей-гарниша' };
  }
  const legs = input.currentPlan?.legs;
  if (!Array.isArray(legs) || legs.length < 2) {
    return {
      code: 'INVALID_INPUT',
      detail: 'currentPlan.legs: полные ноги петли (без них петлю не сохранить)',
    };
  }
  if (
    !Number.isInteger(input.replaceIndex) ||
    input.replaceIndex < 0 ||
    input.replaceIndex >= stops.length
  ) {
    return { code: 'INVALID_INPUT', detail: 'replaceIndex: индекс внутри currentPlan.stops' };
  }
  if (!samePoint(legs[0].from, input.start)) {
    return { code: 'INVALID_INPUT', detail: 'legs[0].from — старт петли' };
  }
  for (const leg of legs) {
    if (!leg || !isFiniteLatLng(leg.from) || !isFiniteLatLng(leg.to)) {
      return { code: 'INVALID_INPUT', detail: 'ноги петли с некорректными концами' };
    }
    if (!Array.isArray(leg.geometry) || leg.geometry.length < 2) {
      return {
        code: 'INVALID_INPUT',
        detail: 'ноги петли без геометрии — замена невозможна, пересоберите прогулку',
      };
    }
  }
  // Кольцо: конец ноги — начало следующей.
  for (let i = 0; i < legs.length - 1; i++) {
    if (!samePoint(legs[i].to, legs[i + 1].from)) {
      return { code: 'INVALID_INPUT', detail: 'ноги не образуют кольцо (to ≠ from соседа)' };
    }
  }
  for (const stop of stops) {
    if (!stop?.place || !isFiniteLatLng(stop.place.coordinates)) {
      return { code: 'INVALID_INPUT', detail: 'якорь без корректных координат места' };
    }
    if (!Number.isFinite(stop.stayMinutes) || stop.stayMinutes < 0) {
      return { code: 'INVALID_INPUT', detail: `stayMinutes у «${stop.place.name}»: конечное число ≥ 0` };
    }
  }
  return null;
}
