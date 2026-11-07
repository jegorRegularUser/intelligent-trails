import { describe, expect, it } from 'vitest';

import type { ReverseGeocodeResult } from '@/lib/geo/types';

import { buildPlaceCard } from '@/lib/places/card';

const geo = (over: Partial<ReverseGeocodeResult>): ReverseGeocodeResult => ({ ...over });

/** Понедельник 2024-01-15, 10:00 UTC. */
const MON_NOON = new Date('2024-01-15T10:00:00Z');
const UTC = 'UTC';

describe('buildPlaceCard — приоритеты', () => {
  it('именованный объект ≤20 м бьёт дорогу, даже когда дорога ближе', () => {
    const card = buildPlaceCard(
      geo({ kind: 'street', name: 'Тверская улица', distanceMeters: 2 }),
      [geo({ kind: 'cafe', name: 'Кофейня «Зима»', distanceMeters: 18, osmId: 'w1' })],
      geo({ kind: 'street', name: 'Тверская улица', distanceMeters: 2 }),
      { locale: 'ru' },
    );
    expect(card.displayName).toBe('Кофейня «Зима»');
    expect(card.kind).toBe('cafe');
  });

  it('дорога принимается только ≤5 м', () => {
    const card = buildPlaceCard(
      geo({ kind: 'house', address: 'ул. Ленина, 5', distanceMeters: 10 }),
      [],
      geo({ kind: 'street', name: 'Тверская улица', distanceMeters: 4 }),
      { locale: 'ru' },
    );
    expect(card.kind).toBe('street');
    expect(card.displayName).toBe('Тверская улица');
  });

  it('дорога дальше 5 м проигрывает дому с адресом', () => {
    const card = buildPlaceCard(
      geo({ kind: 'house', address: 'ул. Ленина, 5', distanceMeters: 10 }),
      [],
      geo({ kind: 'street', name: 'Тверская улица', distanceMeters: 12 }),
      { locale: 'ru' },
    );
    expect(card.kind).toBe('house');
    expect(card.address).toBe('ул. Ленина, 5');
  });

  it('дорога без известной дистанции не принимается', () => {
    const card = buildPlaceCard(
      geo({ kind: 'house', address: 'ул. Ленина, 5', distanceMeters: 10 }),
      [],
      geo({ kind: 'street', name: 'Тверская улица' }),
      { locale: 'ru' },
    );
    expect(card.kind).toBe('house');
  });

  it('дом с адресом ≤20 м', () => {
    const card = buildPlaceCard(
      geo({ kind: 'house', distanceMeters: 8, tags: { 'addr:street': 'Тверская', 'addr:housenumber': '7' } }),
      [],
      undefined,
      { locale: 'ru' },
    );
    expect(card.kind).toBe('house');
    expect(card.address).toBe('Тверская, 7');
    expect(card.displayName).toBe('Дом');
  });

  it('fallback — ближайший дом без имени и адреса', () => {
    const card = buildPlaceCard(
      geo({ kind: 'postcode', tags: { 'addr:postcode': '101000' }, distanceMeters: 0 }),
      [geo({ kind: 'house', distanceMeters: 30, osmId: 'w9' })],
      undefined,
      { locale: 'ru' },
    );
    expect(card.kind).toBe('house');
    expect(card.displayName).toBe('Дом');
  });

  it('полная пустота вокруг — честная карточка «не знаем»', () => {
    const card = buildPlaceCard(
      geo({ kind: 'postcode', tags: { 'addr:postcode': '101000' }, distanceMeters: 0 }),
      [],
      geo({ kind: 'street', name: 'Тверская улица', distanceMeters: 40 }),
      { locale: 'ru' },
    );
    expect(card.kind).toBe('unknown');
    expect(card.displayName).toBe('Место');
    expect(card.openState).toBe('unknown');
  });

  it('null вместо reversed — честная карточка, а не падение', () => {
    expect(buildPlaceCard(null, undefined, undefined, { locale: 'ru' }).kind).toBe('unknown');
  });

  it('отсутствие дистанции у reversed означает «объект в точке» (0 м)', () => {
    const card = buildPlaceCard(
      geo({ kind: 'cafe', name: 'Кофейня «Зима»' }),
      [],
      undefined,
      { locale: 'ru', timeZone: UTC, at: MON_NOON },
    );
    expect(card.distanceMeters).toBe(0);
    expect(card.distanceLabel).toBe('0 м');
  });

  it('кандидат nearby без дистанции не участвует в дистанционных правилах', () => {
    const card = buildPlaceCard(
      geo({ kind: 'house', address: 'ул. Ленина, 5', distanceMeters: 5 }),
      [geo({ kind: 'cafe', name: 'Кофейня без координат', osmId: 'w2' })],
      undefined,
      { locale: 'ru' },
    );
    expect(card.kind).toBe('house');
  });

  it('дорога нестандартного highway-типа (residential) тоже подчиняется правилу 5 м', () => {
    const card = buildPlaceCard(
      geo({ kind: 'house', address: 'ул. Ленина, 5', distanceMeters: 10 }),
      [],
      geo({ kind: 'residential', name: 'Проезд Вешних Вод', distanceMeters: 12 }),
      { locale: 'ru' },
    );
    expect(card.kind).toBe('house');

    const onRoad = buildPlaceCard(
      geo({ kind: 'house', address: 'ул. Ленина, 5', distanceMeters: 10 }),
      [],
      geo({ kind: 'residential', name: 'Проезд Вешних Вод', distanceMeters: 4 }),
      { locale: 'ru' },
    );
    expect(onRoad.kind).toBe('street');
  });

  it('дом без известной дистанции не становится fallback-«ближайшим»', () => {
    const card = buildPlaceCard(
      geo({ kind: 'postcode', tags: { 'addr:postcode': '101000' }, distanceMeters: 0 }),
      [geo({ kind: 'house', osmId: 'w-no-dist' })],
      undefined,
      { locale: 'ru' },
    );
    // Дистанция неизвестна — «ближайший» недоказуем → честное «не знаем».
    expect(card.kind).toBe('unknown');
  });

  it('дубликат по osmId не рассматривается дважды', () => {
    const reversed = geo({ kind: 'cafe', name: 'Кофейня «Зима»', distanceMeters: 5, osmId: 'w1' });
    const card = buildPlaceCard(
      reversed,
      [geo({ kind: 'house', address: 'Тверская, 7', distanceMeters: 3, osmId: 'w1' })],
      undefined,
      { locale: 'ru' },
    );
    // Второй кандидат с тем же osmId отброшен — выбран reversed (кафе).
    expect(card.kind).toBe('cafe');
  });
});

