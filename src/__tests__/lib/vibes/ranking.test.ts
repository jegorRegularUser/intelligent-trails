import { describe, it, expect } from 'vitest';
import type { GeoPlace } from '@/lib/geo/types';
import { GREEN, COFFEE, RAINY } from '@/lib/vibes/archetypes';
import {
  scorePlace,
  selectDiverseAlternatives,
  localProject,
  baseQuality,
  type ScoredCandidate,
} from '@/lib/vibes/ranking';
import type { WeatherContext } from '@/lib/weather';

function makePlace(overrides: Partial<GeoPlace> = {}): GeoPlace {
  return {
    id: 'p1',
    name: 'Тестовое место',
    category: 'cafe',
    coordinates: [55.75, 37.62],
    ...overrides,
  };
}

function weather(overrides: Partial<WeatherContext> = {}): WeatherContext {
  return { tempC: 15, isRaining: false, precipNext2h: false, isDark: false, ...overrides };
}

describe('baseQuality', () => {
  it('место без рейтинга и тегов — база 0.5', () => {
    expect(baseQuality(makePlace())).toBeCloseTo(0.5);
  });

  it('рейтинг даёт до +0.30', () => {
    expect(baseQuality(makePlace({ rating: 5 }))).toBeCloseTo(0.8);
    expect(baseQuality(makePlace({ rating: 0 }))).toBeCloseTo(0.5);
  });

  it('прокси популярности по тегам с капом 0.20', () => {
    const all = makePlace({ tags: { wikipedia: 'ru:Test', website: 'x', phone: 'y', opening_hours: '24/7' } });
    expect(baseQuality(all)).toBeCloseTo(0.7); // 0.5 + min(0.08+0.05+0.03+0.04, 0.20)
  });

  it('size-бонус только у парков и только по явной площади', () => {
    expect(baseQuality(makePlace({ category: 'park', tags: { area: '10000' } }))).toBeCloseTo(0.7);
    expect(baseQuality(makePlace({ category: 'park', tags: { area: '100' } }))).toBeCloseTo(0.6);
    expect(baseQuality(makePlace({ category: 'park' }))).toBeCloseTo(0.5);
    expect(baseQuality(makePlace({ category: 'cafe', tags: { area: '10000' } }))).toBeCloseTo(0.5);
  });

  it('итог зажат в [0,1]', () => {
    const max = makePlace({
      rating: 5,
      category: 'park',
      tags: { wikipedia: 'x', website: 'x', phone: 'x', opening_hours: 'x', area: '10000000' },
    });
    expect(baseQuality(max)).toBeLessThanOrEqual(1);
  });
});

