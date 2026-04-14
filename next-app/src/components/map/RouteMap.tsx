// src/components/map/RouteMap.tsx
"use client";

import { useEffect, useState, useRef } from "react";
import { YMaps, Map } from "@pbe/react-yandex-maps";
import { useRouteStore } from "@/store/useRouteStore";

export function RouteMap() {
  const [ymapsInstance, setYmapsInstance] = useState<any>(null);
  const [mapInstance, setMapInstance] = useState<any>(null);
  const routeRefs = useRef<any[]>([]);
  const placemarkRefs = useRef<any[]>([]);

  const { mapPoints, setMapPoints } = useRouteStore();

  // Signature для useEffect: реагируем только на изменение координат или режима
  const routeSignature = JSON.stringify(
    mapPoints.map(p => ({ c: p.coordinates, m: p.modeToNext }))
  );

  useEffect(() => {
    if (!ymapsInstance || !mapInstance || mapPoints.length < 2) return;

    // Очистка старых объектов
    routeRefs.current.forEach(route => mapInstance.geoObjects.remove(route));
    placemarkRefs.current.forEach(pm => mapInstance.geoObjects.remove(pm));
    routeRefs.current = [];
    placemarkRefs.current = [];

    const newMapPoints = [...mapPoints];

    // Создаем сегменты маршрута
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
          wayPointVisible: false,
          wayPointStartVisible: false,
          wayPointFinishVisible: false,
          routeStrokeWidth: 0,
          routeActiveStrokeWidth: 6,
          routeActiveStrokeColor: strokeColor,
          boundsAutoApply: false,
          pinVisible: false
        }
      );

      // Скрываем все метки маршрутизатора программно
      routeSegment.editor.start({ addWayPoints: false, removeWayPoints: false });
      routeSegment.editor.stop();

      // Удаляем waypoint-метки из коллекции
      const wayPoints = routeSegment.getWayPoints();
      wayPoints.each((wayPoint: any) => {
        wayPoint.options.set('visible', false);
      });

      // ПОЛУЧЕНИЕ РЕАЛЬНЫХ ДАННЫХ
      routeSegment.model.events.add("update", () => {
        const activeRoute = routeSegment.getActiveRoute();
        if (activeRoute) {
          const properties = activeRoute.properties;
          const distance = properties.get("distance").value;
          const duration = properties.get("duration").value;

          if (newMapPoints[i].distanceToNext !== distance) {
            newMapPoints[i] = {
              ...newMapPoints[i],
              distanceToNext: distance,
              durationToNext: duration
            };
            setMapPoints([...newMapPoints]);
          }
        }
      });

      routeRefs.current.push(routeSegment);
      mapInstance.geoObjects.add(routeSegment);
    }

    // Создаем кастомные метки для каждой точки
    mapPoints.forEach((point, index) => {
      const isStart = index === 0;
      const isEnd = index === mapPoints.length - 1;

      // Цвет метки: зеленый для старта, красный для финиша, синий для промежуточных
      const presetColor = isStart ? 'islands#greenIcon' : isEnd ? 'islands#redIcon' : 'islands#blueIcon';

      const placemark = new ymapsInstance.Placemark(
        point.coordinates,
        {
          balloonContent: `<strong>${point.name}</strong>${point.address ? `<br/>${point.address}` : ''}`,
          iconCaption: point.name
        },
        {
          preset: presetColor,
          iconCaptionMaxWidth: '200',
          opacity: 0.9
        }
      );

      placemarkRefs.current.push(placemark);
      mapInstance.geoObjects.add(placemark);
    });

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
      placemarkRefs.current.forEach(pm => mapInstance?.geoObjects?.remove(pm));
    };
  }, [ymapsInstance, mapInstance, routeSignature]);

  const isEnglish = typeof window !== 'undefined' && window.location.pathname.startsWith('/en');

  return (
    <YMaps query={{ apikey: process.env.NEXT_PUBLIC_YANDEX_API_KEY, load: "package.full", lang: isEnglish ? 'en_US' : 'ru_RU' }}>
      <div className="w-full h-full">
        <style jsx global>{`
          [class*="ymaps"][class*="transport-pin"] {
            display: none !important;
          }
        `}</style>
        <Map
          defaultState={{ center: [55.75, 37.61], zoom: 12 }}
          width="100%"
          height="100%"
          onLoad={setYmapsInstance}
          instanceRef={setMapInstance}
          modules={["multiRouter.MultiRoute", "util.bounds", "Placemark"]}
          options={{ suppressMapOpenBlock: true }}
        />
      </div>
    </YMaps>
  );
}