describe('buildPlaceCard — дедуп и лейблы', () => {
  it('kind-слово в начале имени не дублируется', () => {
    const card = buildPlaceCard(
      geo({ kind: 'monument', name: 'Памятник Пушкину', distanceMeters: 5 }),
      [],
      undefined,
      { locale: 'ru' },
    );
    expect(card.kindLabel).toBe('');
    expect(card.displayName).toBe('Памятник Пушкину');
  });

  it('kind-слово остаётся, если имени нет', () => {
    const card = buildPlaceCard(
      geo({ kind: 'fountain', distanceMeters: 5 }),
      [],
      undefined,
      { locale: 'ru' },
    );
    expect(card.kindLabel).toBe('Фонтан');
    expect(card.displayName).toBe('Фонтан');
  });

  it('локаль en — английские подписи и единицы', () => {
    const card = buildPlaceCard(
      geo({ kind: 'cafe', name: 'Кофейня «Зима»', distanceMeters: 350 }),
      [],
      undefined,
      { locale: 'en' },
    );
    expect(card.kindLabel).toBe('Café');
    expect(card.distanceLabel).toBe('350 m');
    expect(card.kind).toBe('cafe');
  });

  it('неизвестный kind — нейтральная подпись и displayName', () => {
    const card = buildPlaceCard(
      geo({ kind: 'alien_ship', distanceMeters: 5 }),
      [],
      undefined,
      { locale: 'ru' },
    );
    expect(card.kind).toBe('alien_ship');
    expect(card.kindLabel).toBe('Место');
    expect(card.displayName).toBe('Место');
  });
});

