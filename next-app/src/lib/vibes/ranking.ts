// src/lib/vibes/ranking.ts
// Скоринг места под архетип и контекст (docs/vibes.md §1–2, §5, §7).
// Старый src/utils/placeRanking.ts не импортируется и не меняется: идеи
// перенесены, хардкасы (Пушкин/Кулибин) заменены честным прокси по тегам.

import type { GeoPlace, LatLng } from '@/lib/geo/types';
import { inferIndoor, type Archetype } from '@/lib/vibes/archetypes';
import { mapToHints, type WeatherContext } from '@/lib/weather';

// --- Константы скоринга (docs/vibes.md §2, §5) --------------------------------

/** База «ничего не знаем» — порт старого «базовый балл 50». */
const BASE_QUALITY = 0.5;
/** Вклад рейтинга (0..5) в базу. */
const RATING_WEIGHT = 0.3;
/** Вклады прокси популярности по OSM-тегам + кап группы. */
const TAG_NOTABLE = 0.08; // wikipedia / wikidata
const TAG_WEBSITE = 0.05;
const TAG_HOURS = 0.04; // opening_hours
const TAG_PHONE = 0.03;
const POPULARITY_CAP = 0.2;
/** Size-бонус парков: min(log10(area м²)·0.05, 0.20). */
const PARK_SIZE_PER_ORDER = 0.05;
const PARK_SIZE_CAP = 0.2;

/** Вес категории, которой нет в архетипе (PlaceCategory допускает любые строки). */
const UNKNOWN_CATEGORY_WEIGHT = 0.3;

/** Бонус соответствия indoor/outdoor: ±0.10·(2·match−1). */
const INDOOR_MATCH_RANGE = 0.1;
/** «Открыто сейчас»: инъекция часов работы. */
const OPEN_BONUS = 0.1;
const CLOSED_PENALTY = 0.15;

/** Погодные модификаторы. */
const SHADE_PARK_BONUS = 0.08;
const SHADE_EXPOSED_PENALTY = 0.04;
const LIGHTED_LIVE_BONUS = 0.06;
const LIGHTED_DARK_PENALTY = 0.06;

/** Порог рейтинга, начиная с которого он попадает в reasons. */
const REASON_RATING_MIN = 4.2;
/** Веса от 0.75 и выше считаем «ядром» архетипа для reasons. */
const CORE_WEIGHT_MIN = 0.75;

// --- Типы ----------------------------------------------------------------------

/**
 * Контекст скоринга. Структурный: hoursState/hour инъекцируются снаружи,
 * импортов из чужих зон нет. weather — из своей зоны lib/weather.
 */
export interface ScorePlaceContext {
  archetype: Archetype;
  /** Часы работы места — считает вызывающий (парсер opening_hours). */
  hoursState?: 'open' | 'closed' | 'unknown';
  /** Погода; null/undefined = деградация без погодных модификаторов. */
  weather?: WeatherContext | null;
  /** Текущий час 0..23 — включает множитель hourAffinity архетипа. */
  hour?: number;
}

export interface PlaceScore {
  score: number;
  reasonsRu: string[];
  reasonsEn: string[];
}

function clamp01(v: number): number {
  return Math.min(Math.max(v, 0), 1);
}

// --- Базовое качество (docs/vibes.md §2) ---------------------------------------

/** Прокси популярности по тегам: заметность/«живость» места, кап 0.20. */
function popularityProxy(tags: Record<string, string>): number {
  let sum = 0;
  if (tags.wikipedia || tags.wikidata) sum += TAG_NOTABLE;
  if (tags.website) sum += TAG_WEBSITE;
  if (tags.opening_hours) sum += TAG_HOURS;
  if (tags.phone) sum += TAG_PHONE;
  return Math.min(sum, POPULARITY_CAP);
}

/** Size-бонус парков только по явной площади из тегов; нет площади — нет бонуса. */
function parkSizeBonus(place: GeoPlace): number {
  if (place.category !== 'park') return 0;
  const area = Number(place.tags?.area);
  if (!Number.isFinite(area) || area <= 0) return 0;
  return Math.min(Math.log10(area) * PARK_SIZE_PER_ORDER, PARK_SIZE_CAP);
}

