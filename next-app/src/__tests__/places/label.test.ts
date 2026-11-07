import { describe, expect, it } from 'vitest';

import type { ReverseGeocodeResult } from '@/lib/geo/types';

import {
  composeAddress,
  dedupeKindLabel,
  formatDistance,
  formatNearbySuffix,
  localizedName,
} from '@/lib/places/label';

const geo = (over: Partial<ReverseGeocodeResult>): ReverseGeocodeResult => ({ ...over });

describe('localizedName', () => {
  it('предпочитает name:<locale>', () => {
    const r = geo({ name: 'Pushkin Monument', tags: { 'name:ru': 'Памятник Пушкину' } });
    expect(localizedName(r, 'ru')).toBe('Памятник Пушкину');
    expect(localizedName(r, 'en')).toBe('Pushkin Monument');
  });

  it('падает на name без тегов', () => {
    expect(localizedName(geo({ name: 'Эрмитаж' }), 'ru')).toBe('Эрмитаж');
    expect(localizedName(geo({ name: 'Эрмитаж' }), 'en')).toBe('Эрмитаж');
  });

  it('пустое имя — пустая строка', () => {
    expect(localizedName(geo({}), 'ru')).toBe('');
    expect(localizedName(geo({ name: '   ' }), 'en')).toBe('');
  });
});

describe('dedupeKindLabel', () => {
  it('убирает kind-слово, если имя с него начинается', () => {
    expect(dedupeKindLabel('Памятник', 'Памятник Пушкину')).toBe('');
    expect(dedupeKindLabel('Памятник', 'памятник Пушкину')).toBe('');
    expect(dedupeKindLabel('Кафе', 'Кафе «Зима»')).toBe('');
  });

  it('оставляет подпись, если имя не пересекается', () => {
    expect(dedupeKindLabel('Музей', 'Эрмитаж')).toBe('Музей');
    expect(dedupeKindLabel('Мемориал', 'Памятник Пушкину')).toBe('Мемориал');
  });

  it('многословные kind-подписи сравниваются целиком', () => {
    expect(dedupeKindLabel('Торговый центр', 'Торговый центр «Атриум»')).toBe('');
    expect(dedupeKindLabel('Смотровая площадка', 'Смотровая площадка «Восток»')).toBe('');
    expect(dedupeKindLabel('Торговый центр', 'Центральный рынок')).toBe('Торговый центр');
  });

  it('полное совпадение имени и подписи — дубликат', () => {
    expect(dedupeKindLabel('Эрмитаж', 'Эрмитаж')).toBe('');
  });

  it('ё/е и пунктуация не мешают сравнению', () => {
    expect(dedupeKindLabel('Кофейня', 'Кофейня-кондитерская')).toBe('');
    expect(dedupeKindLabel('Парковка', 'Парковка у входа')).toBe('');
    expect(dedupeKindLabel('Парковка', 'У парковки ТЦ')).toBe('Парковка'); // kind-слово не в начале
  });

  it('пустые аргументы', () => {
    expect(dedupeKindLabel('', 'Памятник Пушкину')).toBe('');
    expect(dedupeKindLabel('Дом', '')).toBe('Дом');
  });
});

describe('formatDistance', () => {
  it('метры до километра', () => {
    expect(formatDistance(350, 'ru')).toBe('350 м');
    expect(formatDistance(350, 'en')).toBe('350 m');
    expect(formatDistance(0, 'ru')).toBe('0 м');
  });

  it('округление метров', () => {
    expect(formatDistance(999.4, 'ru')).toBe('999 м');
  });

  it('километры с одним знаком', () => {
    expect(formatDistance(1000, 'ru')).toBe('1,0 км');
    expect(formatDistance(1234, 'ru')).toBe('1,2 км');
    expect(formatDistance(1234, 'en')).toBe('1.2 km');
  });

  it('мусор на входе — прочерк', () => {
    expect(formatDistance(Number.NaN, 'ru')).toBe('—');
    expect(formatDistance(-5, 'en')).toBe('—');
  });
});

describe('formatNearbySuffix', () => {
  it('шаблоны по локалям', () => {
    expect(formatNearbySuffix('Эрмитаж', 'ru')).toBe('(рядом: Эрмитаж)');
    expect(formatNearbySuffix('Hermitage', 'en')).toBe('(near Hermitage)');
  });

  it('пустое имя — пустой суффикс', () => {
    expect(formatNearbySuffix('', 'ru')).toBe('');
    expect(formatNearbySuffix('  ', 'en')).toBe('');
  });
});

describe('composeAddress', () => {
  it('готовый адрес приоритетнее тегов', () => {
    const r = geo({ address: 'Невский пр., 1', tags: { 'addr:street': 'Тверская', 'addr:housenumber': '7' } });
    expect(composeAddress(r)).toBe('Невский пр., 1');
  });

  it('собирает адрес из addr:street + addr:housenumber', () => {
    expect(composeAddress(geo({ tags: { 'addr:street': 'Тверская', 'addr:housenumber': '7' } }))).toBe('Тверская, 7');
  });

  it('только улица', () => {
    expect(composeAddress(geo({ tags: { 'addr:street': 'Тверская' } }))).toBe('Тверская');
  });

  it('без адреса — undefined', () => {
    expect(composeAddress(geo({}))).toBeUndefined();
    expect(composeAddress(geo({ address: '  ' }))).toBeUndefined();
  });
});
