// src/lib/walk/gates.ts
// Гейты «Метрики хорошей прогулки» (PRODUCT.md), docs/walk-engine.md §8 и §19.4:
// якорь-драйвен план — бюджет ±10%; ≥2 якоря с непустой причиной; нет ноги
// > 25 мин; петля не возвращается по той же улице; ходьба ≥ 35% бюджета.
// Уличный план (planType 'street', ревизия 2026-11-18) — свой набор: без
// anchors и long_legs (содержание идёт под ногами), со street_interest.

import type { GateReport, WalkGateName, WalkLatLng, WalkStop } from './types';
import { BUDGET_TOLERANCE, MAX_LEG_MINUTES, MIN_WALK_SHARE } from './types';
import { fractionWithinCorridor, polylineLengthMeters } from './internal/geo';

/** Коридор одной улицы: проезжая часть + тротуары + джиттер роутинга. */
export const SAME_STREET_CORRIDOR_M = 30;
/** «Большая часть ноги переиспользована»; перекрёстки на светофорах не наказываются. */
export const SAME_STREET_OVERLAP_THRESHOLD = 0.6;
/** Уличный план: снап-секторов столько, сколько нужно гейту интереса (§19.4). */
export const STREET_INTEREST_MIN_SNAPPED = 2;

export interface GateFacts {
  budgetMinutes: number;
  totalMinutes: number;
  stops: WalkStop[];
  legDurations: number[];
  legGeometries: WalkLatLng[][];
  isLoop: boolean;
  /**
   * Тип плана (walk-engine.md §19.4): 'anchored' (по умолчанию) — якорь-драйвен
   * набор §8; 'street' — уличная петля: без anchors/long_legs, со
   * street_interest при наличии данных среды.
   */
  planType?: 'anchored' | 'street';
  /** Сколько секторов розы снапнуто (факт WalkPlan.streetSnappedSectors). */
  streetSnappedSectors?: number;
  /** Данные среды живы (hasData) — без них гейт интереса не выпускается. */
  streetHasData?: boolean;
}

export function evaluateGates(facts: GateFacts): GateReport[] {
  const street = facts.planType === 'street';
  const reports: GateReport[] = [];
  reports.push(budgetGate(facts));
  if (!street) reports.push(anchorsGate(facts));
  if (!street) reports.push(longLegsGate(facts));
  if (facts.isLoop) reports.push(walkShareGate(facts));
  if (facts.isLoop) reports.push(loopStreetGate(facts.legGeometries));
  if (street && facts.streetHasData) reports.push(streetInterestGate(facts));
  return reports;
}

/**
 * Гейт интереса уличного плана (§19.4): при живых данных среды роза обязана
 * притянуться к характерным секторам (≥ 2). Без данных гейт не выпускается —
 * план не наказывается за то, чего мы не знаем (принцип 5 PRODUCT.md).
 */
function streetInterestGate(facts: GateFacts): GateReport {
  const gate: WalkGateName = 'street_interest';
  const snapped = facts.streetSnappedSectors ?? 0;
  const pass = snapped >= STREET_INTEREST_MIN_SNAPPED;
  return {
    gate,
    pass,
    detail: pass
      ? `петля притянута к ${snapped} характерным секторам`
      : `снап-секторов: ${snapped} из ${STREET_INTEREST_MIN_SNAPPED} — петля прошла мимо характера улиц`,
  };
}

/** Петля — это прогулка: суммарная ходьба ≥ 35% бюджета (стоит в карточке
 *  отдельной строкой, и «путь 7 минут, а пишет 60» — провал этого гейта). */
function walkShareGate(facts: GateFacts): GateReport {
  const gate: WalkGateName = 'walk_share';
  const walk = facts.legDurations.reduce((sum, d) => sum + d, 0);
  const minWalk = facts.budgetMinutes * MIN_WALK_SHARE;
  const pass = walk >= minWalk - 1e-9;
  return {
    gate,
    pass,
    detail: pass
      ? `ходьба ${Math.round(walk)} мин из бюджета ${Math.round(facts.budgetMinutes)}`
      : `ходьба ${Math.round(walk)} мин — меньше ${Math.round(minWalk)} мин (35% бюджета)`,
  };
}

