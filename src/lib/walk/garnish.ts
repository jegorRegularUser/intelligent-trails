// src/lib/walk/garnish.ts
// Якоря-«гарниш» уличной петли (docs/walk-engine.md §19.3, ревизия 2026-11-18
// «улица первична»): после построения петли в её коридор (≤ 200 м от
// полилинии) добавляются 0–2 кандидата — только если влезают в бюджет ПОСЛЕ
// уличного времени. План с 0 якорей — валиден и хорош; не влезают — не грустим.
//
// Причины якорей — переиспользованный §9 (reasons.ts): proximityMeters —
// отклонение от полилинии петли («Прямо по пути (~120 м)» — честный факт:
// место в 120 м от петли). Микро-стопы на разрезанных ногах пересобираются
// (attachMicroNotes мутирует и не идемпотентна — зовётся только для двух
// новых ног); микро-стопы остальных ног переживают вставку.
//
// Чистый модуль: ./types, ./ports, ./internal/*, ./reasons — никакого UI
// и сети. Отказов у модуля нет: не влезло или не построилось — 0 якорей,
// петля возвращается как есть.

import type {
  WalkLatLng,
  WalkLeg,
  WalkPlace,
  WalkStop,
  WalkStreetFeature,
} from './types';
import { BUDGET_TOLERANCE, DEFAULT_CATEGORY_LIMIT, DEFAULT_WALKING_SPEED_KMH } from './types';
import type { WalkRoutingPort } from './ports';
import { closestPointOnPolyline, haversineMeters } from './internal/geo';
import { isFiniteLatLng } from './internal/geo-utils';
import { resolveStayMinutes } from './internal/stay';
import { attachMicroNotes } from './internal/microStops';
import { buildAnchorReason, buildAnchorReasonEn } from './reasons';

/** Коридор гарниша: дальше от петли — уже не «по пути» (§19.3). */
export const GARNISH_CORRIDOR_M = 200;
/** Максимум якорей-гарниша на план (§19.3). */
export const GARNISH_MAX_STOPS = 2;
/**
 * Сетевой коэффициент оценки крюка по прямой (§19.3): реальные ноги длиннее
 * хорды; оценка до роутинга грубая — финальную честность держит проверка
 * реального total после роутинга.
 */
const DETOUR_NETWORK_FACTOR = 1.3;
/** Кап списка годных кандидатов: сортировка дешёвая, но не бесконечная. */
export const GARNISH_POOL_CAP = 24;
/** Запас минут под крюк к якорю в резерве бюджета (§19.3). */
const GARNISH_DETOUR_ALLOWANCE_MIN = 5;
/** Потолок резерва: доля бюджета и абсолютный кап (§19.3). */
const GARNISH_RESERVE_MAX_SHARE = 0.5;
const GARNISH_RESERVE_MAX_MINUTES = 45;
const EPS = 1e-9;

/** Годный кандидат с фактом позиции на ИСХОДНОЙ петле: нога и отклонение. */
export interface GarnishCandidate {
  place: WalkPlace;
  /** Индекс ноги петли, ближайшей к кандидату (до вставок; attach пересчитает). */
  legIndex: number;
  /** Отклонение от полилинии этой ноги, м. */
  deviationMeters: number;
}

export interface SelectGarnishParams {
  /** Ноги петли (финальные, после тюнинга радиуса). */
  legs: WalkLeg[];
  /** Кандидаты в скор-порядке экшена (порядок входа — последний тайбрейкер). */
  candidates: WalkPlace[];
  categoryWeights: Record<string, number>;
  corridorMeters?: number;
}

const weightOf = (categoryWeights: Record<string, number>, category: string): number => {
  const raw = categoryWeights[category];
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : 0;
};

/** `вес × качество` (§19.3): рейтинг 0..5 → множитель 1..2, без рейтинга — 1. */
export function garnishScore(
  categoryWeights: Record<string, number>,
  place: WalkPlace,
): number {
  const rating = place.rating;
  const quality =
    typeof rating === 'number' && Number.isFinite(rating) && rating > 0
      ? 1 + Math.min(rating, 5) / 5
      : 1;
  return weightOf(categoryWeights, place.category) * quality;
}

