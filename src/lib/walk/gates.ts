// src/lib/walk/gates.ts
// Гейты «Метрики хорошей прогулки» (PRODUCT.md), docs/walk-engine.md §8:
// бюджет ±10%; ≥2 якоря с непустой причиной; нет ноги > 25 мин;
// петля не возвращается по той же улице.

import type { GateReport, WalkGateName, WalkLatLng, WalkStop } from './types';
import { BUDGET_TOLERANCE, MAX_LEG_MINUTES } from './types';
import { fractionWithinCorridor, polylineLengthMeters } from './internal/geo';

/** Коридор одной улицы: проезжая часть + тротуары + джиттер роутинга. */
export const SAME_STREET_CORRIDOR_M = 30;
/** «Большая часть ноги переиспользована»; перекрёстки на светофорах не наказываются. */
export const SAME_STREET_OVERLAP_THRESHOLD = 0.6;

export interface GateFacts {
  budgetMinutes: number;
  totalMinutes: number;
  stops: WalkStop[];
  legDurations: number[];
  legGeometries: WalkLatLng[][];
  isLoop: boolean;
}

export function evaluateGates(facts: GateFacts): GateReport[] {
  const reports: GateReport[] = [];
  reports.push(budgetGate(facts));
  reports.push(anchorsGate(facts));
  reports.push(longLegsGate(facts));
  if (facts.isLoop) reports.push(loopStreetGate(facts.legGeometries));
  return reports;
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
