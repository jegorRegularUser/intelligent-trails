// src/lib/walk/reasons.ts
// Причины якорей — по-русски, только из фактов выбора (docs/walk-engine.md §9).
// Все строки детерминированы: одинаковое состояние кандидатов даёт одинаковую
// причину. Гейт anchors требует непустой причины у каждого якоря.

import type { WalkPlace } from './types';

export type ZoneWord = 'коридоре' | 'радиусе';

export interface ReasonFacts {
  place: WalkPlace;
  zoneWord: ZoneWord;
  /** Кандидат возглавляет свою категорию в шорт-листе. */
  isBestOfCategory: boolean;
  /** Самая близкая к линии/старту среди выбранных якорей. */
  isClosest: boolean;
  proximityMeters: number;
}

/** Рейтинг, достойный упоминания. */
const NOTABLE_RATING = 4.5;

export function buildAnchorReason(facts: ReasonFacts): string {
  const parts: string[] = [];
  if (facts.isBestOfCategory) {
    parts.push(`Лучший скор категории «${facts.place.category}» в ${facts.zoneWord}`);
  }
  if ((facts.place.rating ?? 0) >= NOTABLE_RATING) {
    parts.push(`высокий рейтинг (${facts.place.rating!.toFixed(1)})`);
  }
  if (parts.length === 0) {
    if (facts.isClosest) {
      const meters = Math.round(facts.proximityMeters);
      parts.push(
        facts.zoneWord === 'радиусе'
          ? `Самый близкий к старту среди выбранных (~${meters} м)`
          : `Минимальный крюк с линии маршрута (~${meters} м)`,
      );
    } else {
      parts.push(`Заходит в план по весу категории «${facts.place.category}»`);
    }
  }
  return parts.join(', ');
}
