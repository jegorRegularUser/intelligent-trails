// src/lib/walk/internal/geo-utils.ts
// Общие утилиты движка и лестницы деградации (docs/walk-loop-quality.md R6):
// один модуль вместо четырёх копий isFiniteLatLng/errMessage и валидационного
// стержня в createWalkPlan/loopThrough/streetLoop/replaceStop. Чистые функции:
// никакого порта, сети и состояния.

import type { WalkLatLng } from '../types';

/** Корректная точка приложения: конечная пара [широта, долгота] в пределах ±90/±180. */
export function isFiniteLatLng(p: unknown): p is WalkLatLng {
  return (
    Array.isArray(p) &&
    p.length === 2 &&
    Number.isFinite(p[0]) &&
    Number.isFinite(p[1]) &&
    Math.abs(p[0] as number) <= 90 &&
    Math.abs(p[1] as number) <= 180
  );
}

/** Текст проблемы из unknown-ошибки порта — для честных detail в отказах. */
export function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export interface WalkCoreInput {
  start?: unknown;
  budgetMinutes?: unknown;
  candidates?: unknown;
}

/**
 * Валидационный стержень входа движка и лестницы (R6): старт конечен,
 * бюджет — конечное число > 0, candidates — массив (если поле есть).
 * Тексты отказов — общий контракт деградации INVALID_INPUT; специфика
 * модулей (end/скорость/веса у движка, stops/replaceIndex у замены)
 * проверяется на месте поверх стержня.
 */
export function validateWalkCore(input: WalkCoreInput): string | null {
  if (!isFiniteLatLng(input.start)) {
    return 'start: ожидается [широта, долгота] с конечными числами';
  }
  if (
    typeof input.budgetMinutes !== 'number' ||
    !Number.isFinite(input.budgetMinutes) ||
    input.budgetMinutes <= 0
  ) {
    return 'budgetMinutes: положительное конечное число';
  }
  if (input.candidates !== undefined && !Array.isArray(input.candidates)) {
    return 'candidates: массив мест';
  }
  return null;
}
