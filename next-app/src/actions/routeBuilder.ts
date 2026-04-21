// src/actions/routeBuilder.ts
"use server";

import { Coordinates, RoutingMode, PlaceOfInterest } from "@/types/map";
import { findOSMPlacesWithAlternatives } from "@/actions/osmPlaces";
import { reverseGeocode, getCoordinatesFromAddress } from "@/actions/geocoder";
import { MapRoutePoint, FormWaypoint } from "@/store/useRouteStore";

export interface BuildRouteInput {
  startPoint: Coordinates;
  startPointName?: string;
  startTransport: RoutingMode;
  waypoints: FormWaypoint[];
  endPoint: Coordinates | null;
  endPointName?: string;
  endPointType: "address" | "category";
  endPointCategory?: string;
}

export interface BuildRouteResult {
  success: boolean;
  mapPoints?: MapRoutePoint[];
  waypoints?: FormWaypoint[];
  startPointName?: string;
  startPointAddress?: string;
  endPointName?: string;
  endPointAddress?: string;
  endPoint?: Coordinates;
  error?: string;
}

/**
 * Полное построение маршрута с вызовами OSM и геокодированием
 * Возвращает готовые данные для записи в URL и отображения
 */
export async function buildCompleteRoute(input: BuildRouteInput): Promise<BuildRouteResult> {
  try {
    const mapPoints: MapRoutePoint[] = [];
    const updatedWaypoints: FormWaypoint[] = [];

    // Определяем конечную точку для конусной фильтрации
    const finalDestination = input.endPoint || null;

    // 1. СТАРТ - геокодируем если нет имени
    let startName = input.startPointName;
    let startAddress = input.startPointName;

    if (!startName) {
      const startInfo = await reverseGeocode(input.startPoint);
      startName = startInfo.name;
      startAddress = startInfo.address;
    }

    mapPoints.push({
      coordinates: input.startPoint,
      modeToNext: input.startTransport,
      name: startName,
      address: startAddress,
    });

    // 2. ПРОМЕЖУТОЧНЫЕ ТОЧКИ - параллельная обработка
    const waypointResults = await Promise.all(
      input.waypoints.map(async (wp, index) => {
        // Для категорий используем предыдущую точку как базу поиска
        const searchBase = index === 0 ? input.startPoint : input.startPoint; // Будет уточнено после первого прохода

        if (wp.type === "address") {
          // Если есть координаты, используем их
          if (wp.coords) {
            const info = await reverseGeocode(wp.coords);
            return {
              success: true,
              coords: wp.coords,
              name: info.name,
              address: info.address,
              waypoint: wp,
            };
          }
          // Если только текст адреса, геокодируем
          else if (wp.value) {
            const coords = await getCoordinatesFromAddress(wp.value);
            if (!coords) {
              return {
                success: false,
                error: `Не удалось найти адрес: ${wp.value}`,
                waypoint: wp,
              };
            }
            const info = await reverseGeocode(coords);
            return {
              success: true,
              coords,
              name: info.name,
              address: info.address,
              waypoint: wp,
            };
          }
        }

        return { success: true, waypoint: wp, needsCategorySearch: true };
      })
    );

    // Проверяем ошибки адресов
    for (const result of waypointResults) {
      if (!result.success && result.error) {
        return { success: false, error: result.error };
      }
    }

    // Теперь последовательно обрабатываем категории (они зависят от предыдущих координат)
    let lastCoords = input.startPoint;

    for (let i = 0; i < waypointResults.length; i++) {
      const result = waypointResults[i];
      const wp = result.waypoint;

      if (result.needsCategorySearch && wp.type === "category") {
        // Ищем места через OSM с учетом направления к финишу
        const searchCategory = wp.originalCategory || wp.value;
        const places = await findOSMPlacesWithAlternatives(
          searchCategory,
          lastCoords,
          finalDestination || undefined
        );

        if (places.length === 0) {
          return {
            success: false,
            error: `Не найдено мест категории "${searchCategory}" поблизости`
          };
        }

        // Берем первую (ближайшую) или выбранную альтернативу
        const selectedIndex = wp.selectedAlternativeIndex || 0;
        const selectedPlace = places[selectedIndex] || places[0];

        // Используем адрес из OSM, геокодируем только если его нет
        let displayAddress = selectedPlace.address;
        if (!displayAddress) {
          const info = await reverseGeocode(selectedPlace.coordinates);
          displayAddress = info.address;
        }

        mapPoints.push({
          coordinates: selectedPlace.coordinates,
          modeToNext: wp.modeToNext,
          name: selectedPlace.name,
          address: displayAddress,
          alternatives: places.slice(0, 5),
          selectedAlternativeIndex: selectedIndex,
        });

        updatedWaypoints.push({
          ...wp,
          coords: selectedPlace.coordinates,
          resolvedName: selectedPlace.name,
          address: displayAddress,
          originalCategory: searchCategory,
          alternatives: places.slice(0, 5),
          selectedAlternativeIndex: selectedIndex,
        });

        lastCoords = selectedPlace.coordinates;
      } else if (result.coords) {
        // Адресная точка уже обработана
        mapPoints.push({
          coordinates: result.coords,
          modeToNext: wp.modeToNext,
          name: result.name!,
          address: result.address!,
        });

        updatedWaypoints.push({
          ...wp,
          coords: result.coords,
          resolvedName: result.name,
          address: result.address,
        });

        lastCoords = result.coords;
      }
    }

    // 3. ФИНИШ
    let finalEndPoint = input.endPoint;
    let finalEndName = input.endPointName;
    let finalEndAddress = input.endPointName;

    if (input.endPointType === "category" && input.endPointCategory) {
      // Ищем место по категории с учетом направления
      const places = await findOSMPlacesWithAlternatives(
        input.endPointCategory,
        lastCoords,
        finalDestination || undefined
      );

      if (places.length === 0) {
        return {
          success: false,
          error: `Не найдено мест категории "${input.endPointCategory}" для финиша`
        };
      }

      const selectedPlace = places[0];
      finalEndPoint = selectedPlace.coordinates;
      finalEndName = selectedPlace.name;

      // Используем адрес из OSM, геокодируем только если его нет
      finalEndAddress = selectedPlace.address;
      if (!finalEndAddress) {
        const info = await reverseGeocode(selectedPlace.coordinates);
        finalEndAddress = info.address;
      }

      mapPoints.push({
        coordinates: selectedPlace.coordinates,
        modeToNext: "pedestrian",
        name: selectedPlace.name,
        address: finalEndAddress,
        alternatives: places.slice(0, 5),
        selectedAlternativeIndex: 0,
      });
    }
    else if (finalEndPoint) {
      // Адрес финиша
      if (!finalEndName) {
        const info = await reverseGeocode(finalEndPoint);
        finalEndName = info.name;
        finalEndAddress = info.address;
      }

      mapPoints.push({
        coordinates: finalEndPoint,
        modeToNext: "pedestrian",
        name: finalEndName,
        address: finalEndAddress,
      });
    }

    return {
      success: true,
      mapPoints,
      waypoints: updatedWaypoints,
      startPointName: startName,
      startPointAddress: startAddress,
      endPoint: finalEndPoint || undefined,
      endPointName: finalEndName,
      endPointAddress: finalEndAddress,
    };
  } catch (error: any) {
    console.error("Ошибка построения маршрута:", error);
    return {
      success: false,
      error: error.message || "Неизвестная ошибка при построении маршрута"
    };
  }
}
