// src/lib/walk/reasons.ts
// Причины якорей — по-русски, только из фактов выбора (docs/walk-engine.md §9).
// Все строки детерминированы: одинаковое состояние кандидатов даёт одинаковую
// причину. Гейт anchors требует непустой причины у каждого якоря.
//
// M5 (docs/ux-human-wave.md «Человеческий язык причин»): причина не повторяет
// категорию — «Кофейня · Лучший «кафе» поблизости» читалось тавтологией, а
// «лучший скор категории „X“ в радиусе» — языком скоринга. Новые формулы
// самодостаточны («Лучший выбор рядом», «Прямо по пути (~200 м)»): uiAdapter
// выводит из этого reasonStandalone, и карточка рендерит причину без префикса
// категории. Легаси-строки старых планов распознаются маркерами (uiAdapter).

import type { WalkPlace } from './types';

export type ZoneWord = 'коридоре' | 'радиусе';

export interface ReasonFacts {
  place: WalkPlace;
  /**
   * Легаси-поле времён «языка скоринга»: коридор/радиус в формулу больше не
   * попадают (у петли и A→B причина одна и та же). Поле оставлено: три места
   * сборки (createWalkPlan, loopThrough, replaceStop) продолжают передавать.
   */
  zoneWord: ZoneWord;
  /** Кандидат возглавляет свою категорию в шорт-листе. */
  isBestOfCategory: boolean;
  /** Самая близкая к линии/старту среди выбранных якорей. */
  isClosest: boolean;
  proximityMeters: number;
}

/** Рейтинг, достойный упоминания. */
const NOTABLE_RATING = 4.5;

/**
 * Голова причины — позиционный факт выбора без имени категории: лучший в
 * шорт-листе → «Лучший выбор рядом»; самый близкий к пути → «Прямо по пути
 * (~N м)»; остальное — крюк от линии назван честно, в метрах.
 */
function reasonHeadRu(facts: ReasonFacts): string {
  if (facts.isBestOfCategory) return 'Лучший выбор рядом';
  const meters = Math.round(facts.proximityMeters);
  return facts.isClosest
    ? `Прямо по пути (~${meters} м)`
    : `Стоит небольшого крюка (~${meters} м)`;
}

/** EN-твин reasonHeadRu: категории реестра в строку не вписываются. */
function reasonHeadEn(facts: ReasonFacts): string {
  if (facts.isBestOfCategory) return 'A top pick nearby';
  const meters = Math.round(facts.proximityMeters);
  return facts.isClosest
    ? `Right on the way (~${meters} m)`
    : `Worth a short detour (~${meters} m)`;
}

export function buildAnchorReason(facts: ReasonFacts): string {
  const head = reasonHeadRu(facts);
  const rating = facts.place.rating ?? 0;
  return rating >= NOTABLE_RATING ? `${head}, рейтинг ${rating.toFixed(1)}` : head;
}

/** Английская версия buildAnchorReason — параллельная ветка, тот же факт. */
export function buildAnchorReasonEn(facts: ReasonFacts): string {
  const head = reasonHeadEn(facts);
  const rating = facts.place.rating ?? 0;
  return rating >= NOTABLE_RATING ? `${head}, rated ${rating.toFixed(1)}` : head;
}
