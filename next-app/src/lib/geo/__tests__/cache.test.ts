import { describe, it, expect } from 'vitest';
import { TtlLruCache, round5, roundPoint, pointKey } from '@/lib/geo/cache';

class ManualClock {
  private t = 1_700_000_000_000;
  readonly now = () => this.t;
  tick(ms: number): void {
    this.t += ms;
  }
}

describe('TtlLruCache', () => {
  it('отдаёт значение до истечения TTL и промахивается после', () => {
    const clock = new ManualClock();
    const cache = new TtlLruCache<string>({ maxEntries: 10, defaultTtlMs: 1000, now: clock.now });
    cache.set('k', 'v');

    clock.tick(999);
    expect(cache.get('k')).toBe('v');

    clock.tick(1); // ровно на границе TTL запись считается истёкшей
    expect(cache.get('k')).toBeUndefined();
  });

  it('уважает ttl, переданный в set', () => {
    const clock = new ManualClock();
    const cache = new TtlLruCache<string>({ maxEntries: 10, defaultTtlMs: 1000, now: clock.now });
    cache.set('short', 'v', 100);

    clock.tick(100);
    expect(cache.get('short')).toBeUndefined();
  });

  it('чтение обновляет recency: вытесняется самый старый по использованию', () => {
    const cache = new TtlLruCache<string>({ maxEntries: 2, defaultTtlMs: 60_000, now: new ManualClock().now });
    cache.set('a', '1');
    cache.set('b', '2');
    cache.get('a'); // «a» свежее, «b» — кандидат на вытеснение
    cache.set('c', '3');

    expect(cache.get('a')).toBe('1');
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBe('3');
  });

  it('перезапись ключа обновляет его позицию в LRU', () => {
    const cache = new TtlLruCache<string>({ maxEntries: 2, defaultTtlMs: 60_000, now: new ManualClock().now });
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('a', '1++'); // «a» снова свежая
    cache.set('c', '3');

    expect(cache.get('a')).toBe('1++');
    expect(cache.get('b')).toBeUndefined();
  });

  it('умеет кэшировать null как значение, отличая его от промаха', () => {
    const clock = new ManualClock();
    const cache = new TtlLruCache<string | null>({ maxEntries: 10, defaultTtlMs: 1000, now: clock.now });
    cache.set('empty', null, 100);

    expect(cache.get('empty')).toBeNull();
    clock.tick(100);
    expect(cache.get('empty')).toBeUndefined();
  });

  it('вытесняет при переполнении даже без чтений', () => {
    const cache = new TtlLruCache<number>({ maxEntries: 2, defaultTtlMs: 60_000, now: new ManualClock().now });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('c')).toBe(3);
  });
});

describe('ключи координат', () => {
  it('round5 округляет до 5 знаков (~1.1 м) и убирает −0', () => {
    expect(round5(55.75124378)).toBe(55.75124);
    expect(round5(55.751247)).toBe(55.75125);
    expect(round5(-0.000001)).toBe(0);
    expect(Object.is(round5(-0.000001), -0)).toBe(false);
  });

  it('roundPoint и pointKey дают стабильную строку', () => {
    expect(roundPoint([55.75124378, 37.6184234])).toEqual([55.75124, 37.61842]);
    expect(pointKey([55.75124378, 37.6184234])).toBe('55.75124,37.61842');
    // Соседние точки в пределах ~1 м схлопываются в один ключ кэша.
    expect(pointKey([55.75124, 37.61842])).toBe(pointKey([55.751243, 37.618424]));
  });
});
