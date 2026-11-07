import { describe, it, expect } from 'vitest';
import { GREEN, COFFEE, EVENING } from '@/lib/vibes/archetypes';
import {
  combineContext,
  isDarkHour,
  RAIN_INDOOR_BIAS_BOOST,
  RAIN_INDOOR_WEIGHT_BOOST,
  RAIN_OUTDOOR_WEIGHT_CUT,
  HEAT_SHADE_BOOST,
  HEAT_PARK_WEIGHT_BOOST,
  EVENING_BLEND,
} from '@/lib/vibes/combine';
import type { WeatherContext } from '@/lib/weather';

function weather(overrides: Partial<WeatherContext> = {}): WeatherContext {
  return { tempC: 15, isRaining: false, precipNext2h: false, isDark: false, ...overrides };
}

const NOON = new Date(2026, 10, 8, 12, 0);
const NIGHT = new Date(2026, 10, 8, 21, 0);

describe('isDarkHour (fallback без погоды)', () => {
  it('темно до 7 и после 19', () => {
    expect(isDarkHour(new Date(2026, 10, 8, 6, 59))).toBe(true);
    expect(isDarkHour(new Date(2026, 10, 8, 7, 0))).toBe(false);
    expect(isDarkHour(new Date(2026, 10, 8, 18, 59))).toBe(false);
    expect(isDarkHour(new Date(2026, 10, 8, 19, 0))).toBe(true);
  });
});

describe('combineContext — rain-indoor', () => {
  it('дождь поднимает indoorBias и крытые категории, режет уличные', () => {
    const before = { ...GREEN.categoryWeights };
    const adjusted = combineContext(GREEN, weather({ isRaining: true }), NOON);

    expect(adjusted.adjustments).toContain('rain-indoor');
    expect(adjusted.indoorBias).toBeCloseTo(GREEN.indoorBias + RAIN_INDOOR_BIAS_BOOST);
    expect(adjusted.categoryWeights.museum).toBeCloseTo(before.museum + RAIN_INDOOR_WEIGHT_BOOST);
    expect(adjusted.categoryWeights.park).toBeCloseTo(before.park - RAIN_OUTDOOR_WEIGHT_CUT);
    expect(adjusted.categoryWeights.viewpoint).toBeCloseTo(before.viewpoint - RAIN_OUTDOOR_WEIGHT_CUT);
  });

  it('precipNext2h тоже включает правило дождя', () => {
    const adjusted = combineContext(COFFEE, weather({ isRaining: false, precipNext2h: true }), NOON);
    expect(adjusted.adjustments).toContain('rain-indoor');
  });

  it('caps: indoorBias не выше 1, веса в [0,1] даже у уже крытых архетипов', () => {
    const adjusted = combineContext(COFFEE, weather({ isRaining: true }), NOON);
    expect(adjusted.indoorBias).toBeLessThanOrEqual(1);
    for (const w of Object.values(adjusted.categoryWeights)) {
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(1);
    }
  });
});

describe('combineContext — heat-shade', () => {
  it('жара >27 °C поднимает shadePriority и зелень', () => {
    const adjusted = combineContext(COFFEE, weather({ tempC: 30 }), NOON);
    expect(adjusted.adjustments).toContain('heat-shade');
    expect(adjusted.shadePriority).toBeCloseTo(COFFEE.shadePriority + HEAT_SHADE_BOOST);
    expect(adjusted.categoryWeights.park).toBeCloseTo(COFFEE.categoryWeights.park + HEAT_PARK_WEIGHT_BOOST);
  });

  it('ровно 27 °C — ещё не жара (строгое неравенство)', () => {
    const adjusted = combineContext(COFFEE, weather({ tempC: 27 }), NOON);
    expect(adjusted.adjustments).not.toContain('heat-shade');
  });

  it('shadePriority капится на 1', () => {
    const adjusted = combineContext(GREEN, weather({ tempC: 30 }), NOON);
    expect(adjusted.shadePriority).toBeCloseTo(1);
  });
});

describe('combineContext — dark-evening', () => {
  it('тьма от погоды подмешивает 25% вечернего профиля', () => {
    const adjusted = combineContext(GREEN, weather({ isDark: true }), NOON);
    expect(adjusted.adjustments).toContain('dark-evening');
    expect(adjusted.categoryWeights.bar)
      .toBeCloseTo(GREEN.categoryWeights.bar + (EVENING.categoryWeights.bar - GREEN.categoryWeights.bar) * EVENING_BLEND);
    expect(adjusted.categoryWeights.bar).toBeCloseTo(0.4);
    expect(adjusted.categoryWeights.park).toBeCloseTo(0.8); // 1.0 + (0.2−1.0)·0.25
  });

  it('без погоды тьма берётся из часов (fallback)', () => {
    const atNight = combineContext(GREEN, null, NIGHT);
    expect(atNight.adjustments).toContain('dark-evening');

    const atNoon = combineContext(GREEN, null, NOON);
    expect(atNoon.adjustments).toEqual([]);
    expect(atNoon.categoryWeights).toEqual(GREEN.categoryWeights);
    expect(atNoon.indoorBias).toBe(GREEN.indoorBias);
    expect(atNoon.shadePriority).toBe(GREEN.shadePriority);
  });
});

describe('combineContext — прочее', () => {
  it('правила стекают: ливень при +30 даёт и дождь, и жару, и тьму', () => {
    const adjusted = combineContext(GREEN, weather({ tempC: 30, isRaining: true, isDark: true }), NOON);
    expect(adjusted.adjustments).toEqual(['rain-indoor', 'heat-shade', 'dark-evening']);
    for (const w of Object.values(adjusted.categoryWeights)) {
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(1);
    }
  });

  it('погода null днём — профиль не меняется вообще', () => {
    const adjusted = combineContext(GREEN, null, NOON);
    expect(adjusted.adjustments).toEqual([]);
  });

  it('вход не мутируется', () => {
    const snapshot = JSON.stringify(GREEN);
    combineContext(GREEN, weather({ tempC: 30, isRaining: true, isDark: true }), NIGHT);
    expect(JSON.stringify(GREEN)).toBe(snapshot);
  });

  it('прочие поля архетипа сохраняются', () => {
    const adjusted = combineContext(EVENING, null, NOON);
    expect(adjusted.id).toBe('evening');
    expect(adjusted.labelRu).toBe(EVENING.labelRu);
    expect(adjusted.hourAffinity).toBe(EVENING.hourAffinity);
    expect(adjusted.stayMinutes).toEqual(EVENING.stayMinutes);
  });
});
