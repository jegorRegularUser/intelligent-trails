"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouteStore, MapRoutePoint, FormWaypoint } from "@/store/useRouteStore";
import { RouteBuilderSidebar } from "./RouteBuilderSidebar";
import { RouteResultSidebar } from "./RouteResultSidebar";
import { decodeRouteFromUrl } from "@/utils/routeCodec";
import { findOSMPlacesWithAlternatives } from "@/actions/osmPlaces";
import { reverseGeocode } from "@/actions/geocoder";
import { RoutingMode } from "@/types/map";

export function RouteSidebarManager() {
  const searchParams = useSearchParams();
  const routeParam = searchParams.get("r");
  
  const { setMapPoints, setStartPoint, setWaypoints, setEndPoint, setStartTransport, setIsRouteBuilt } = useRouteStore();
  const [isInitializing, setIsInitializing] = useState(false);

  useEffect(() => {
    async function processUrlRoute() {
      if (!routeParam) {
        setIsRouteBuilt(false);
        return;
      }

      setIsInitializing(true);
      const decodedData = decodeRouteFromUrl(routeParam);
      if (!decodedData) {
        setIsInitializing(false);
        return;
      }

      // Восстанавливаем данные в стор для формы "Изменить"
      setStartPoint(decodedData.startPoint);
      setStartTransport(decodedData.startTransport);
      setWaypoints(decodedData.waypoints);
      setEndPoint(decodedData.endPoint);

      const finalMapPoints: MapRoutePoint[] = [];
      const updatedWaypoints: FormWaypoint[] = [...decodedData.waypoints];

      // 1. ОБРАБОТКА СТАРТА
      const startInfo = await reverseGeocode(decodedData.startPoint);
      finalMapPoints.push({
        coordinates: decodedData.startPoint,
        modeToNext: decodedData.startTransport,
        name: startInfo.name,
        address: startInfo.address
      });

      let lastCoords = decodedData.startPoint;

      // 2. ОБРАБОТКА ПРОМЕЖУТОЧНЫХ ТОЧЕК
      for (let i = 0; i < decodedData.waypoints.length; i++) {
        const wp = decodedData.waypoints[i];
        
        if (wp.type === "address" && wp.coords) {
          const info = await reverseGeocode(wp.coords);
          finalMapPoints.push({
            coordinates: wp.coords,
            modeToNext: wp.modeToNext,
            name: info.name,
            address: info.address
          });
          lastCoords = wp.coords;
        } 
        else if (wp.type === "category") {
          const places = await findOSMPlacesWithAlternatives(wp.value, lastCoords);
          
          if (places.length > 0) {
            const best = places[0];
            
            // Если у OSM нет адреса (для парков и т.д.) — берем у Яндекса
            let displayAddress = best.address;
            if (!displayAddress) {
              const geo = await reverseGeocode(best.coordinates);
              displayAddress = geo.address;
            }

            // Наполняем Чистовик (для карты и результатов)
            finalMapPoints.push({
              coordinates: best.coordinates,
              modeToNext: wp.modeToNext,
              name: best.name,
              address: displayAddress,
              alternatives: places.slice(0, 5),
              selectedAlternativeIndex: 0
            });

            // Наполняем Черновик (чтобы AlternativesSelect в WaypointItem увидел данные)
            updatedWaypoints[i] = {
              ...wp,
              value: best.name,
              address: displayAddress,
              alternatives: places.slice(0, 5),
              selectedAlternativeIndex: 0
            };
            
            lastCoords = best.coordinates;
          }
        }
      }

      // 3. ОБРАБОТКА ФИНИША (Адрес или Категория)
      if (decodedData.endPointType === "category") {
        const places = await findOSMPlacesWithAlternatives(decodedData.endPointCategory, lastCoords);
        if (places.length > 0) {
          const best = places[0];
          let displayAddress = best.address || (await reverseGeocode(best.coordinates)).address;

          finalMapPoints.push({
            coordinates: best.coordinates,
            modeToNext: "pedestrian",
            name: best.name,
            address: displayAddress,
            alternatives: places.slice(0, 5),
            selectedAlternativeIndex: 0
          });
        }
      } else if (decodedData.endPoint) {
        const endInfo = await reverseGeocode(decodedData.endPoint);
        finalMapPoints.push({
          coordinates: decodedData.endPoint,
          modeToNext: "pedestrian",
          name: endInfo.name,
          address: endInfo.address
        });
      }

      // Сохраняем все данные в стор
      setWaypoints(updatedWaypoints);
      setMapPoints(finalMapPoints);
      setIsRouteBuilt(true);
      setIsInitializing(false);
    }

    processUrlRoute();
  }, [routeParam]);

  if (isInitializing) {
    return (
      <div className="absolute left-6 top-6 w-[400px] bg-white p-10 rounded-3xl shadow-float z-40 flex flex-col items-center gap-4 border border-slate-100">
         <div className="w-12 h-12 border-4 border-brand-100 border-t-brand-500 rounded-full animate-spin" />
         <p className="text-slate-600 font-bold text-lg">Вычисляем идеальный путь...</p>
      </div>
    );
  }

  return routeParam ? <RouteResultSidebar /> : <RouteBuilderSidebar />;
}