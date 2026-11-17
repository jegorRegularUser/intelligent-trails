// src/components/places/walkStopCard.ts
// Пин остановки прогулки → богатая карточка места (docs/place-cards.md).
// Общий для обеих канв: RouteMap (эксперт-Яндекс) и MapCanvas (maplibre,
// docs/ux-human-wave.md M1) показывают одинаковую карточку пина.
import { getKindInfo, type PlaceCard as PlaceCardData } from '@/lib/places';
import { evaluateOpeningHours } from '@/lib/places/hours';

export interface WalkStopCardSource {
  name: string;
  kind: string;
  reason?: string;
  openingHours?: string;
}

/** Часы считаем в момент клика в браузерной таймзоне юзера; нет часов или
 *  строки не разобрались — 'unknown', честная деградация (docs/place-cards.md). */
export function buildWalkStopCard(stop: WalkStopCardSource, locale: string): PlaceCardData {
  const info = getKindInfo(stop.kind);
  let openState: PlaceCardData['openState'] = 'unknown';
  if (stop.openingHours) {
    try {
      openState = evaluateOpeningHours(
        stop.openingHours,
        new Date(),
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      );
    } catch {
      openState = 'unknown';
    }
  }
  return {
    kind: stop.kind,
    kindLabel: locale === 'en' ? info.en : info.ru,
    icon: info.icon,
    name: stop.name,
    displayName: stop.name,
    openState,
  };
}
