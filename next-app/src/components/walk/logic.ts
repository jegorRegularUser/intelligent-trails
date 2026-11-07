// Чистая логика главного экрана «Прогуляться сейчас»: чипы, бюджет, фазы.
// Никакого React и стора — только функции, которые можно держать в тестах.
// Обоснования решений: docs/ux-main-screen.md, разделы 2 и 6.

import type { WalkLeg, WalkPlanTotals, WalkStop } from "./types";

/** Пресеты времени на чипах: 30 мин / 1 час / 1,5 часа */
export const TIME_PRESETS = [30, 60, 90] as const;
export type TimePreset = (typeof TIME_PRESETS)[number];

/** «Точно…» — степпер ±5 мин в этом диапазоне */
export const MIN_CUSTOM_MINUTES = 10;
export const MAX_CUSTOM_MINUTES = 180;
export const CUSTOM_STEP = 5;
export const DEFAULT_CUSTOM_MINUTES = 45;

/** Архетипы из PRODUCT.md: зелёная, кофейная, вечерняя, дождь, удиви меня */
export const VIBE_IDS = ["green", "coffee", "evening", "rain", "surprise"] as const;
export type VibeId = (typeof VIBE_IDS)[number];
export const SURPRISE_VIBE: VibeId = "surprise";

/** Гейт генератора из PRODUCT.md: прогулка укладывается в бюджет ±10% */
export const BUDGET_TOLERANCE = 0.1;

/** Степпер «Точно…» зажимает значение в диапазон и округляет к шагу 5 */
export function normalizeCustomMinutes(raw: number): number {
  const clamped = Math.min(MAX_CUSTOM_MINUTES, Math.max(MIN_CUSTOM_MINUTES, raw));
  return Math.round(clamped / CUSTOM_STEP) * CUSTOM_STEP;
}

/** CTA активна от одного выбранного времени; вайб не обязателен */
export function canStartWalk(selectedMinutes: number | null): boolean {
  return (
    selectedMinutes !== null &&
    Number.isFinite(selectedMinutes) &&
    selectedMinutes >= MIN_CUSTOM_MINUTES
  );
}

/**
 * Вайб — одиночный выбор. «Удиви меня» — вайлдкард: снимает конкретный
 * архетип, движок получает микс. Повторный тап снимает выбор (null).
 */
export function toggleVibe(current: VibeId | null, next: VibeId): VibeId | null {
  if (next === SURPRISE_VIBE) return null;
  if (current === next) return null;
  return next;
}

/** Уложились в бюджет ±10% (недобор не наказываем — «с запасом» это хорошо) */
export function isWithinBudget(totalMin: number, budgetMin: number): boolean {
  return totalMin <= budgetMin * (1 + BUDGET_TOLERANCE);
}

/** На сколько процентов итог вышел за бюджет; 0, если уложились */
export function budgetOverrunPercent(totalMin: number, budgetMin: number): number {
  if (budgetMin <= 0) return 0;
  const overrun = (totalMin / budgetMin - 1) * 100;
  return overrun > 0 ? Math.round(overrun) : 0;
}

/** Честное время: сумма ходьбы по перегонам и стоянок на остановках */
export function computeTotals(
  stops: Pick<WalkStop, "stayMin">[],
  legs: Pick<WalkLeg, "walkMin">[]
): WalkPlanTotals {
  const stayMin = stops.reduce((sum, s) => sum + s.stayMin, 0);
  const walkMin = legs.reduce((sum, l) => sum + l.walkMin, 0);
  return { walkMin, stayMin, totalMin: walkMin + stayMin };
}

/** Прогноз под CTA: бюджет ±25%, скруглённый наружу до 10 мин */
export function estimateBuildRange(budgetMin: number): { from: number; to: number } {
  const from = Math.max(10, Math.floor((budgetMin * 0.75) / 10) * 10);
  const to = Math.ceil((budgetMin * 1.25) / 10) * 10;
  return { from, to };
}

// --- Машина фаз главного экрана (docs/ux-main-screen.md, раздел 2) ---

export type WalkPhase = "idle" | "params" | "building" | "ready" | "error" | "offline";

export type WalkEvent =
  | { type: "PARAMS_TOUCHED" }
  | { type: "START_BUILD" }
  | { type: "BUILD_SUCCESS" }
  | { type: "BUILD_FAILED" }
  | { type: "RETRY" }
  | { type: "OFFLINE" }
  | { type: "ONLINE" }
  | { type: "RESET" };

export interface WalkMachineState {
  phase: WalkPhase;
  /** Фаза до ухода в offline — ONLINE возвращает ровно туда */
  resumePhase: WalkPhase | null;
}

export const INITIAL_WALK_STATE: WalkMachineState = { phase: "idle", resumePhase: null };

/**
 * Неизвестные переходы оставляют состояние как есть: случайное событие
 * (двойной клик, гонка колбэков) не может уронить экран в недопустимую фазу.
 */
export function walkMachine(state: WalkMachineState, event: WalkEvent): WalkMachineState {
  const { phase, resumePhase } = state;
  switch (event.type) {
    case "PARAMS_TOUCHED":
      if (phase === "idle" || phase === "error") {
        return { phase: "params", resumePhase: null };
      }
      return state;
    case "START_BUILD":
      if (phase === "idle" || phase === "params") {
        return { phase: "building", resumePhase: null };
      }
      return state;
    case "BUILD_SUCCESS":
      if (phase === "building") return { phase: "ready", resumePhase: null };
      return state;
    case "BUILD_FAILED":
      if (phase === "building") return { phase: "error", resumePhase: null };
      return state;
    case "RETRY":
      if (phase === "error") return { phase: "building", resumePhase: null };
      return state;
    case "OFFLINE":
      if (phase === "idle" || phase === "params" || phase === "ready") {
        return { phase: "offline", resumePhase: phase };
      }
      // Из building обрыв сети приходит как BUILD_FAILED — там и обработается
      return state;
    case "ONLINE":
      if (phase === "offline" && resumePhase) {
        return { phase: resumePhase, resumePhase: null };
      }
      return state;
    case "RESET":
      return INITIAL_WALK_STATE;
  }
}
