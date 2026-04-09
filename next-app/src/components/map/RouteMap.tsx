// src/components/map/RouteMap.tsx
"use client";

import { useEffect, useState, useRef } from "react";
import { YMaps, Map } from "@pbe/react-yandex-maps";
import { useRouteStore } from "@/store/useRouteStore";

export function RouteMap() {
  const [ymapsInstance, setYmapsInstance] = useState<any>(null);
  const [mapInstance, setMapInstance] = useState<any>(null);
  const routeRefs = useRef<any[]>([]);

  const { mapPoints, setMapPoints } = useRouteStore();

  // Signature для useEffect: реагируем только на изменение координат или режима
  const routeSignature = JSON.stringify(
    mapPoints.map(p => ({ c: p.coordinates, m: p.modeToNext }))
  );

  useEffect(() => {
    if (!ymapsInstance || !mapInstance || mapPoints.length < 2) return;

    // Очистка старых объектов
    routeRefs.current.forEach(route => mapInstance.geoObjects.remove(route));
    routeRefs.current = [];

    const newMapPoints = [...mapPoints];
    let pendingUpdates = 0;

    for (let i = 0; i < mapPoints.length - 1; i++) {
      const currentPoint = mapPoints[i];
      const nextPoint = mapPoints[i + 1];

      const strokeColor = 
        currentPoint.modeToNext === 'pedestrian' ? "#10b981" : 
        currentPoint.modeToNext === 'masstransit' ? "#f59e0b" : "#3b82f6";

      const routeSegment = new ymapsInstance.multiRouter.MultiRoute(
        {
          referencePoints: [currentPoint.coordinates, nextPoint.coordinates],
          params: { routingMode: currentPoint.modeToNext },
        },
        {
          wayPointVisible: false, // Скрываем стандартные метки Яндекса (у нас свои)
          routeActiveStrokeWidth: 6,
          routeActiveStrokeColor: strokeColor,
          boundsAutoApply: false
        }
      );

      // ПОЛУЧЕНИЕ РЕАЛЬНЫХ ДАННЫХ
      routeSegment.model.events.add("update", () => {
        const activeRoute = routeSegment.getActiveRoute();
        if (activeRoute) {
          const properties = activeRoute.properties;
          const distance = properties.get("distance").value; // метры
          const duration = properties.get("duration").value; // секунды

          // Обновляем только если данные значительно отличаются от старых
          if (newMapPoints[i].distanceToNext !== distance) {
            newMapPoints[i] = {
              ...newMapPoints[i],
              distanceToNext: distance,
              durationToNext: duration
            };
            
            // Запускаем обновление стора, когда все сегменты "отчитались"
            setMapPoints([...newMapPoints]);
          }
        }
      });

      routeRefs.current.push(routeSegment);
      mapInstance.geoObjects.add(routeSegment);
    }

    // Зум и центрирование
    const allCoords = mapPoints.map(p => p.coordinates);
    const globalBounds = ymapsInstance.util.bounds.fromPoints(allCoords);
    mapInstance.setBounds(globalBounds, {
      checkZoomRange: true,
      zoomMargin: [50, 50, 50, window.innerWidth > 768 ? 450 : 80],
      duration: 500
    });

    return () => {
      routeRefs.current.forEach(route => mapInstance?.geoObjects?.remove(route));
    };
  }, [ymapsInstance, mapInstance, routeSignature]);

  const isEnglish = typeof window !== 'undefined' && window.location.pathname.startsWith('/en');
  
  return (
    <YMaps query={{ apikey: process.env.NEXT_PUBLIC_YANDEX_API_KEY, load: "package.full", lang: isEnglish ? 'en_US' : 'ru_RU' }}>
      <div className="w-full h-full">
        <Map
          defaultState={{ center: [55.75, 37.61], zoom: 12 }}
          width="100%"
          height="100%"
          onLoad={setYmapsInstance}
          instanceRef={setMapInstance}
          modules={["multiRouter.MultiRoute", "util.bounds"]} 
          options={{ suppressMapOpenBlock: true }} // Убираем лишние кнопки Яндекса
        />
      </div>
    </YMaps>
  );
}