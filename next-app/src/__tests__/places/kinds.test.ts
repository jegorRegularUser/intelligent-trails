import { describe, expect, it } from 'vitest';

import {
  getKindInfo,
  isRoadKind,
  kindFromTags,
  LANDMARK_KINDS,
  PLACE_KINDS,
  UNKNOWN_KIND,
} from '@/lib/places/kinds';

describe('PLACE_KINDS — полнота словаря', () => {
  it('покрывает не меньше 40 kind-ов', () => {
    expect(Object.keys(PLACE_KINDS).length).toBeGreaterThanOrEqual(40);
  });

  it('обязанные по ТЗ kind-ы присутствуют', () => {
    for (const kind of [
      'cafe',
      'restaurant',
      'park',
      'museum',
      'memorial',
      'monument',
      'viewpoint',
      'fountain',
      'bridge',
      'mall',
      'cinema',
      'bar',
      'bakery',
      'pharmacy',
      'subway_station',
    ]) {
      expect(PLACE_KINDS[kind], `нет kind'а ${kind}`).toBeDefined();
    }
  });

  it('у каждой записи непустые ru/en и иконка', () => {
    for (const [kind, info] of Object.entries(PLACE_KINDS)) {
      expect(info.ru.trim(), `ru у ${kind}`).not.toBe('');
      expect(info.en.trim(), `en у ${kind}`).not.toBe('');
      expect(info.icon, `icon у ${kind}`).toBeTruthy();
    }
  });

  it('каждый landmark-kind имеет запись в словаре', () => {
    for (const kind of LANDMARK_KINDS) {
      expect(PLACE_KINDS[kind], `landmark ${kind} без лейбла`).toBeDefined();
    }
  });
});

describe('getKindInfo — деградация', () => {
  it('неизвестный и отсутствующий kind → нейтральная карточка', () => {
    expect(getKindInfo('alien_ship')).toBe(UNKNOWN_KIND);
    expect(getKindInfo(undefined)).toBe(UNKNOWN_KIND);
    expect(getKindInfo(null)).toBe(UNKNOWN_KIND);
    expect(UNKNOWN_KIND.ru).toBe('Место');
    expect(UNKNOWN_KIND.en).toBe('Place');
  });

  it('известный kind возвращает лейблы', () => {
    expect(getKindInfo('cafe').ru).toBe('Кафе');
    expect(getKindInfo('cafe').en).toBe('Café');
    expect(getKindInfo('subway_station').ru).toBe('Метро');
  });
});

describe('isRoadKind', () => {
  it('дороги и не-дороги', () => {
    expect(isRoadKind('street')).toBe(true);
    expect(isRoadKind('road')).toBe(true);
    expect(isRoadKind('footway')).toBe(true);
    expect(isRoadKind('residential')).toBe(true);
    expect(isRoadKind('living_street')).toBe(true);
    expect(isRoadKind('service')).toBe(true);
    expect(isRoadKind('cafe')).toBe(false);
    expect(isRoadKind(undefined)).toBe(false);
    expect(isRoadKind(null)).toBe(false);
  });
});

describe('kindFromTags — восстановление kind из тегов', () => {
  it('amenity/tourism/leisure/historic/shop', () => {
    expect(kindFromTags({ amenity: 'cafe' })).toBe('cafe');
    expect(kindFromTags({ tourism: 'museum' })).toBe('museum');
    expect(kindFromTags({ leisure: 'park' })).toBe('park');
    expect(kindFromTags({ historic: 'memorial' })).toBe('memorial');
    expect(kindFromTags({ shop: 'supermarket' })).toBe('supermarket');
    expect(kindFromTags({ shop: 'mall' })).toBe('mall');
  });

  it('транспорт', () => {
    expect(kindFromTags({ railway: 'station', station: 'subway' })).toBe('subway_station');
    expect(kindFromTags({ railway: 'station' })).toBe('train_station');
    expect(kindFromTags({ highway: 'bus_stop' })).toBe('bus_stop');
  });

  it('здание без остальных тегов — дом', () => {
    expect(kindFromTags({ building: 'yes' })).toBe('house');
  });

  it('пусто → undefined', () => {
    expect(kindFromTags(undefined)).toBeUndefined();
    expect(kindFromTags({})).toBeUndefined();
  });
});
