// src/actions/builder.ts
"use server";

import { Coordinates, RoutingMode, PlaceOfInterest } from "@/types/map";
import { fetchPlacesByCategory } from "@/services/osm";
import { getDistanceInMeters } from "@/utils/geo";
import { sleep } from "@/utils/async";
import { reverseGeocode } from "@/actions/geocoder"; // Предполагаем, что он есть

const SPEEDS: Record<RoutingMode, number> = {
  pedestrian: 1.38,
  auto: 8.33,
  masstransit: 5.55,
  bicycle: 4.16
};

export interface BuiltStep {
  name: string;
  address?: string;
  coordinates: Coordinates;
  alternatives?: PlaceOfInterest[];
  modeToNext: RoutingMode;
  distanceToNext?: number;
  durationToNext?: number;
}

export async function buildSmartRouteWithAlternatives(
  start: Coordinates,
  end: Coordinates,
  categories: { name: string; modeToNext: RoutingMode; stayDuration: number }[],
  startMode: RoutingMode,
  // Добавляем опциональные имена из формы, если они уже есть
  startName?: string,
  endName?: string
): Promise<BuiltStep[]> {
  const steps: BuiltStep[] = [];
  let currentPoint = start;

  // 1. ГЕОКОДИРУЕМ СТАРТ (Чтобы не было "Старт")
  let startInfo = { name: startName || "Точка отправления", address: "" };
  if (!startName) {
    const geo = await reverseGeocode(start);
    startInfo = { name: geo.name, address: geo.address };
  }

  steps.push({
    name: startInfo.name,
    address: startInfo.address,
    coordinates: start,
    modeToNext: startMode,
  });

  // 2. ИЩЕМ КАТЕГОРИИ
  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i];
    try {
      const places = await fetchPlacesByCategory(currentPoint, cat.name);

      if (places.length > 0) {
        places.sort((a, b) => getDistanceInMeters(currentPoint, a.coordinates) - getDistanceInMeters(currentPoint, b.coordinates));
        
        const topAlternatives = places.slice(0, 5);
        const bestPlace = topAlternatives[0];

        // Метрики от предыдущей точки к этой
        const distance = getDistanceInMeters(currentPoint, bestPlace.coordinates);
        const mode = i === 0 ? startMode : categories[i-1].modeToNext;
        
        // Обновляем предыдущий шаг реальными данными
        steps[steps.length - 1].distanceToNext = distance;
        steps[steps.length - 1].durationToNext = distance / SPEEDS[mode];

        steps.push({
          name: bestPlace.name,
          address: bestPlace.address,
          coordinates: bestPlace.coordinates,
          alternatives: topAlternatives, // ВОТ ОНИ, РОДИМЫЕ
          modeToNext: cat.modeToNext,
        });

        currentPoint = bestPlace.coordinates;
      }
    } catch (e) {
      console.error(e);
    }
    await sleep(500);
  }

  // 3. ГЕОКОДИРУЕМ ФИНИШ
  let endInfo = { name: endName || "Финиш", address: "" };
  if (!endName) {
    const geo = await reverseGeocode(end);
    endInfo = { name: geo.name, address: geo.address };
  }

  const finalDist = getDistanceInMeters(currentPoint, end);
  const finalMode = categories.length > 0 ? categories[categories.length - 1].modeToNext : startMode;

  steps[steps.length - 1].distanceToNext = finalDist;
  steps[steps.length - 1].durationToNext = finalDist / SPEEDS[finalMode];

  steps.push({
    name: endInfo.name,
    address: endInfo.address,
    coordinates: end,
    modeToNext: "pedestrian",
  });

  return steps;
}