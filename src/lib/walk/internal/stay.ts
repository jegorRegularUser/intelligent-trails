// src/lib/walk/internal/stay.ts
// Таблица времени стоянок (docs/walk-engine.md §6). Числа — стартовая
// калибровка под архетипы PRODUCT.md («сколько тут сидеть» у якоря);
// переопределяется через WalkInput.categoryStayMinutes.
//
// constants/categories.ts сознательно не импортируется: он тянет lucide-react
// (иконки) в граф чистого движка. Совпадение ключей с категориями там —
// соглашение, проверяемое тестами.

import type { WalkPlace } from '../types';

/** Минут по умолчанию на якорь категории. */
export const DEFAULT_STAY_MINUTES: Record<string, number> = {
  park: 25,
  museum: 45,
  cafe: 20,
  restaurant: 40,
  bar: 30,
  viewpoint: 15,
  attraction: 25,
  cinema: 90,
  shopping: 40,
};

export const DEFAULT_UNKNOWN_STAY_MINUTES = 20;

export function resolveStayMinutes(
  place: WalkPlace,
  override?: Record<string, number>,
): number {
  const raw = override?.[place.category] ?? DEFAULT_STAY_MINUTES[place.category] ?? DEFAULT_UNKNOWN_STAY_MINUTES;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
    return DEFAULT_UNKNOWN_STAY_MINUTES;
  }
  return raw;
}