/** Ближайшая к месту нога петли и отклонение от её полилинии; ног без геометрии → −1. */
function bestLegFor(
  place: WalkPlace,
  legs: WalkLeg[],
): { legIndex: number; deviationMeters: number } {
  let legIndex = -1;
  let deviationMeters = Number.POSITIVE_INFINITY;
  for (let i = 0; i < legs.length; i++) {
    const geometry = legs[i].geometry;
    if (geometry.length < 2) continue;
    const deviation = closestPointOnPolyline(place.coordinates, geometry).distanceMeters;
    if (deviation < deviationMeters) {
      deviationMeters = deviation;
      legIndex = i;
    }
  }
  return { legIndex, deviationMeters };
}

/**
 * Годные кандидаты гарниша в порядке выбора (§19.3): фильтр веса и коридора,
 * сорт по `вес × качество` — `weight · (1 + rating/5)` (нерейтингованные не
 * дискриминируются: база качества 1), тайбрейкеры — меньшее отклонение, затем
 * порядок входа. Дедуп по id и координатам. Капы категории здесь НЕ
 * применяются — их считает attach по факту выбора; legIndex у кандидата —
 * позиция на исходной петле, attach пересчитывает её по текущим ногам.
 */
export function selectGarnishCandidates(params: SelectGarnishParams): GarnishCandidate[] {
  const corridor = params.corridorMeters ?? GARNISH_CORRIDOR_M;
  const seenIds = new Set<string>();
  const seenCoords = new Set<string>();
  const eligible: GarnishCandidate[] = [];

  for (const place of params.candidates) {
    if (!place || !isFiniteLatLng(place.coordinates)) continue;
    const idKey = `${place.id}`;
    const coordKey = `${place.coordinates[0].toFixed(6)},${place.coordinates[1].toFixed(6)}`;
    if (seenIds.has(idKey) || seenCoords.has(coordKey)) continue;
    if (!(weightOf(params.categoryWeights, place.category) > 0)) continue;
    seenIds.add(idKey);
    seenCoords.add(coordKey);

    const { legIndex, deviationMeters } = bestLegFor(place, params.legs);
    if (legIndex < 0 || deviationMeters > corridor + EPS) continue;
    eligible.push({ place, legIndex, deviationMeters });
  }

  eligible.sort(
    (a, b) =>
      garnishScore(params.categoryWeights, b.place) -
        garnishScore(params.categoryWeights, a.place) ||
      a.deviationMeters - b.deviationMeters,
  );
  return eligible.slice(0, GARNISH_POOL_CAP);
}

/**
 * Резерв бюджета под гарниш (§19.3): петля строится на `B − reserve`, чтобы
 * сидячая остановка влезла поверх улиц. reserve = min(stay лучшего годного
 * кандидата пула + запас под крюк, 0.5·B, 45); при пустом пуле — 0.
 * Резерв считается ДО построения петли, поэтому «годный» здесь — кандидат
 * с весом > 0 в скор-порядке пула, без коридора (он появится только у
 * построенной петли). Эвристика по лучшему кандидату: выбранным гарнишем
 * может стать более дешёвый, тогда остаток уйдёт в недобор (гейт бюджета
 * честно его покажет, а фаза добора streetFirst пересоберёт петлю на
 * полный бюджет).
 */
export function reserveMinutesForGarnish(params: {
  /** Пул в скор-порядке; первый кандидат с весом > 0 задаёт резерв. */
  candidates: WalkPlace[];
  categoryWeights: Record<string, number>;
  categoryStayMinutes?: Record<string, number>;
  budgetMinutes: number;
}): number {
  const best = params.candidates.find(
    (place) => weightOf(params.categoryWeights, place.category) > 0,
  );
  if (!best) return 0;
  const stay = resolveStayMinutes(best, params.categoryStayMinutes);
  const raw = stay + GARNISH_DETOUR_ALLOWANCE_MIN;
  return Math.max(
    0,
    Math.min(raw, params.budgetMinutes * GARNISH_RESERVE_MAX_SHARE, GARNISH_RESERVE_MAX_MINUTES),
  );
}