describe('buildPlaceCard — enrichment «(рядом: …)»', () => {
  const primary = geo({
    kind: 'house',
    address: 'Набережная, 3',
    distanceMeters: 4,
    tags: { 'addr:city': 'Санкт-Петербург', opening_hours: 'Mo-Fr 09:00-18:00' },
  });

  it('ближайший landmark ≤150 м даёт суффикс', () => {
    const card = buildPlaceCard(
      primary,
      [geo({ kind: 'museum', name: 'Эрмитаж', distanceMeters: 100, osmId: 'w2' })],
      undefined,
      { locale: 'ru' },
    );
    expect(card.nearbyLabel).toBe('(рядом: Эрмитаж)');
    expect(card.nearby?.kind).toBe('museum');
  });

  it('landmark дальше 150 м игнорируется', () => {
    const card = buildPlaceCard(
      primary,
      [geo({ kind: 'museum', name: 'Эрмитаж', distanceMeters: 151, osmId: 'w2' })],
      undefined,
      { locale: 'ru' },
    );
    expect(card.nearbyLabel).toBeUndefined();
  });

  it('не энричим тем же объектом (тот же osmId / то же имя)', () => {
    const same = buildPlaceCard(
      geo({ ...primary, osmId: 'w1' }),
      [geo({ kind: 'museum', name: 'Эрмитаж', distanceMeters: 100, osmId: 'w1' })],
      undefined,
      { locale: 'ru' },
    );
    expect(same.nearbyLabel).toBeUndefined();

    const sameName = buildPlaceCard(
      geo({ ...primary, name: 'Эрмитаж', osmId: 'w1' }),
      [geo({ kind: 'museum', name: 'Эрмитаж', distanceMeters: 100, osmId: 'w2' })],
      undefined,
      { locale: 'ru' },
    );
    expect(sameName.nearbyLabel).toBeUndefined();
  });

  it('не энричим другой город, если город известен обоим', () => {
    const card = buildPlaceCard(
      primary,
      [
        geo({
          kind: 'museum',
          name: 'Краеведческий музей',
          distanceMeters: 60,
          osmId: 'w3',
          tags: { 'addr:city': 'Пушкин' },
        }),
      ],
      undefined,
      { locale: 'ru' },
    );
    expect(card.nearbyLabel).toBeUndefined();
  });

  it('не энричим не-landmark (кафе дорогой не считается)', () => {
    const card = buildPlaceCard(
      primary,
      [geo({ kind: 'cafe', name: 'Кофейня', distanceMeters: 20, osmId: 'w4' })],
      undefined,
      { locale: 'ru' },
    );
    expect(card.nearbyLabel).toBeUndefined();
  });

  it('из двух landmark-ов берём ближайший', () => {
    const card = buildPlaceCard(
      primary,
      [
        geo({ kind: 'museum', name: 'Эрмитаж', distanceMeters: 120, osmId: 'w2' }),
        geo({ kind: 'monument', name: 'Памятник Пушкину', distanceMeters: 40, osmId: 'w5' }),
      ],
      undefined,
      { locale: 'ru' },
    );
    expect(card.nearbyLabel).toBe('(рядом: Памятник Пушкину)');
  });
});

describe('buildPlaceCard — часы работы', () => {
  it('парсится из тегов и оценивается в переданной таймзоне', () => {
    const card = buildPlaceCard(
      geo({ kind: 'cafe', name: 'Кофейня «Зима»', distanceMeters: 5, tags: { opening_hours: 'Mo-Fr 09:00-18:00' } }),
      [],
      undefined,
      { locale: 'ru', timeZone: 'UTC', at: MON_NOON },
    );
    expect(card.openState).toBe('open');
  });

  it('без таймзоны — unknown, не closed', () => {
    const card = buildPlaceCard(
      geo({ kind: 'cafe', name: 'Кофейня «Зима»', distanceMeters: 5, tags: { opening_hours: 'Mo-Fr 09:00-18:00' } }),
      [],
      undefined,
      { locale: 'ru', at: MON_NOON },
    );
    expect(card.openState).toBe('unknown');
  });

  it('непарсируемые часы — unknown', () => {
    const card = buildPlaceCard(
      geo({ kind: 'cafe', name: 'Кофейня «Зима»', distanceMeters: 5, tags: { opening_hours: 'PH off' } }),
      [],
      undefined,
      { locale: 'ru', timeZone: 'UTC', at: MON_NOON },
    );
    expect(card.openState).toBe('unknown');
  });

  it('нет тегов часов — unknown', () => {
    const card = buildPlaceCard(
      geo({ kind: 'cafe', name: 'Кофейня «Зима»', distanceMeters: 5 }),
      [],
      undefined,
      { locale: 'ru', timeZone: 'UTC', at: MON_NOON },
    );
    expect(card.openState).toBe('unknown');
  });
});