/** Базовое качество места, 0..1: база + рейтинг + теги + размер парка. */
export function baseQuality(place: GeoPlace): number {
  const tags = place.tags ?? {};
  let base = BASE_QUALITY;
  if (place.rating !== undefined) {
    base += (clamp01(place.rating / 5)) * RATING_WEIGHT;
  }
  base += popularityProxy(tags);
  base += parkSizeBonus(place);
  return clamp01(base);
}

// --- Скоринг (docs/vibes.md §5) -------------------------------------------------

/** Правильная метрика диверсификации: равнопромежуточная проекция, метры. */
export function localProject(point: LatLng, origin: LatLng): { x: number; y: number } {
  const R = 6_371_000;
  const DEG = Math.PI / 180;
  const cosPhi0 = Math.cos(origin[0] * DEG);
  return {
    x: R * (point[1] - origin[1]) * DEG * cosPhi0,
    y: R * (point[0] - origin[0]) * DEG,
  };
}

function planarDistance(a: LatLng, b: LatLng, origin: LatLng): number {
  const pa = localProject(a, origin);
  const pb = localProject(b, origin);
  return Math.hypot(pa.x - pb.x, pa.y - pb.y);
}

/**
 * Скор места под архетип и контекст:
 *   score = clamp01(base · w · hourAffinity? + bonusIndoor + bonusOpen + bonusWeather)
 * reasons — человекочитаемые обоснования (параллельные массивы ru/en).
 */
export function scorePlace(place: GeoPlace, ctx: ScorePlaceContext): PlaceScore {
  const a = ctx.archetype;
  const tags = place.tags ?? {};
  const reasonsRu: string[] = [];
  const reasonsEn: string[] = [];

  const base = baseQuality(place);
  const w = (a.categoryWeights as Record<string, number | undefined>)[place.category]
    ?? UNKNOWN_CATEGORY_WEIGHT;

  if (place.rating !== undefined && place.rating >= REASON_RATING_MIN) {
    reasonsRu.push(`рейтинг ${place.rating} из 5`);
    reasonsEn.push(`rated ${place.rating} out of 5`);
  }
  if (tags.wikipedia || tags.wikidata) {
    reasonsRu.push('упоминается в Википедии');
    reasonsEn.push('featured on Wikipedia');
  }
  if (w >= CORE_WEIGHT_MIN) {
    reasonsRu.push(`ядро вайба «${a.labelRu}»`);
    reasonsEn.push(`core of the "${a.labelEn}" vibe`);
  }

  // fit: качество × принадлежность архетипу × (опционально) аффинность часа.
  const affinity = ctx.hour !== undefined ? clamp01(a.hourAffinity(ctx.hour)) : 1;
  if (ctx.hour !== undefined && affinity < 0.5) {
    reasonsRu.push('не лучшее время для этого вайба');
    reasonsEn.push('not the best time for this vibe');
  }
  let score = base * w * affinity;

  // bonusIndoor: ±0.10·(2·match−1); preferIndoor отдельным слагаемым не идёт —
  // дождь уже поднял indoorBias в combineContext.
  const isPlaceIndoor = inferIndoor(place);
  const d = clamp01(a.indoorBias);
  const match = isPlaceIndoor ? d : 1 - d;
  const indoorBonus = INDOOR_MATCH_RANGE * (2 * match - 1);
  if (indoorBonus >= INDOOR_MATCH_RANGE * 0.6) {
    reasonsRu.push(isPlaceIndoor ? 'крытое место — подходит контексту' : 'под открытым небом — то, что нужно');
    reasonsEn.push(isPlaceIndoor ? 'indoors — fits the context' : 'outdoors — exactly what the moment calls for');
  } else if (indoorBonus <= -INDOOR_MATCH_RANGE * 0.6) {
    reasonsRu.push(isPlaceIndoor ? 'хочется улицы, а это крытое' : 'хочется крытого, а это улица');
    reasonsEn.push(isPlaceIndoor ? 'you would rather be outside, this is indoors' : 'you would rather be indoors, this is outside');
  }
  score += indoorBonus;

  // bonusOpen: инъекция часов работы; unknown/отсутствие — ноль.
  if (ctx.hoursState === 'open') {
    score += OPEN_BONUS;
    reasonsRu.push('работает сейчас');
    reasonsEn.push('open right now');
  } else if (ctx.hoursState === 'closed') {
    score -= CLOSED_PENALTY;
    reasonsRu.push('сейчас закрыто');
    reasonsEn.push('currently closed');
  }

  // bonusWeather: shade и lighted; дождь учтён через indoorBias.
  if (ctx.weather) {
    const hints = mapToHints(ctx.weather);
    if (hints.preferShade) {
      if (place.category === 'park') {
        score += SHADE_PARK_BONUS;
        reasonsRu.push('даст тень и зелень в жару');
        reasonsEn.push('offers shade and greenery in the heat');
      } else if (!isPlaceIndoor) {
        score -= SHADE_EXPOSED_PENALTY;
        reasonsRu.push('открытая остановка в жару');
        reasonsEn.push('an exposed stop in the heat');
      }
    }
    if (hints.preferLighted) {
      if (place.category === 'cafe' || place.category === 'restaurant' || place.category === 'bar') {
        score += LIGHTED_LIVE_BONUS;
        reasonsRu.push('вечером здесь живо и светло');
        reasonsEn.push('lively and well-lit in the evening');
      } else if (place.category === 'park' || place.category === 'viewpoint') {
        score -= LIGHTED_DARK_PENALTY;
        reasonsRu.push('ночью здесь темно и пусто');
        reasonsEn.push('dark and deserted at night');
      }
    }
  }

  return { score: clamp01(score), reasonsRu, reasonsEn };
}

