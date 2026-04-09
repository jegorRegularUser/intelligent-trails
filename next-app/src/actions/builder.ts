// src/actions/builder.ts
"use server";

import { Coordinates, RouteStep, RoutingMode } from "@/types/map";
import { fetchPlacesByCategory } from "@/services/osm";
import { getDistanceInMeters } from "@/utils/geo";
import { sleep } from "@/utils/async";

// Средние скорости в м/с для расчёта duration
const SPEEDS: Record<RoutingMode, number> = {
  pedestrian: 1.38,
  auto: 8.33,
  masstransit: 5.55,
  bicycle: 4.16
};

export async function buildSmartRouteWithAlternatives(
  start: Coordinates,
  end: Coordinates,
  categories: { name: string; modeToNext: RoutingMode; stayDuration: number }[],
  startMode: RoutingMode
): Promise<RouteStep[]> {
  const steps: RouteStep[] = [];
  let currentPoint = start;

  // 1. Добавляем СТАРТ (пока без метрик, они запишутся в цикле)
  steps.push({
    id: "start",
    type: "point",
    selectedCoords: start,
    modeToNext: startMode,
    stayDuration: 0,
  });

  // 2. Ищем точки категорий
  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i];
    try {
      const places = await fetchPlacesByCategory(currentPoint, cat.name);

      if (places.length > 0) {
        // Сортируем по близости
        places.sort((a, b) => getDistanceInMeters(currentPoint, a.coordinates) - getDistanceInMeters(currentPoint, b.coordinates));
        const topAlternatives = places.slice(0, 5);
        const bestCoords = topAlternatives[0].coordinates;

        // Расчёт метрик от предыдущей точки к текущей
        const distance = getDistanceInMeters(currentPoint, bestCoords);
        const mode = i === 0 ? startMode : categories[i - 1].modeToNext;
        const duration = distance / SPEEDS[mode];

        // Обновляем метрики ПРЕДЫДУЩЕЙ точки (путь К этой точке)
        steps[steps.length - 1].travelMetrics = {
          distance,
          duration
        };

        steps.push({
          id: `cat-${cat.name}-${i}`,
          type: "category",
          selectedCoords: bestCoords,
          alternatives: topAlternatives,
          modeToNext: cat.modeToNext,
          stayDuration: cat.stayDuration * 60, // Переводим минуты из формы в секунды
        });

        currentPoint = bestCoords;
      }
    } catch (error) {
      console.error(`Ошибка при поиске ${cat.name}:`, error);
    }

    if (i < categories.length - 1) await sleep(1000);
  }

  // 3. Расчёт пути к ФИНАЛУ
  const finalDistance = getDistanceInMeters(currentPoint, end);
  const finalMode = categories.length > 0 ? categories[categories.length - 1].modeToNext : startMode;
  
  steps[steps.length - 1].travelMetrics = {
    distance: finalDistance,
    duration: finalDistance / SPEEDS[finalMode]
  };

  steps.push({
    id: "end",
    type: "point",
    selectedCoords: end,
    modeToNext: "pedestrian", // После финиша не едем
    stayDuration: 0,
  });

  return steps;
}