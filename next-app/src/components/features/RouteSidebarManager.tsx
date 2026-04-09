"use client";

import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useRouteStore, MapRoutePoint, FormWaypoint } from "@/store/useRouteStore";
import { RouteBuilderSidebar } from "./RouteBuilderSidebar";
import { RouteResultSidebar } from "./RouteResultSidebar";
import { decodeRouteFromUrl, encodeRouteToUrl } from "@/utils/routeCodec";
import { findOSMPlacesWithAlternatives } from "@/actions/osmPlaces";
import { reverseGeocode } from "@/actions/geocoder";

export function RouteSidebarManager() {
  const searchParams = useSearchParams();
  const routeParam = searchParams.get("r");
  
  const { 
    setMapPoints, setStartPoint, setWaypoints, 
    setEndPoint, setStartTransport, 
    isRouteBuilt, setIsRouteBuilt 
  } = useRouteStore();
  
  const [isInitializing, setIsInitializing] = useState(false);
  const lastProcessedUrl = useRef<string | null>(null);

  useEffect(() => {
    async function processUrlRoute() {
      if (!routeParam) {
        setIsRouteBuilt(false);
        return;
      }

      if (isRouteBuilt || lastProcessedUrl.current === routeParam) return;

      setIsInitializing(true);
      lastProcessedUrl.current = routeParam;

      const decodedData = decodeRouteFromUrl(routeParam);
      if (!decodedData) {
        setIsInitializing(false);
        return;
      }

      setStartPoint(decodedData.startPoint);
      setStartTransport(decodedData.startTransport);
      setEndPoint(decodedData.endPoint);

      const finalMapPoints: MapRoutePoint[] = [];
      const updatedWaypoints: FormWaypoint[] = [...decodedData.waypoints];

      // 1. СТАРТ
      const startName = decodedData.startPointName || (await reverseGeocode(decodedData.startPoint)).name;
      finalMapPoints.push({
        coordinates: decodedData.startPoint,
        modeToNext: decodedData.startTransport,
        name: startName,
      });

      let lastCoords = decodedData.startPoint;

      // 2. ПРОМЕЖУТОЧНЫЕ ТОЧКИ
      for (let i = 0; i < decodedData.waypoints.length; i++) {
        const wp = decodedData.waypoints[i];
        
        // FAST PATH: Если в URL УЖЕ ЕСТЬ координаты (мы перешли по готовой ссылке)
        if (wp.coords && wp.resolvedName) {
          finalMapPoints.push({
            coordinates: wp.coords,
            modeToNext: wp.modeToNext,
            name: wp.resolvedName,
            address: wp.address,
            selectedAlternativeIndex: wp.selectedAlternativeIndex || 0
          });

          // Тихо загружаем альтернативы в фоне (не блокируем UI!)
          if (wp.type === "category") {
            const searchCat = wp.originalCategory || wp.value;
            findOSMPlacesWithAlternatives(searchCat, lastCoords).then(places => {
              setWaypoints(current => {
                const newWps = [...current];
                if (newWps[i]) newWps[i].alternatives = places;
                return newWps;
              });
            });
          }
          
          lastCoords = wp.coords;
          continue; // Пропускаем тяжелый Slow Path
        }

        // SLOW PATH: Точка только что добавлена, координат нет. Идем в API.
        if (wp.type === "address" && wp.coords) {
          const info = await reverseGeocode(wp.coords);
          finalMapPoints.push({
            coordinates: wp.coords, modeToNext: wp.modeToNext, name: info.name, address: info.address
          });
          updatedWaypoints[i] = { ...wp, resolvedName: info.name, address: info.address };
          lastCoords = wp.coords;
        } 
        else if (wp.type === "category") {
          const searchCat = wp.originalCategory || wp.value;
          const places = await findOSMPlacesWithAlternatives(searchCat, lastCoords);
          
          if (places.length > 0) {
            const altIndex = wp.selectedAlternativeIndex || 0;
            const best = places[altIndex] || places[0];
            
            let displayAddress = best.address || (await reverseGeocode(best.coordinates)).address;

            finalMapPoints.push({
              coordinates: best.coordinates,
              modeToNext: wp.modeToNext,
              name: best.name,
              address: displayAddress,
              alternatives: places.slice(0, 5),
              selectedAlternativeIndex: altIndex
            });

            // ВОТ ЗДЕСЬ МЫ ЖЕСТКО ЗАПИСЫВАЕМ КООРДИНАТЫ В ЧЕРНОВИК ДЛЯ URL
            updatedWaypoints[i] = {
              ...wp,
              originalCategory: searchCat,
              resolvedName: best.name,
              coords: best.coordinates, // <-- ЭТО СПАСЕТ НАС ОТ OSM ПРИ СЛЕДУЮЩЕЙ ЗАГРУЗКЕ
              address: displayAddress,
              alternatives: places.slice(0, 5),
              selectedAlternativeIndex: altIndex
            };
            
            lastCoords = best.coordinates;
          } else {
            // Фолбек, чтобы не сбить индексы
            finalMapPoints.push({
              coordinates: lastCoords, modeToNext: wp.modeToNext, name: `Не найдено: ${searchCat}`
            });
          }
        }
      }

      // 3. ФИНИШ
      let finalEndPointCoords = decodedData.endPoint;
      let finalEndPointName = decodedData.endPointName;

      // Fast Path для финиша
      if (decodedData.endPoint && decodedData.endPointName) {
        finalMapPoints.push({
          coordinates: decodedData.endPoint, modeToNext: "pedestrian", name: decodedData.endPointName
        });
      } 
      // Slow Path для категориального финиша
      else if (decodedData.endPointType === "category") {
        const places = await findOSMPlacesWithAlternatives(decodedData.endPointCategory, lastCoords);
        if (places.length > 0) {
          const best = places[0];
          let displayAddress = best.address || (await reverseGeocode(best.coordinates)).address;

          finalEndPointCoords = best.coordinates;
          finalEndPointName = best.name;

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
        finalEndPointCoords = decodedData.endPoint;
        finalEndPointName = endInfo.name;
        finalMapPoints.push({
          coordinates: decodedData.endPoint, modeToNext: "pedestrian", name: endInfo.name, address: endInfo.address
        });
      }

      // СОХРАНЯЕМ В СТОР
      setWaypoints(updatedWaypoints);
      setMapPoints(finalMapPoints);
      setIsRouteBuilt(true);
      setIsInitializing(false);

      // МАГИЯ: Тихо пакуем готовые координаты в URL, чтобы пользователь скопировал уже "твердую" ссылку
      const packedUrl = encodeRouteToUrl({
        startPoint: decodedData.startPoint,
        startTransport: decodedData.startTransport,
        startPointName: startName,
        waypoints: updatedWaypoints.map(wp => ({
          id: wp.id, type: wp.type, value: wp.value, originalCategory: wp.originalCategory,
          resolvedName: wp.resolvedName, coords: wp.coords, address: wp.address,
          duration: wp.duration, modeToNext: wp.modeToNext, selectedAlternativeIndex: wp.selectedAlternativeIndex || 0
        })),
        endPoint: finalEndPointCoords,
        endPointType: decodedData.endPointType,
        endPointCategory: decodedData.endPointCategory,
        endPointName: finalEndPointName
      });
      window.history.replaceState(null, '', `?r=${packedUrl}`);
    }

    processUrlRoute();
  }, [routeParam, isRouteBuilt, setEndPoint, setMapPoints, setStartPoint, setStartTransport, setWaypoints, setIsRouteBuilt]);

  if (isInitializing) {
    return (
      <div className="absolute left-6 top-6 w-[400px] bg-white p-10 rounded-3xl shadow-float z-40 flex flex-col items-center gap-4">
         <div className="w-12 h-12 border-4 border-brand-100 border-t-brand-500 rounded-full animate-spin" />
         <p className="text-slate-600 font-bold text-lg">Вычисляем маршрут...</p>
      </div>
    );
  }

  return (isRouteBuilt && routeParam) ? <RouteResultSidebar /> : <RouteBuilderSidebar />;
}