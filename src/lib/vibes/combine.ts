// src/lib/vibes/combine.ts
// Связка архетипа с погодой и временем суток (docs/vibes.md §8).
// Возвращает НОВЫЙ профиль, вход не мутируется; правила аддитивны и капятся.

import type { CategoryId } from '@/constants/categories';
import {
  EVENING,
  INDOOR_CATEGORIES,
  OUTDOOR_CATEGORIES,
  type Archetype,
} from '@/lib/vibes/archetypes';
import { HEAT_TEMP_C, type WeatherContext } from '@/lib/weather';

export type Adjustment = 'rain-indoor' | 'heat-shade' | 'dark-evening' | 'cold-indoor';

/** Архетип после контекстных поправок + список сработавших правил. */
export interface AdjustedProfile extends Archetype {
  adjustments: Adjustment[];
}

/** rain-indoor: дождь — сильнейший модификатор, меняет саму возможность остановки. */
export const RAIN_INDOOR_BIAS_BOOST = 0.25;
export const RAIN_INDOOR_WEIGHT_BOOST = 0.15;
export const RAIN_OUTDOOR_WEIGHT_CUT = 0.2;
/** heat-shade: жара неприятна, но улицу не отменяет — слабее дождя. Порог — HEAT_TEMP_C из lib/weather. */
export const HEAT_SHADE_BOOST = 0.3;
export const HEAT_PARK_WEIGHT_BOOST = 0.15;
/** dark-evening: тьма подмешивает 25% вечернего профиля, не переписывая выбор. */
export const EVENING_BLEND = 0.25;

/** Часовой fallback тьмы, когда погоды нет: грубо, но честно и без зависимостей. */
export function isDarkHour(now: Date, hour: number = now.getHours()): boolean {
  return hour < 7 || hour >= 19;
}

/** cold-indoor: холодный сезон — крытое приятнее, улица короче. */
export const COLD_INDOOR_BIAS_BOOST = 0.1;
export const COLD_INDOOR_WEIGHT_BOOST = 0.1;
export const COLD_OUTDOOR_WEIGHT_CUT = 0.1;
/** Ниже этой температуры холодное правило работает даже вне календарной зимы. */
export const COLD_TEMP_C = 5;
/** Уличные стоянки в холод режутся на четверть — гулять по морозу дольше неприятно. */
export const COLD_STAY_FACTOR = 0.75;
/** Пол стоянки в холод, минут. */
export const COLD_STAY_FLOOR_MIN = 5;

/** Календарная зима северного полушария (продукт RU-first): декабрь–февраль. */
export function isColdMonth(month: number): boolean {
  return month === 11 || month === 0 || month === 1;
}

/** Крытые категории, которым холод в плюс (сидеть можно и в мороз, но внутри). */
const COLD_INDOOR_CATEGORIES: CategoryId[] = ['museum', 'cinema', 'shopping', 'cafe'];
/** Уличные категории, которым холод в минус. */
const COLD_OUTDOOR_CATEGORIES: CategoryId[] = ['park', 'viewpoint'];

/** Условие cold-indoor: календарная зима без тёплой погоды либо мороз в любой месяц. */
export function isColdContext(month: number, tempC: number | null): boolean {
  if (tempC !== null) return tempC < COLD_TEMP_C;
  return isColdMonth(month);
}

/** Часовые/сезонные контексты юзера, посчитанные в lib/vibes/localHour.ts. */
export interface ContextHour {
  /** Час 0..23 в таймзоне юзера — для fallback тьмы. */
  hour?: number;
  /** Месяц 0..11 в таймзоне юзера — для cold-indoor. */
  month?: number;
}

/**
 * Скорректированный профиль: дождь → крытое, жара >27 °C → тень и зелень,
 * тьма → 25% бленд к вечернему профилю, холод → крытое и короче.
 * Погода null → часовой/сезонный fallback. Час и месяц юзера — opts
 * (lib/vibes/localHour.ts): серверные now.getHours()/getMonth() врут клиенту
 * на разницу поясов (docs/vibes.md §8).
 */
export function combineContext(
  archetype: Archetype,
  weather: WeatherContext | null,
  now: Date,
  opts?: ContextHour,
): AdjustedProfile {
  const categoryWeights: Record<CategoryId, number> = { ...archetype.categoryWeights };
  let indoorBias = archetype.indoorBias;
  let shadePriority = archetype.shadePriority;
  const adjustments: Adjustment[] = [];

  if (weather && (weather.isRaining || weather.precipNext2h)) {
    indoorBias = Math.min(1, indoorBias + RAIN_INDOOR_BIAS_BOOST);
    for (const c of INDOOR_CATEGORIES) {
      categoryWeights[c] = Math.min(1, categoryWeights[c] + RAIN_INDOOR_WEIGHT_BOOST);
    }
    for (const c of OUTDOOR_CATEGORIES) {
      categoryWeights[c] = Math.max(0, categoryWeights[c] - RAIN_OUTDOOR_WEIGHT_CUT);
    }
    adjustments.push('rain-indoor');
  }

  if (weather && weather.tempC > HEAT_TEMP_C) {
    shadePriority = Math.min(1, shadePriority + HEAT_SHADE_BOOST);
    categoryWeights.park = Math.min(1, categoryWeights.park + HEAT_PARK_WEIGHT_BOOST);
    adjustments.push('heat-shade');
  }

  const dark = weather ? weather.isDark : isDarkHour(now, opts?.hour);
  if (dark) {
    for (const c of Object.keys(categoryWeights) as CategoryId[]) {
      categoryWeights[c] = categoryWeights[c]
        + (EVENING.categoryWeights[c] - categoryWeights[c]) * EVENING_BLEND;
    }
    adjustments.push('dark-evening');
  }

  // cold-indoor: календарная зима без тёплой погоды либо мороз. Крытым — плюс,
  // уличным — минус; слабее дождя (тот меняет саму возможность остановки).
  if (isColdContext(opts?.month ?? now.getMonth(), weather ? weather.tempC : null)) {
    indoorBias = Math.min(1, indoorBias + COLD_INDOOR_BIAS_BOOST);
    for (const c of COLD_INDOOR_CATEGORIES) {
      categoryWeights[c] = Math.min(1, categoryWeights[c] + COLD_INDOOR_WEIGHT_BOOST);
    }
    for (const c of COLD_OUTDOOR_CATEGORIES) {
      categoryWeights[c] = Math.max(0, categoryWeights[c] - COLD_OUTDOOR_WEIGHT_CUT);
    }
    adjustments.push('cold-indoor');
  }

  return { ...archetype, categoryWeights, indoorBias, shadePriority, adjustments };
}

/**
 * Стоянки под холод: уличные категории короче на четверть (пол 5 минут),
 * крытые не трогаем. Вызывается рядом с combineContext — тем же условием
 * isColdContext, чтобы веса и стоянки не разъехались.
 */
export function seasonalStayMinutes(
  stayMinutes: Record<CategoryId, number>,
  month: number,
  tempC: number | null,
): Record<CategoryId, number> {
  if (!isColdContext(month, tempC)) return stayMinutes;
  const adjusted = { ...stayMinutes };
  for (const c of COLD_OUTDOOR_CATEGORIES) {
    adjusted[c] = Math.max(COLD_STAY_FLOOR_MIN, Math.round(adjusted[c] * COLD_STAY_FACTOR));
  }
  return adjusted;
}
