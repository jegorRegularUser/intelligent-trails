// src/app/dev/cards/fixtures.ts
// Фикстуры для dev-демо карточек мест: сырьё геокода на разные ветки
// приоритетов из docs/place-cards.md. Только для страницы /dev/cards (noindex).

import type { ReverseGeocodeResult } from '@/lib/geo/types';

export interface PlaceCardFixture {
  id: string;
  /** Что смотреть в карточке. */
  caption: { ru: string; en: string };
  reversed: ReverseGeocodeResult;
  nearby?: ReverseGeocodeResult[];
  nearestRoad?: ReverseGeocodeResult;
}

export const PLACE_CARD_FIXTURES: PlaceCardFixture[] = [
  {
    id: 'cafe-beats-road',
    caption: {
      ru: 'Именованное кафе в 18 м бьёт дорогу в 2 м — правило 1',
      en: 'Named café at 18 m beats a road at 2 m — rule 1',
    },
    reversed: {
      kind: 'street',
      name: 'Тверская улица',
      distanceMeters: 2,
      osmId: 'w-road-1',
    },
    nearby: [
      {
        kind: 'cafe',
        name: 'Zima Cafe',
        distanceMeters: 18,
        osmId: 'w-cafe-1',
        tags: {
          'name:ru': 'Кофейня «Зима»',
          'name:en': 'Zima Café',
          opening_hours: 'Mo-Su 08:00-22:00',
          'addr:street': 'Тверская улица',
          'addr:housenumber': '12',
        },
      },
    ],
    nearestRoad: { kind: 'street', name: 'Тверская улица', distanceMeters: 2, osmId: 'w-road-1' },
  },
  {
    id: 'standing-on-road',
    caption: {
      ru: 'Стоим на дороге (4 м), имён рядом нет — правило 2',
      en: 'Standing on a road (4 m), no names around — rule 2',
    },
    reversed: { kind: 'house', address: 'ул. Ленина, 5', distanceMeters: 10 },
    nearestRoad: { kind: 'street', name: 'Тверская улица', distanceMeters: 4, osmId: 'w-road-1' },
  },
  {
    id: 'addressed-house',
    caption: {
      ru: 'Дорога дальше 5 м → дом с адресом — правило 3',
      en: 'Road beyond 5 m → addressed house — rule 3',
    },
    reversed: {
      kind: 'house',
      distanceMeters: 8,
      tags: { 'addr:street': 'Тверская', 'addr:housenumber': '7', 'addr:city': 'Москва' },
    },
    nearestRoad: { kind: 'street', name: 'Тверская улица', distanceMeters: 12, osmId: 'w-road-2' },
  },
  {
    id: 'fallback-house',
    caption: {
      ru: 'Вокруг только postcode и безымянный дом — fallback, правило 4',
      en: 'Only a postcode and an unnamed house around — fallback, rule 4',
    },
    reversed: { kind: 'postcode', tags: { 'addr:postcode': '101000' }, distanceMeters: 0 },
    nearby: [{ kind: 'house', distanceMeters: 30, osmId: 'w-house-9' }],
  },
  {
    id: 'honest-unknown',
    caption: {
      ru: 'Ничего понятного вокруг — честное «не знаем», дорога 40 м не считается',
      en: 'Nothing legible around — honest "unknown", a 40 m road does not count',
    },
    reversed: { kind: 'postcode', tags: { 'addr:postcode': '101000' }, distanceMeters: 0 },
    nearestRoad: { kind: 'street', name: 'Тверская улица', distanceMeters: 40, osmId: 'w-road-3' },
  },
  {
    id: 'hours-always-open',
    caption: {
      ru: 'Часы 24/7 — бейдж «открыто» в любой момент',
      en: '24/7 hours — "open" badge at any moment',
    },
    reversed: {
      kind: 'cafe',
      name: 'Круглосуточная кофейня',
      distanceMeters: 5,
      osmId: 'w-cafe-2',
      tags: { opening_hours: '24/7' },
    },
  },
  {
    id: 'hours-weekday',
    caption: {
      ru: 'Часы Mo-Fr 09:00-18:00 — бейдж зависит от момента оценки',
      en: 'Mo-Fr 09:00-18:00 hours — badge depends on the evaluation moment',
    },
    reversed: {
      kind: 'bakery',
      name: 'Пекарня «Колос»',
      distanceMeters: 5,
      osmId: 'w-bakery-1',
      tags: { opening_hours: 'Mo-Fr 09:00-18:00; Sa,Su 10:00-22:00' },
    },
  },
  {
    id: 'hours-garbage',
    caption: {
      ru: 'Непарсируемые часы (PH off) — честный unknown, не closed',
      en: 'Unparseable hours (PH off) — honest unknown, not closed',
    },
    reversed: {
      kind: 'gallery',
      name: 'Галерея «Свет»',
      distanceMeters: 5,
      osmId: 'w-gallery-1',
      tags: { opening_hours: 'Mo-Su 11:00-20:00; PH off' },
    },
  },
  {
    id: 'nearby-landmark',
    caption: {
      ru: 'Дом с адресом + музей в 100 м → суффикс «(рядом: …)»',
      en: 'Addressed house + a museum 100 m away → "(near …)" suffix',
    },
    reversed: {
      kind: 'house',
      address: 'Набережная, 3',
      distanceMeters: 4,
      tags: { 'addr:city': 'Санкт-Петербург' },
    },
    nearby: [
      {
        kind: 'museum',
        name: 'Hermitage',
        distanceMeters: 100,
        osmId: 'w-museum-1',
        tags: { 'name:ru': 'Эрмитаж', 'name:en': 'Hermitage', 'addr:city': 'Санкт-Петербург' },
      },
    ],
  },
  {
    id: 'unknown-kind',
    caption: {
      ru: 'Незнакомый kind — нейтральная подпись и иконка',
      en: 'Unfamiliar kind — neutral label and icon',
    },
    reversed: {
      kind: 'weird_osm_thing',
      name: 'Странный объект',
      distanceMeters: 5,
    },
  },
];

/** Фикстуры для интерактивного мини-карточного демо. */
export const MINI_FIXTURE_IDS = ['cafe-beats-road', 'standing-on-road', 'nearby-landmark', 'honest-unknown'] as const;