describe('scorePlace', () => {
  it('вес архетипа мультипликативен: парк в green сильно выше, чем в rainy', () => {
    const park = makePlace({ category: 'park', name: 'Парк' });
    const green = scorePlace(park, { archetype: GREEN });
    const rainy = scorePlace(park, { archetype: RAINY });
    expect(green.score).toBeGreaterThan(0.5);
    expect(rainy.score).toBeLessThan(0.05);
    expect(green.score).toBeGreaterThan(rainy.score);
  });

  it('неизвестная категория получает нейтральный вес 0.3', () => {
    const weird = makePlace({ category: 'fountain' });
    const s = scorePlace(weird, { archetype: GREEN });
    // base 0.5 · w 0.3 + outdoor match (0.95 → +0.09) = 0.24
    expect(s.score).toBeCloseTo(0.24, 5);
  });

  it('качество двигает места внутри архетипа', () => {
    const good = makePlace({ rating: 5, tags: { website: 'x' } });
    const plain = makePlace();
    expect(scorePlace(good, { archetype: COFFEE }).score)
      .toBeGreaterThan(scorePlace(plain, { archetype: COFFEE }).score);
  });

  it('бонус «открыто сейчас» — инъекция hoursState', () => {
    const place = makePlace({ category: 'cafe' });
    const none = scorePlace(place, { archetype: COFFEE });
    const open = scorePlace(place, { archetype: COFFEE, hoursState: 'open' });
    const closed = scorePlace(place, { archetype: COFFEE, hoursState: 'closed' });
    expect(open.score).toBeCloseTo(none.score + 0.1, 5);
    expect(closed.score).toBeCloseTo(none.score - 0.15, 5);
    expect(closed.score).toBeGreaterThanOrEqual(0);
  });

  it('жара: парк +0.08, открытые места −0.04, крытые не трогаем', () => {
    const hot = weather({ tempC: 30 });
    const parkNone = scorePlace(makePlace({ category: 'park' }), { archetype: GREEN });
    const parkHot = scorePlace(makePlace({ category: 'park' }), { archetype: GREEN, weather: hot });
    expect(parkHot.score).toBeCloseTo(parkNone.score + 0.08, 5);

    const viewNone = scorePlace(makePlace({ category: 'viewpoint' }), { archetype: GREEN });
    const viewHot = scorePlace(makePlace({ category: 'viewpoint' }), { archetype: GREEN, weather: hot });
    expect(viewHot.score).toBeCloseTo(viewNone.score - 0.04, 5);

    const cafeNone = scorePlace(makePlace({ category: 'cafe' }), { archetype: COFFEE });
    const cafeHot = scorePlace(makePlace({ category: 'cafe' }), { archetype: COFFEE, weather: hot });
    expect(cafeHot.score).toBeCloseTo(cafeNone.score, 5);
  });

  it('тьма: живые места +0.06, парк и смотровая −0.06', () => {
    const night = weather({ isDark: true });
    const barNone = scorePlace(makePlace({ category: 'bar' }), { archetype: COFFEE });
    const barNight = scorePlace(makePlace({ category: 'bar' }), { archetype: COFFEE, weather: night });
    expect(barNight.score).toBeCloseTo(barNone.score + 0.06, 5);

    const parkNone = scorePlace(makePlace({ category: 'park' }), { archetype: GREEN });
    const parkNight = scorePlace(makePlace({ category: 'park' }), { archetype: GREEN, weather: night });
    expect(parkNight.score).toBeCloseTo(parkNone.score - 0.06, 5);
  });

  it('дождь без combine не считается дважды: hints только через indoorBias', () => {
    const place = makePlace({ category: 'cafe' });
    const none = scorePlace(place, { archetype: COFFEE });
    const raining = scorePlace(place, { archetype: COFFEE, weather: weather({ isRaining: true }) });
    expect(raining.score).toBeCloseTo(none.score, 5);
  });

  it('hour включает множитель hourAffinity и честную причину вне часов архетипа', () => {
    const park = makePlace({ category: 'park' });
    const withoutHour = scorePlace(park, { archetype: GREEN });
    const at20 = scorePlace(park, { archetype: GREEN, hour: 20 });
    const at23 = scorePlace(park, { archetype: GREEN, hour: 23 });
    expect(at20.score).toBeLessThan(withoutHour.score); // affinity(20)=0.625
    expect(at23.score).toBeLessThan(at20.score); // affinity(23)≈0.283
    expect(at23.reasonsRu).toContain('не лучшее время для этого вайба');
    expect(at23.reasonsEn).toContain('not the best time for this vibe');
  });

  it('reasons — параллельные непустые массивы с человекочитаемыми причинами', () => {
    const place = makePlace({
      category: 'park',
      rating: 4.8,
      tags: { wikipedia: 'ru:Парк' },
    });
    const s = scorePlace(place, {
      archetype: GREEN,
      hoursState: 'open',
      weather: weather({ tempC: 30 }),
    });
    expect(s.reasonsRu.length).toBe(s.reasonsEn.length);
    expect(s.reasonsRu.length).toBeGreaterThan(0);
    expect(s.reasonsRu).toContain('рейтинг 4.8 из 5');
    expect(s.reasonsRu).toContain('упоминается в Википедии');
    expect(s.reasonsRu).toContain('ядро вайба «Зелёная»');
    expect(s.reasonsRu).toContain('работает сейчас');
    expect(s.reasonsRu).toContain('даст тень и зелень в жару');
    expect(s.reasonsEn).toContain('core of the "Green" vibe');
  });

  it('закрытое место получает причину «сейчас закрыто»', () => {
    const s = scorePlace(makePlace(), { archetype: COFFEE, hoursState: 'closed' });
    expect(s.reasonsRu).toContain('сейчас закрыто');
    expect(s.reasonsEn).toContain('currently closed');
  });

  it('score всегда в [0,1]', () => {
    const worst = scorePlace(
      makePlace({ category: 'park' }),
      { archetype: RAINY, hoursState: 'closed', weather: weather({ isDark: true, tempC: 30 }) },
    );
    expect(worst.score).toBeGreaterThanOrEqual(0);
    const best = scorePlace(
      makePlace({ category: 'cafe', rating: 5, tags: { wikipedia: 'x', website: 'x', phone: 'x', opening_hours: 'x' } }),
      { archetype: COFFEE, hoursState: 'open', weather: weather({ isDark: true }) },
    );
    expect(best.score).toBeLessThanOrEqual(1);
  });
});