// --- Диверсификация (docs/vibes.md §7) ------------------------------------------

/** Параметры диверсификации (порты старых 30/12/300 + новое categoryRepeat). */
const DIVERSITY_BONUS_MAX = 0.3;
const DIVERSITY_RADIUS_DEFAULT_M = 300;
const PROXIMITY_PENALTY_PER_200M = 0.12;
const CATEGORY_REPEAT_PENALTY = 0.08;

export interface ScoredCandidate {
  place: GeoPlace;
  score: number;
}

export interface DiversifyOptions {
  anchor: LatLng;
  maxResults?: number;
  diversityRadius?: number;
  maxAlternativeDistance?: number;
}

/**
 * Жадный отбор разнообразных якорей: правильная метрика (равнопромежуточная
 * проекция в метрах вместо сырых градусов) + штраф за повтор категории.
 * Вход не мутируется; порядок результата — порядок отбора (лучший первый).
 */
export function selectDiverseAlternatives<T extends ScoredCandidate>(
  items: readonly T[],
  opts: DiversifyOptions,
): T[] {
  if (items.length <= 1) return [...items];

  const work = [...items].sort((a, b) => b.score - a.score);
  const primary = work.shift()!;
  const selected: T[] = [primary];
  const origin = opts.anchor;

  const primaryDist = planarDistance(origin, primary.place.coordinates, origin);
  const maxDist = opts.maxAlternativeDistance ?? Math.max(primaryDist * 1.5, 1200);
  const diversityRadius = opts.diversityRadius ?? DIVERSITY_RADIUS_DEFAULT_M;
  const maxResults = opts.maxResults ?? 5;

  while (selected.length < maxResults && work.length > 0) {
    let bestIndex = -1;
    let bestValue = -Infinity;

    for (let i = 0; i < work.length; i++) {
      const candidate = work[i];
      const dAnchor = planarDistance(origin, candidate.place.coordinates, origin);
      if (dAnchor > maxDist) continue;

      let minDistToSelected = Infinity;
      for (const s of selected) {
        const dist = planarDistance(s.place.coordinates, candidate.place.coordinates, origin);
        if (dist < minDistToSelected) minDistToSelected = dist;
      }

      const diversityBonus = Math.min(minDistToSelected / diversityRadius, 1) * DIVERSITY_BONUS_MAX;
      const proximityPenalty = Math.max(0, (dAnchor - primaryDist) / 200) * PROXIMITY_PENALTY_PER_200M;
      const sameCategoryCount = selected.filter(
        (s) => s.place.category === candidate.place.category,
      ).length;
      const value = candidate.score
        + diversityBonus
        - proximityPenalty
        - sameCategoryCount * CATEGORY_REPEAT_PENALTY;

      if (value > bestValue) {
        bestValue = value;
        bestIndex = i;
      }
    }

    if (bestIndex === -1) break;
    selected.push(work.splice(bestIndex, 1)[0]);
  }

  return selected;
}
