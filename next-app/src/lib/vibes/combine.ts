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

export type Adjustment = 'rain-indoor' | 'heat-shade' | 'dark-evening';

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
export function isDarkHour(now: Date): boolean {
  const h = now.getHours();
  return h < 7 || h >= 19;
}

/**
 * Скорректированный профиль: дождь → крытое, жара >27 °C → тень и зелень,
 * тьма → 25% бленд к вечернему профилю. Погода null → только часовой fallback.
 */
export function combineContext(
  archetype: Archetype,
  weather: WeatherContext | null,
  now: Date,
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

  const dark = weather ? weather.isDark : isDarkHour(now);
  if (dark) {
    for (const c of Object.keys(categoryWeights) as CategoryId[]) {
      categoryWeights[c] = categoryWeights[c]
        + (EVENING.categoryWeights[c] - categoryWeights[c]) * EVENING_BLEND;
    }
    adjustments.push('dark-evening');
  }

  return { ...archetype, categoryWeights, indoorBias, shadePriority, adjustments };
}
