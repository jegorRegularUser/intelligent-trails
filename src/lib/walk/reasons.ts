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

/** Русские названия категорий для причин: реестр categories тянет lucide-react,
 *  движок UI-зависимостей не имеет — держим лёгкий словарь имён. */
const CATEGORY_RU: Record<string, string> = {
  cafe: 'кафе',
  restaurant: 'ресторан',
  park: 'парк',
  museum: 'музей',
  cinema: 'кинотеатр',
  bar: 'бар',
  shopping: 'магазин',
  viewpoint: 'смотровая площадка',
  attraction: 'достопримечательность',
  waterfront: 'набережная',
  market: 'рынок',
};
function categoryRu(category: string): string {
  return CATEGORY_RU[category] ?? category;
}

export function buildAnchorReason(facts: ReasonFacts): string {
  const parts: string[] = [];
  if (facts.isBestOfCategory) {
    parts.push(`Лучший «${categoryRu(facts.place.category)}» поблизости`);
  }
  if ((facts.place.rating ?? 0) >= NOTABLE_RATING) {
    parts.push(`рейтинг ${facts.place.rating!.toFixed(1)}`);
  }
  if (parts.length === 0) {
    if (facts.isClosest) {
      const meters = Math.round(facts.proximityMeters);
      parts.push(`Прямо по пути (~${meters} м)`);
    } else {
      parts.push(`Ещё один хороший «${categoryRu(facts.place.category)}» рядом`);
    }
  }
  return parts.join(', ');
}

/** EN-твин зоны: коридоре → corridor, радиусе → radius. */
export type ZoneWordEn = 'corridor' | 'radius';
export function zoneWordEn(zone: ZoneWord): ZoneWordEn {
  return zone === 'радиусе' ? 'radius' : 'corridor';
}

/** Английская версия buildAnchorReason. Категории — английские ключи реестра. */
export function buildAnchorReasonEn(facts: ReasonFacts): string {
  const parts: string[] = [];
  if (facts.isBestOfCategory) {
    parts.push(`The best ${facts.place.category} around`);
  }
  if ((facts.place.rating ?? 0) >= NOTABLE_RATING) {
    parts.push(`rated ${facts.place.rating!.toFixed(1)}`);
  }
  if (parts.length === 0) {
    if (facts.isClosest) {
      const meters = Math.round(facts.proximityMeters);
      parts.push(`Right on the way (~${meters} m)`);
    } else {
      parts.push(`Another good ${facts.place.category} nearby`);
    }
  }
  return parts.join(', ');
}