// Тесты userLocalHour (lib/vibes/localHour.ts): час юзера против серверного,
// полночь (h23, не «24»), незнакомая зона → деградация в серверный час.
// Моменты фиксируются в UTC — от таймзоны машины, где гоняются тесты, не зависит.
import { describe, expect, it } from 'vitest';

import { combineContext, isDarkHour } from '@/lib/vibes/combine';
import { userLocalHour } from '@/lib/vibes/localHour';
import { getArchetype } from '@/lib/vibes/archetypes';

describe('userLocalHour', () => {
  it('18:00 UTC — это 21 в Москве', () => {
    expect(userLocalHour(new Date('2026-11-10T18:00:00Z'), 'Europe/Moscow')).toBe(21);
  });

  it('18:00 UTC — это 13 в Нью-Йорке (ноябрь, EST после перевода часов)', () => {
    expect(userLocalHour(new Date('2026-11-10T18:00:00Z'), 'America/New_York')).toBe(13);
  });

  it('полночь — 0, а не «24» (hourCycle h23)', () => {
    // 2026-11-10T21:00Z = 00:00 следующего дня в Москве.
    expect(userLocalHour(new Date('2026-11-10T21:00:00Z'), 'Europe/Moscow')).toBe(0);
  });

  it('незнакомая зона — деградация в серверный час', () => {
    const now = new Date('2026-11-10T18:00:00Z');
    expect(userLocalHour(now, 'Not/AZone')).toBe(now.getHours());
  });

  it('без зоны — серверный час', () => {
    const now = new Date('2026-11-10T18:00:00Z');
    expect(userLocalHour(now)).toBe(now.getHours());
  });
});

describe('isDarkHour (часовой fallback тьмы)', () => {
  const now = new Date('2026-11-10T12:00:00Z');

  it('границы: 6 — тьма, 7 — свет, 19 — тьма', () => {
    expect(isDarkHour(now, 6)).toBe(true);
    expect(isDarkHour(now, 7)).toBe(false);
    expect(isDarkHour(now, 19)).toBe(true);
  });

  it('без явного часа — серверный час', () => {
    expect(isDarkHour(now)).toBe(isDarkHour(now, now.getHours()));
  });
});

describe('combineContext с часом юзера', () => {
  const now = new Date('2026-11-10T18:00:00Z'); // сервер «вечер» не знает

  it('без погоды час 21 юзера включает dark-evening', () => {
    const profile = combineContext(getArchetype('green'), null, now, { hour: 21 });
    expect(profile.adjustments).toContain('dark-evening');
  });

  it('без погоды час 12 юзера не включает dark-evening', () => {
    const profile = combineContext(getArchetype('green'), null, now, { hour: 12 });
    expect(profile.adjustments).not.toContain('dark-evening');
  });
});