export interface AttachGarnishInput {
  budgetMinutes: number;
  /** Ноги петли; функция не мутирует вход — возвращает новые массивы. */
  legs: WalkLeg[];
  /** Существующие якоря (обычно пусто). */
  stops?: WalkStop[];
  /** Годные кандидаты в порядке выбора (selectGarnishCandidates). */
  candidates: GarnishCandidate[];
  categoryWeights: Record<string, number>;
  categoryStayMinutes?: Record<string, number>;
  categoryLimits?: Record<string, number>;
  /** Фичи улиц — сырьё микро-стопов на новых ногах. */
  streetFeatures?: WalkStreetFeature[];
  ports: WalkRoutingPort;
  /** Общий счётчик вызовов порта сборки (§19.2). */
  routeCalls: { count: number; max: number };
}

export interface AttachGarnishResult {
  legs: WalkLeg[];
  /** Якоря в порядке кольца (сортировка по слоту ноги). */
  stops: WalkStop[];
  /** Сколько якорей фактически вставлено (0 — валидный исход, §19.3). */
  added: number;
  /** Слоты ног вставленных якорей, параллельно stops после сортировки. */
  slots: number[];
}

interface Placed {
  stop: WalkStop;
  deviationMeters: number;
  /** Индекс ноги-хозяина (после предыдущих вставок). */
  slot: number;
}

/**
 * Вставка якорей-гарниша в петлю (§19.3): разрез ноги-хозяина на две реальные
 * ноги через кандидата; максимум GARNISH_MAX_STOPS, не больше одного якоря на
 * ногу (порядок двух якорей на одной ноге не определён без проекций — проще
 * честный запрет: нога занята и слотом якоря, и следующим за ним куском),
 * кап категории архетипа, бюджет-гард 1.1·B до (оценка) и после (реальные
 * ноги) роутинга. Отказ route или перерасход — кандидат пропускается,
 * перебор продолжается: гарниш необязателен по определению.
 *
 * Нога-хозяин пересчитывается для каждого кандидата по ТЕКУЩИМ ногам:
 * вставка разрезает ногу надвое, и индексы правее съезжают — позиция,
 * посчитанная на исходной петле, после первой же вставки устаревает.
 */