function budgetGate(facts: GateFacts): GateReport {
  const budget = facts.budgetMinutes;
  const total = facts.totalMinutes;
  const pass =
    total >= budget * (1 - BUDGET_TOLERANCE) - 1e-9 &&
    total <= budget * (1 + BUDGET_TOLERANCE) + 1e-9;
  const deviationPct = Math.round(((total - budget) / budget) * 100);
  const sign = deviationPct >= 0 ? '+' : '';
  return {
    gate: 'budget',
    pass,
    detail: `${Math.round(total)} мин против бюджета ${Math.round(budget)} (${sign}${deviationPct}%)`,
  };
}

function anchorsGate(facts: GateFacts): GateReport {
  const withoutReason = facts.stops.filter(
    (stop) => typeof stop.reason !== 'string' || stop.reason.trim().length === 0,
  );
  const pass = facts.stops.length >= 2 && withoutReason.length === 0;
  const detail =
    withoutReason.length > 0
      ? `причина не задана: ${withoutReason.map((s) => `«${s.place.name}»`).join(', ')}`
      : facts.stops.length === 0
        ? 'якорей нет'
        : `${facts.stops.length} якорей, причины заданы`;
  return { gate: 'anchors', pass, detail };
}

function longLegsGate(facts: GateFacts): GateReport {
  const durations = facts.legDurations;
  const maxLeg = durations.length > 0 ? Math.max(...durations) : 0;
  const pass = maxLeg <= MAX_LEG_MINUTES + 1e-6;
  const detail =
    pass || durations.length === 0
      ? `максимальная нога ${Math.round(maxLeg)} мин`
      : `нога ${durations.indexOf(maxLeg) + 1} длится ${Math.round(maxLeg)} мин (лимит ${MAX_LEG_MINUTES})`;
  return { gate: 'long_legs', pass, detail };
}

/**
 * Числовая метрика перекрытия петли: максимум доли перекрытия по всем парам
 * ног — та же механика, что у loopStreetGate (коридор 30 м, короткая нога
 * в коридоре длинной). Реакция лестницы деградации L3: если гейт улиц упал,
 * перебираем варианты розы и берём вариант с минимальным перекрытием.
 */
export function maxStreetOverlap(geometries: WalkLatLng[][]): number {
  let max = 0;
  for (let i = 0; i < geometries.length; i++) {
    for (let j = i + 1; j < geometries.length; j++) {
      const a = geometries[i];
      const b = geometries[j];
      if (a.length < 2 || b.length < 2) continue;
      const [shorter, longer] =
        polylineLengthMeters(a) <= polylineLengthMeters(b) ? [a, b] : [b, a];
      max = Math.max(max, fractionWithinCorridor(shorter, longer, SAME_STREET_CORRIDOR_M));
    }
  }
  return max;
}

/**
 * Эвристика «не по той же улице» (выбор задокументирован в §8): для пары ног
 * доля точек короче ноги в 30-метровом коридоре другой ноги > 0.6 → провал.
 * Нет геометрии — честная деградация: гейт проходит с пометкой.
 */
function loopStreetGate(geometries: WalkLatLng[][]): GateReport {
  const gate: WalkGateName = 'loop_no_repeat_street';
  const usable = geometries.filter((g) => g.length >= 2);
  if (usable.length < 2) {
    return { gate, pass: true, detail: 'геометрия ног недоступна — проверка пропущена' };
  }
  for (let i = 0; i < geometries.length; i++) {
    for (let j = i + 1; j < geometries.length; j++) {
      const a = geometries[i];
      const b = geometries[j];
      if (a.length < 2 || b.length < 2) continue;
      // Замеряем перекрытие КОРОТКОЙ ноги (по длине, не по числу точек —
      // после ресемплинга плотность точек неравномерна).
      const [shorter, longer] =
        polylineLengthMeters(a) <= polylineLengthMeters(b) ? [a, b] : [b, a];
      const overlap = fractionWithinCorridor(shorter, longer, SAME_STREET_CORRIDOR_M);
      if (overlap > SAME_STREET_OVERLAP_THRESHOLD) {
        return {
          gate,
          pass: false,
          detail: `нога ${j + 1} повторяет улицу ноги ${i + 1} (~${Math.round(overlap * 100)}% пути)`,
        };
      }
    }
  }
  return { gate, pass: true, detail: 'повторов улиц нет' };
}
