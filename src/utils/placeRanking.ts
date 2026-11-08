// src/utils/placeRanking.ts

import { Coordinates, PlaceOfInterest } from "@/types/map";
import { getDistanceInMeters } from "@/utils/geo";

interface RankingOptions {
  currentPosition: Coordinates;
  destinationPosition?: Coordinates;
  maxResults?: number;
  diversityRadius?: number;
  nearbyThreshold?: number;
  maxAlternativeDistanceFromPrimary?: number;
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

function distanceToRouteMeters(
  point: Coordinates,
  from: Coordinates,
  to: Coordinates
): number {
  const [py, px] = point;
  const [ay, ax] = from;
  const [by, bx] = to;

  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const abLenSq = abx * abx + aby * aby;

  if (abLenSq === 0) {
    return getDistanceInMeters(from, point);
  }

  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLenSq));
  const closest: Coordinates = [ay + t * aby, ax + t * abx];
  return getDistanceInMeters(point, closest);
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
    let distancePenalty = Math.min((distance - 500) / 50, 80);
    if (place.category === 'park') {
      distancePenalty *= 0.5;
    }
    score -= distancePenalty;
  }

  if (place.category === 'park') {
    const lower = place.name.toLowerCase();
    if (lower.includes('пушкин') || lower.includes('кулибин')) {
      score += 25;
    }
  }

  // Бонус за направление к цели
  if (options.destinationPosition) {
    const inCone = isInDirectionCone(
      place.coordinates,
      options.currentPosition,
      options.destinationPosition
    );
    const routeDistance = distanceToRouteMeters(
      place.coordinates,
      options.currentPosition,
      options.destinationPosition
    );

    if (routeDistance < 400) score += 30;
    else if (routeDistance < 800) score += 18;
    else if (routeDistance < 1500) score += 8;

    if (inCone) score += 12;
    else score -= 15;
  }

  return score;
}

/**
 * Выбирает разнообразные альтернативы (не все в одной куче)
 */
function selectDiverseAlternatives(
  places: PlaceOfInterest[],
  maxResults: number,
  diversityRadius: number,
  anchor: Coordinates,
  maxAlternativeDistance?: number
): PlaceOfInterest[] {
  if (places.length === 0) return [];
  if (places.length === 1) return places;

  const selected: PlaceOfInterest[] = [];
  const remaining = [...places];
  const primary = remaining.shift()!;
  selected.push(primary);

  const primaryDistance = getDistanceInMeters(anchor, primary.coordinates);
  const maxDist = maxAlternativeDistance ?? Math.max(primaryDistance * 1.5, 1200);

  while (selected.length < maxResults && remaining.length > 0) {
    let bestIndex = -1;
    let bestDiversityScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      const distanceFromAnchor = getDistanceInMeters(anchor, candidate.coordinates);
      if (distanceFromAnchor > maxDist) continue;

      const minDistanceToSelected = Math.min(
        ...selected.map((s) => getDistanceInMeters(s.coordinates, candidate.coordinates))
      );

      const diversityBonus = Math.min(minDistanceToSelected / diversityRadius, 1) * 30;
      const proximityPenalty = Math.max(0, (distanceFromAnchor - primaryDistance) / 200) * 12;
      const diversityScore =
        (candidate.finalScore || candidate.qualityScore || 50) +
        diversityBonus -
        proximityPenalty;

      if (diversityScore > bestDiversityScore) {
        bestDiversityScore = diversityScore;
        bestIndex = i;
      }
    }

    if (bestIndex === -1) break;
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
    if (inCone.length >= 2) {
      filtered = inCone;
    }
  }

  // 3. Вычисляем итоговый балл с учетом всех факторов
  const scored = filtered.map(place => ({
    ...place,
    finalScore: calculateFinalScore(place, options),
  }));

  scored.sort((a, b) => b.finalScore - a.finalScore);

  const nearbyThreshold =
    options.nearbyThreshold ?? (scored[0]?.category === 'park' ? 3500 : 2000);
  const hasNearby = scored.some(
    (p) => getDistanceInMeters(options.currentPosition, p.coordinates) <= nearbyThreshold
  );
  const distanceFiltered = hasNearby
    ? scored.filter(
        (p) => getDistanceInMeters(options.currentPosition, p.coordinates) <= nearbyThreshold * 2.5
      )
    : scored;

  const maxResults = options.maxResults || 5;
  const diversityRadius = options.diversityRadius || 300;
  const candidates = distanceFiltered.length > 0 ? distanceFiltered : scored;

  const result = selectDiverseAlternatives(
    candidates,
    maxResults,
    diversityRadius,
    options.currentPosition,
    options.maxAlternativeDistanceFromPrimary
  );

  return result.length > 0 ? result : candidates.slice(0, maxResults);
}