export async function attachGarnish(input: AttachGarnishInput): Promise<AttachGarnishResult> {
  const ceiling = input.budgetMinutes * (1 + BUDGET_TOLERANCE);
  const speedMPerMin = (DEFAULT_WALKING_SPEED_KMH * 1000) / 60;
  const legs = input.legs.map((leg) => ({ ...leg }));
  const existingStops = input.stops ?? [];
  const existingStay = existingStops.reduce((sum, s) => sum + s.stayMinutes, 0);
  const placed: Placed[] = [];
  const counts = new Map<string, number>();
  for (const stop of existingStops) {
    counts.set(stop.place.category, (counts.get(stop.place.category) ?? 0) + 1);
  }

  const walkMinutes = (): number => legs.reduce((sum, leg) => sum + leg.durationMinutes, 0);
  const placedStay = (): number => placed.reduce((sum, p) => sum + p.stop.stayMinutes, 0);
  const totalOf = (): number => walkMinutes() + existingStay + placedStay();

  // Лучший в категории среди годных — факт шорт-листа, не выбора (§9).
  const bestOfCategory = new Map<string, string>();
  for (const candidate of input.candidates) {
    if (!bestOfCategory.has(candidate.place.category)) {
      bestOfCategory.set(candidate.place.category, `${candidate.place.id}`);
    }
  }

  // Нога занята, если какой-то якорь стоит на ней или на её предыдущем куске.
  const legTaken = (index: number): boolean =>
    placed.some((p) => p.slot === index || p.slot + 1 === index);

  let added = 0;

  for (const candidate of input.candidates) {
    if (added >= GARNISH_MAX_STOPS) break;
    if (input.routeCalls.count >= input.routeCalls.max) break;
    const category = candidate.place.category;
    const limit = input.categoryLimits?.[category] ?? DEFAULT_CATEGORY_LIMIT;
    if ((counts.get(category) ?? 0) >= limit) continue;

    // Актуальная нога-хозяин по текущим ногам петли (см. шапку).
    const { legIndex, deviationMeters } = bestLegFor(candidate.place, legs);
    if (legIndex < 0 || deviationMeters > (GARNISH_CORRIDOR_M + EPS)) continue;
    if (legTaken(legIndex)) continue; // один якорь на ногу

    const stay = resolveStayMinutes(candidate.place, input.categoryStayMinutes);
    const leg = legs[legIndex];
    // Оценка крюка по прямой с сетевым коэффициентом (§19.3): даже при
    // нулевом крюке якорь не влезает — пропускаем без роутинга.
    const straightDetour =
      haversineMeters(leg.from, candidate.place.coordinates) +
      haversineMeters(candidate.place.coordinates, leg.to) -
      leg.distanceMeters;
    const detourMinutes = (Math.max(0, straightDetour) / speedMPerMin) * DETOUR_NETWORK_FACTOR;
    if (totalOf() + stay + detourMinutes > ceiling + EPS) continue;

    // Реальные ноги через роутинг; отказ порта не фатален — следующий кандидат.
    input.routeCalls.count += 1;
    const legA = await routeLeg(input.ports, leg.from, candidate.place.coordinates);
    if (!legA) continue;
    if (input.routeCalls.count >= input.routeCalls.max) continue;
    input.routeCalls.count += 1;
    const legB = await routeLeg(input.ports, candidate.place.coordinates, leg.to);
    if (!legB) continue;

    // Честный бюджет по реальным ногам: перерасход — кандидат пропускается.
    const trialWalkDelta = legA.durationMinutes + legB.durationMinutes - leg.durationMinutes;
    if (totalOf() + trialWalkDelta + stay > ceiling + EPS) continue;

    // Микро-стопы только на двух новых ногах (attachMicroNotes мутирует):
    // их минуты уже внутри durationMinutes, кап держит их в потолке.
    attachMicroNotes({
      legs: [legA, legB],
      features: input.streetFeatures,
      budgetMinutes: input.budgetMinutes,
      currentTotalMinutes: totalOf() + trialWalkDelta + stay,
    });

    // Вставка принята: слоты правее съезжают на +1 (нога разрезана надвое).
    for (const p of placed) {
      if (p.slot > legIndex) p.slot += 1;
    }
    legs.splice(legIndex, 1, legA, legB);
    placed.push({ stop: { place: candidate.place, stayMinutes: stay, reason: '' }, deviationMeters, slot: legIndex });
    counts.set(category, (counts.get(category) ?? 0) + 1);
    added += 1;
  }

  // Причины выбранных якорей (§9): closest — минимум отклонения среди
  // выбранных, proximity — отклонение от полилинии петли.
  const minDeviation =
    placed.length > 0 ? Math.min(...placed.map((p) => p.deviationMeters)) : 0;
  for (const p of placed) {
    const facts = {
      place: p.stop.place,
      zoneWord: 'радиусе' as const,
      isBestOfCategory: bestOfCategory.get(p.stop.place.category) === `${p.stop.place.id}`,
      isClosest: p.deviationMeters <= minDeviation + EPS,
      proximityMeters: p.deviationMeters,
    };
    p.stop.reason = buildAnchorReason(facts);
    p.stop.reasonEn = buildAnchorReasonEn(facts);
  }

  placed.sort((a, b) => a.slot - b.slot);
  return {
    legs,
    stops: [...existingStops, ...placed.map((p) => p.stop)],
    added,
    slots: placed.map((p) => p.slot),
  };
}

/** Одна нога обычным route: отказ порта/мусорные метрики → null (не бросает). */
async function routeLeg(
  ports: WalkRoutingPort,
  from: WalkLatLng,
  to: WalkLatLng,
): Promise<WalkLeg | null> {
  let segment;
  try {
    segment = await ports.route({ waypoints: [from, to] });
  } catch {
    return null;
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
