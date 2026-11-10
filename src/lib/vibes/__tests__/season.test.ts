// Тесты сезонного контекста (docs/vibes.md §8, правило cold-indoor):
// календарная зима + холод/погода-null → крытое в плюс, улица в минус,
// уличные стоянки короче. Тёплая погода зимой отменяет правило.
import { describe, expect, it } from 'vitest';

import type { CategoryId } from '@/constants/categories';
import { getArchetype } from '@/lib/vibes/archetypes';
import {
  combineContext,
  isColdContext,
  isColdMonth,
  seasonalStayMinutes,
} from '@/lib/vibes/combine';
import type { WeatherContext } from '@/lib/weather';

const NOW = new Date('2026-11-10T12:00:00Z'); // момент не важен: месяц передаём явно

function weather(tempC: number): WeatherContext {
  return { tempC, isRaining: false, precipNext2h: false, isDark: false };
}

const stay: Record<CategoryId, number> = {
  cafe: 30,
  restaurant: 35,
  park: 30,
  museum: 60,
  attraction: 15,
  bar: 30,
  cinema: 120,
  shopping: 40,
  viewpoint: 20,
};

describe('isColdMonth / isColdContext', () => {
  it('календарная зима: декабрь–февраль', () => {
    expect(isColdMonth(11)).toBe(true);
    expect(isColdMonth(0)).toBe(true);
    expect(isColdMonth(1)).toBe(true);
    expect(isColdMonth(2)).toBe(false);
    expect(isColdMonth(10)).toBe(false);
  });

  it('погода знает лучше календаря: мороз в июле — холод, плюс 8 в декабре — нет', () => {
    expect(isColdContext(6, -5)).toBe(true);
    expect(isColdContext(11, 8)).toBe(false);
    expect(isColdContext(0, 4)).toBe(true);
  });

  it('погоды нет — календарная эвристика', () => {
    expect(isColdContext(0, null)).toBe(true);
    expect(isColdContext(6, null)).toBe(false);
  });
});

describe('combineContext: cold-indoor', () => {
  it('январь без погоды: крытым +0.10, уличным −0.10, bias +0.10', () => {
    const green = getArchetype('green');
    const summer = combineContext(green, null, NOW, { month: 6 });
    const winter = combineContext(green, null, NOW, { month: 0 });
    expect(winter.adjustments).toContain('cold-indoor');
    expect(summer.adjustments).not.toContain('cold-indoor');
    expect(winter.indoorBias).toBeCloseTo(summer.indoorBias + 0.1, 5);
    expect(winter.categoryWeights.museum).toBeCloseTo(summer.categoryWeights.museum + 0.1, 5);
    expect(winter.categoryWeights.park).toBeCloseTo(summer.categoryWeights.park - 0.1, 5);
  });

  it('тёплая зима (+8 °C) — правило не срабатывает', () => {
    const profile = combineContext(getArchetype('green'), weather(8), NOW, { month: 0 });
    expect(profile.adjustments).not.toContain('cold-indoor');
  });

  it('мороз в тёплый месяц — срабатывает', () => {
    const profile = combineContext(getArchetype('green'), weather(-10), NOW, { month: 6 });
    expect(profile.adjustments).toContain('cold-indoor');
  });

  it('правила стекают: морозный тёмный дождливый вечер даёт все три', () => {
    // При живой погоде dark-evening идёт от isDark (Open-Meteo по координатам),
    // час юзера — только fallback, когда погоды нет (docs/vibes.md §8).
    const w = weather(-10);
    w.isRaining = true;
    w.isDark = true;
    const profile = combineContext(getArchetype('green'), w, NOW, { month: 0, hour: 21 });
    expect(profile.adjustments).toEqual(expect.arrayContaining(['rain-indoor', 'dark-evening', 'cold-indoor']));
  });
});

describe('seasonalStayMinutes', () => {
  it('холод: уличные ×0.75 с полом 5 минут, крытые не тронуты', () => {
    const cold = seasonalStayMinutes(stay, 0, null);
    expect(cold.park).toBe(23); // round(30 · 0.75) = 23
    expect(cold.viewpoint).toBe(15);
    expect(cold.museum).toBe(60);
    expect(cold.cafe).toBe(30);
  });

  it('пол 5 минут: короткая стоянка не уходит в ноль', () => {
    const short: Record<CategoryId, number> = { ...stay, park: 6 };
    expect(seasonalStayMinutes(short, 0, null).park).toBe(5);
  });

  it('не холод — вход возвращается как есть', () => {
    expect(seasonalStayMinutes(stay, 6, 25)).toBe(stay);
  });
});