describe('localProject (эквидистантная проекция)', () => {
  const origin: [number, number] = [55.75, 37.62];

  it('0.01° широты ≈ 1.11 км, 0.01° долготы сжаты на cos(широты)', () => {
    const north = localProject([55.76, 37.62], origin);
    const east = localProject([55.75, 37.63], origin);
    expect(north.y).toBeCloseTo(1111.95, 0); // 0.01° · 111.195 км/°
    // cos(55.75°) ≈ 0.5628 → восток почти вдвое короче севера при тех же градусах
    expect(Math.abs(east.x)).toBeCloseTo(1111.95 * Math.cos((55.75 * Math.PI) / 180), 0);
    expect(Math.abs(east.x)).toBeLessThan(Math.abs(north.y) * 0.7);
  });
});

describe('selectDiverseAlternatives', () => {
  const anchor: [number, number] = [55.75, 37.62];

  function candidate(id: string, category: string, lat: number, lng: number, score: number): ScoredCandidate {
    return { place: makePlace({ id, name: id, category, coordinates: [lat, lng] }), score };
  }

  it('пустой и одиночный вход проходят насквозь', () => {
    expect(selectDiverseAlternatives([], { anchor })).toEqual([]);
    const one = [candidate('a', 'cafe', 55.75, 37.62, 0.9)];
    expect(selectDiverseAlternatives(one, { anchor })).toEqual(one);
  });

  it('не мутирует вход', () => {
    const items = [
      candidate('a', 'cafe', 55.7501, 37.62, 0.9),
      candidate('b', 'cafe', 55.7502, 37.62, 0.8),
      candidate('c', 'park', 55.755, 37.62, 0.7),
    ];
    const copy = [...items];
    selectDiverseAlternatives(items, { anchor, maxResults: 3 });
    expect(items).toEqual(copy);
  });

  it('разные якоря вместо кучи одинаковых кафе', () => {
    // Кафе1 — лучшее (500 м на север); кафе2 — в 100 м от него;
    // парк (1 км) и смотровая (800 м на восток) разнообразнее.
    const items = [
      candidate('cafe1', 'cafe', 55.7545, 37.62, 0.9),
      candidate('cafe2', 'cafe', 55.7554, 37.62, 0.85),
      candidate('park1', 'park', 55.759, 37.62, 0.85),
      candidate('view1', 'viewpoint', 55.75, 37.63278, 0.8),
    ];
    const result = selectDiverseAlternatives(items, { anchor, maxResults: 3 });
    expect(result[0].place.id).toBe('cafe1');
    expect(result.map((r) => r.place.id).sort()).toEqual(['cafe1', 'park1', 'view1'].sort());
    expect(new Set(result.map((r) => r.place.category)).size).toBe(3);
  });

  it('одинаково ценные кандидаты: метрика в метрах выбирает реально более близкий', () => {
    // 0.01° к северу (~1112 м) и 0.01° к востоку (~628 м на этой широте):
    // сырые градусы сочли бы их равноудалёнными, проекция — нет.
    const items = [
      candidate('cafe1', 'cafe', 55.7500, 37.6200, 0.8),
      candidate('north', 'cafe', 55.7600, 37.6200, 0.5),
      candidate('east', 'cafe', 55.7500, 37.6300, 0.5),
    ];
    const result = selectDiverseAlternatives(items, { anchor, maxResults: 2, diversityRadius: 300 });
    expect(result[1].place.id).toBe('east');
  });

  it('кандидаты дальше maxAlternativeDistance не отбираются', () => {
    const items = [
      candidate('a', 'cafe', 55.7500, 37.6200, 0.9),
      candidate('far', 'park', 55.7800, 37.6200, 0.85), // ~3.3 км
    ];
    const result = selectDiverseAlternatives(items, { anchor, maxResults: 2, maxAlternativeDistance: 1500 });
    expect(result.map((r) => r.place.id)).toEqual(['a']);
  });

  it('повтор категории штрафуется при равной удалённости', () => {
    // Оба кандидата в ~556 м от первичного кафе: повтор категории (cafe)
    // проигрывает парку с тем же скором и тем же расстоянием.
    const items = [
      candidate('cafe1', 'cafe', 55.7500, 37.6200, 0.8),
      candidate('cafe2', 'cafe', 55.7550, 37.6200, 0.6),
      candidate('park2', 'park', 55.7550, 37.6200, 0.6),
    ];
    const result = selectDiverseAlternatives(items, { anchor, maxResults: 3 });
    expect(result[1].place.id).toBe('park2');
  });
});
