// src/utils/placeRanking.ts

import { Coordinates, PlaceOfInterest } from "@/types/map";
import { getDistanceInMeters } from "@/utils/geo";

interface RankingOptions {
  currentPosition: Coordinates;
  destinationPosition?: Coordinates; // Для конусной фильтрации
  maxResults?: number;
  diversityRadius?: number; // Минимальное расстояние между альтернативами (метры)
}

/**
 * Вычисляет балл качества места (0-100)
 */
function calculateQualityScore(place: PlaceOfInterest): number {
  let score = 50; // Базовый балл

  // Рейтинг (0-5) → +0 до +30 баллов
  if (place.rating) {
    score += (place.rating / 5) * 30;
  }

  // Популярность (косвенные признаки) → +0 до +20 баллов
  if (place.popularity) {
    score += Math.min(place.popularity, 20);
  }

  // Размер объекта (важно для парков)
  if (place.size) {
    if (place.category === 'park') {
      // Большие парки лучше (10000м² = +10 баллов, 100000м² = +20 баллов)
      score += Math.min(Math.log10(place.size) * 5, 20);
    } else if (place.category === 'cafe' || place.category === 'restaurant') {
      // Вместимость для заведений
      score += Math.min(place.size / 10, 10);
    }
  }

  return Math.min(Math.max(score, 0), 100);
}

/**
 * Проверяет, находится ли место в конусе направления к цели
 * Конус: угол ±90° от направления к цели
 */
function isInDirectionCone(
  place: Coordinates,
  from: Coordinates,
  to: Coordinates
): boolean {
  // Вектор от текущей позиции к цели
  const toGoalX = to[1] - from[1];
  const toGoalY = to[0] - from[0];

  // Вектор от текущей позиции к месту
  const toPlaceX = place[1] - from[1];
  const toPlaceY = place[0] - from[0];

  // Скалярное произведение
  const dotProduct = toGoalX * toPlaceX + toGoalY * toPlaceY;

  // Если скалярное произведение положительное, место в переднем полупространстве
  // Это означает угол < 90° (конус ±90°)
  return dotProduct > 0;
}

/**
 * Вычисляет итоговый балл места с учетом всех факторов
 */
function calculateFinalScore(
  place: PlaceOfInterest,
  options: RankingOptions
): number {
  const distance = getDistanceInMeters(options.currentPosition, place.coordinates);
  const qualityScore = place.qualityScore || calculateQualityScore(place);

  // Базовый балл = качество (0-100)
  let score = qualityScore;

  // Штраф за расстояние (чем дальше, тем меньше балл)
  // 0-500м: без штрафа
  // 500-2000м: -10 до -30 баллов
  // >2000м: -30 до -50 баллов
  if (distance > 500) {
    const distancePenalty = Math.min((distance - 500) / 100, 50);
    score -= distancePenalty;
  }

  // Бонус за направление к цели
  if (options.destinationPosition) {
    const inCone = isInDirectionCone(
      place.coordinates,
      options.currentPosition,
      options.destinationPosition
    );
    if (inCone) {
      score += 15; // Бонус за правильное направление
    } else {
      score -= 20; // Штраф за движение назад
    }
  }

  return score;
}

/**
 * Выбирает разнообразные альтернативы (не все в одной куче)
 */
function selectDiverseAlternatives(
  places: PlaceOfInterest[],
  maxResults: number,
  diversityRadius: number
): PlaceOfInterest[] {
  if (places.length <= maxResults) {
    return places;
  }

  const selected: PlaceOfInterest[] = [];
  const remaining = [...places];

  // Берем лучшее место
  selected.push(remaining.shift()!);

  // Выбираем остальные с учетом разнообразия
  while (selected.length < maxResults && remaining.length > 0) {
    let bestIndex = 0;
    let bestDiversityScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];

      // Минимальное расстояние до уже выбранных мест
      const minDistanceToSelected = Math.min(
        ...selected.map(s => getDistanceInMeters(s.coordinates, candidate.coordinates))
      );

      // Балл разнообразия = качество + бонус за удаленность от выбранных
      const diversityBonus = Math.min(minDistanceToSelected / diversityRadius, 1) * 30;
      const diversityScore = (candidate.qualityScore || 50) + diversityBonus;

      if (diversityScore > bestDiversityScore) {
        bestDiversityScore = diversityScore;
        bestIndex = i;
      }
    }

    selected.push(remaining.splice(bestIndex, 1)[0]);
  }

  return selected;
}

/**
 * Умное ранжирование мест с учетом качества, расстояния, направления и разнообразия
 */
export function rankPlaces(
  places: PlaceOfInterest[],
  options: RankingOptions
): PlaceOfInterest[] {
  if (!places || places.length === 0) {
    return [];
  }

  // 1. Вычисляем балл качества для каждого места
  const placesWithQuality = places.map(place => ({
    ...place,
    qualityScore: calculateQualityScore(place),
  }));

  // 2. Фильтруем по конусу направления (если указана цель)
  let filtered = placesWithQuality;
  if (options.destinationPosition) {
    const inCone = placesWithQuality.filter(p =>
      isInDirectionCone(p.coordinates, options.currentPosition, options.destinationPosition!)
    );

    // Если в конусе есть хотя бы 3 места, используем только их
    // Иначе берем все (чтобы не остаться без вариантов)
    if (inCone.length >= 3) {
      filtered = inCone;
    }
  }

  // 3. Вычисляем итоговый балл с учетом всех факторов
  const scored = filtered.map(place => ({
    ...place,
    finalScore: calculateFinalScore(place, options),
  }));

  // 4. Сортируем по итоговому баллу
  scored.sort((a, b) => b.finalScore - a.finalScore);

  // 5. Выбираем разнообразные альтернативы
  const maxResults = options.maxResults || 5;
  const diversityRadius = options.diversityRadius || 300; // 300м между альтернативами

  return selectDiverseAlternatives(scored, maxResults, diversityRadius);
}
