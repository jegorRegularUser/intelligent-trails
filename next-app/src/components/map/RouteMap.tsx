// src/components/map/RouteMap.tsx
"use client";

import { useEffect, useState, useRef } from "react";
import { YMaps, Map } from "@pbe/react-yandex-maps";
import { useLocale, useTranslations } from "next-intl";
import { useRouteStore } from "@/store/useRouteStore";
import { reverseGeocode } from "@/actions/geocoder";
import { usePreferences } from "@/contexts/PreferencesContext";
import { Coordinates } from "@/types/map";

export function RouteMap() {
  const locale = useLocale();
  const { mapLocale } = usePreferences();
  const t = useTranslations("Map");
  const [ymapsInstance, setYmapsInstance] = useState<any>(null);
  const [mapInstance, setMapInstance] = useState<any>(null);
  const routeRefs = useRef<any[]>([]);
  const placemarkRefs = useRef<any[]>([]);
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);

  const {
    mapPoints, setMapPoints,
    isMapPickerActive, mapPickerTarget, setMapPickerActive,
    setStartPoint, setStartPointName, setEndPoint, setEndPointName, waypoints, setWaypoints,
    setUserLocation: setStoreUserLocation
  } = useRouteStore();

  // Получаем геолокацию пользователя при монтировании
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords: Coordinates = [position.coords.latitude, position.coords.longitude];
          setUserLocation(coords);
          setStoreUserLocation(coords);

          // Центрируем карту на позиции пользователя, если нет маршрута
          if (mapInstance && mapPoints.length === 0) {
            mapInstance.setCenter(coords, 13, { duration: 500 });
          }
        },
        (error) => {
          console.log('Geolocation error:', error.message);
          // Используем дефолтную позицию (Москва)
        },
        {
          enableHighAccuracy: false,
          timeout: 5000,
          maximumAge: 300000 // Кэшируем на 5 минут
        }
      );
    }
  }, [mapInstance, mapPoints.length, setStoreUserLocation]);

  // Добавляем метку геолокации пользователя на карту
  useEffect(() => {
    if (!ymapsInstance || !mapInstance || !userLocation || mapPoints.length > 0) return;

    const userPlacemark = new ymapsInstance.Placemark(
      userLocation,
      {
        iconCaption: t('youAreHere')
      },
      {
        preset: 'islands#blueCircleDotIcon',
        iconCaptionMaxWidth: '100'
      }
    );

    mapInstance.geoObjects.add(userPlacemark);

    return () => {
      mapInstance.geoObjects.remove(userPlacemark);
    };
  }, [ymapsInstance, mapInstance, userLocation, mapPoints.length, t]);

  // Signature для useEffect: реагируем только на изменение координат или режима
  // selectedTransportAlternativeIndex НЕ включаем, т.к. переключение маршрутов
  // для masstransit не поддерживается Yandex API
  const routeSignature = JSON.stringify(
    mapPoints.map(p => ({ c: p.coordinates, m: p.modeToNext }))
  );

  // Обработчик клика по карте для выбора точки
  useEffect(() => {
    if (!mapInstance || !isMapPickerActive) return;

    const handleMapClick = async (e: any) => {
      try {
        const coords: Coordinates = e.get('coords');
        console.log('Map clicked, coords:', coords, 'target:', mapPickerTarget);

        // Получаем информацию о месте через reverse geocoding
        const { name, address } = await reverseGeocode(coords);
        console.log('Geocoded:', { name, address });

        // Сохраняем выбранную точку в зависимости от target
        if (mapPickerTarget === 'start') {
          setStartPoint(coords);
          setStartPointName(address || name);
          console.log('Set start point:', coords, address || name);
        } else if (mapPickerTarget === 'end') {
          setEndPoint(coords);
          setEndPointName(address || name);
          console.log('Set end point:', coords, address || name);
        } else {
          // Это waypoint - обновляем с полными данными геокодирования
          setWaypoints(prev => prev.map(wp =>
            wp.id === mapPickerTarget
              ? {
                  ...wp,
                  type: 'address' as const,
                  coords,
                  value: address || name,
                  address: address || name,
                  resolvedName: name
                }
              : wp
          ));
          console.log('Set waypoint:', mapPickerTarget, address || name);
        }

        // Выключаем режим выбора
        setMapPickerActive(false);
      } catch (error) {
        console.error('Error in map click handler:', error);
      }
    };

    mapInstance.events.add('click', handleMapClick);

    return () => {
      mapInstance.events.remove('click', handleMapClick);
    };
  }, [mapInstance, isMapPickerActive, mapPickerTarget, setStartPoint, setStartPointName, setEndPoint, setEndPointName, setWaypoints, setMapPickerActive]);

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

      // ВАЖНО: Yandex Maps API не поддерживает переключение активного маршрута
      // для режима masstransit. Карта всегда показывает оптимальный (первый) маршрут.
      // Селектор альтернатив служит для информирования пользователя о других вариантах.

      // ПОЛУЧЕНИЕ РЕАЛЬНЫХ ДАННЫХ ОТ ЯНДЕКСА
      routeSegment.model.events.add("update", () => {
        const activeRoute = routeSegment.getActiveRoute();
        if (activeRoute) {
          const properties = activeRoute.properties;
          const distance = properties.get("distance").value;
          const duration = properties.get("duration").value;

          // Собираем альтернативные маршруты для masstransit
          let transportAlternatives: any[] | undefined;
          if (currentPoint.modeToNext === 'masstransit') {
            const routes = routeSegment.getRoutes();
            transportAlternatives = [];

            routes.each((route: any, routeIndex: number) => {
              const routeProps = route.properties.getAll();
              const paths = route.getPaths();

              const allTransports: any[] = [];
              const segments: any[] = [];

              paths.each((path: any) => {
                const pathSegments = path.getSegments();
                pathSegments.each((seg: any) => {
                  const segProps = seg.properties.getAll();

                  if (segProps.type === 'transport' && segProps.transports) {
                    allTransports.push(...segProps.transports);
                    segments.push({
                      type: 'transport',
                      duration: segProps.duration?.value || 0,
                      distance: segProps.distance?.value || 0,
                      transports: segProps.transports
                    });
                  } else if (segProps.type === 'walk') {
                    segments.push({
                      type: 'walk',
                      duration: segProps.duration?.value || 0,
                      distance: segProps.distance?.value || 0
                    });
                  }
                });
              });

              transportAlternatives!.push({
                routeIndex,
                duration: routeProps.duration?.value || 0,
                distance: routeProps.distance?.value || 0,
                transports: allTransports,
                segments
              });
            });
          }

          // Обновляем store только если данные изменились
          if (newMapPoints[i].distanceToNext !== distance ||
              newMapPoints[i].durationToNext !== duration ||
              (transportAlternatives && !newMapPoints[i].transportAlternatives)) {
            newMapPoints[i] = {
              ...newMapPoints[i],
              distanceToNext: distance,
              durationToNext: duration,
              transportAlternatives
            };
            setMapPoints([...newMapPoints]);

            // ВАЖНО: Обновляем waypoints с метриками для сохранения в URL
            setWaypoints(current => {
              const updated = [...current];
              if (updated[i]) {
                updated[i] = {
                  ...updated[i],
                  distanceToNext: distance,
                  durationToNext: duration
                };
              }
              return updated;
            });
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

  return (
    <YMaps query={{
      apikey: process.env.NEXT_PUBLIC_YANDEX_API_KEY,
      load: "package.full",
      lang: mapLocale === 'en' ? 'en_US' : 'ru_RU'
    }}>
      <div className="w-full h-full">
        <Map
          defaultState={{
            center: [55.75, 37.61],
            zoom: 12,
            controls: [] // Убираем все дефолтные контролы
          }}
          width="100%"
          height="100%"
          onLoad={setYmapsInstance}
          instanceRef={setMapInstance}
          modules={["multiRouter.MultiRoute", "util.bounds", "Placemark"]}
          options={{
            suppressMapOpenBlock: true, // Убирает кнопку "Открыть в Яндекс.Картах"
            suppressObsoleteBrowserNotifier: true // Убирает уведомление о старом браузере
          }}
        />
        <style jsx global>{`
          [class*="ymaps"][class*="transport-pin"] {
            display: none !important;
          }
        `}</style>
      </div>
    </YMaps>
  );
}