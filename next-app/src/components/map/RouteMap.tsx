// src/components/map/RouteMap.tsx
"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { YMaps, Map } from "@pbe/react-yandex-maps";
import { useLocale, useTranslations } from "next-intl";
import { useRouteStore } from "@/store/useRouteStore";
import { useQuickWalkMapStore } from "@/store/useQuickWalkMapStore";
import { reverseGeocode } from "@/actions/geocoder";
import { usePreferences } from "@/contexts/PreferencesContext";
import { Coordinates } from "@/types/map";
import { getKindInfo, type PlaceCard as PlaceCardData } from "@/lib/places";
import { PlaceMiniCard } from "@/components/places/PlaceMiniCard";

/** Пин остановки → богатая карточка места (словарь kind-ов, часы — unknown). */
function buildWalkStopCard(
  stop: { name: string; kind: string; reason?: string },
  locale: string,
): PlaceCardData {
  const info = getKindInfo(stop.kind);
  return {
    kind: stop.kind,
    kindLabel: locale === "en" ? info.en : info.ru,
    icon: info.icon,
    name: stop.name,
    displayName: stop.name,
    openState: "unknown",
  };
}

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
      zoomMargin: [50, 50, 50, window.innerWidth > 768 ? 450 : 120],
      duration: 500
    });

    return () => {
      routeRefs.current.forEach(route => mapInstance?.geoObjects?.remove(route));
      placemarkRefs.current.forEach(pm => mapInstance?.geoObjects?.remove(pm));
    };
  }, [ymapsInstance, mapInstance, routeSignature]);

  // --- Быстрая прогулка: полилиния из отдельного стора.
  // Эксперт-зона не знает о движке прогулки: RouteMap читает только этот стор.
  // Приоритет за эксперт-режимом: пока есть mapPoints, полилиния не рисуем.
  const quickWalk = useQuickWalkMapStore();
  const qwSignature = `${quickWalk.fitNonce}:${quickWalk.geometry.length}:${mapPoints.length}`;
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  // Выбранная остановка: богатая карточка места, якоренная к пину
  const [activeStop, setActiveStop] = useState<{
    card: PlaceCardData;
    anchor: { x: number; y: number };
    coords: [number, number];
  } | null>(null);

  // Проекция координат в пиксели контейнера карты (для якоря карточки)
  const projectToContainer = useCallback((coords: [number, number]) => {
    if (!mapInstance || !mapContainerRef.current) return null;
    try {
      const projection = mapInstance.options.get("projection");
      const zoom = mapInstance.getZoom();
      const globalPixel = projection.toGlobalPixels(coords, zoom);
      const page = mapInstance.converter.globalToPage(globalPixel);
      const rect = mapContainerRef.current.getBoundingClientRect();
      return { x: Math.round(page[0] - rect.left), y: Math.round(page[1] - rect.top) };
    } catch {
      return null;
    }
  }, [mapInstance]);

  useEffect(() => {
    if (!ymapsInstance || !mapInstance) return;
    if (!quickWalk.isActive || quickWalk.geometry.length < 2) return;
    if (mapPoints.length > 0) return; // эксперт-маршрут занимает карту

    const polyline = new ymapsInstance.Polyline(
      quickWalk.geometry,
      { hintContent: null },
      { strokeColor: "#10b981", strokeWidth: 5, strokeOpacity: 0.9, strokeStyle: "solid" }
    );
    const startPlacemark = new ymapsInstance.Placemark(
      quickWalk.geometry[0],
      {
        iconCaption: quickWalk.startName || "Старт",
        balloonContent: `<strong>Старт прогулки</strong>`,
      },
      { preset: "islands#greenDotIcon", iconCaptionMaxWidth: "200" }
    );

    mapInstance.geoObjects.add(polyline);
    mapInstance.geoObjects.add(startPlacemark);

    // Пины остановок: клик открывает богатую карточку места у пина
    const stopPlacemarks: any[] = [];
    for (const stop of quickWalk.stops) {
      const placemark = new ymapsInstance.Placemark(
        stop.coords,
        {
          iconCaption: stop.name,
          balloonContent: `<strong>${stop.name}</strong>`,
        },
        { preset: "islands#blueCircleDotIcon", iconCaptionMaxWidth: "160" }
      );
      placemark.events.add("click", () => {
        const anchor = projectToContainer(stop.coords);
        if (!anchor) return;
        setActiveStop({ card: buildWalkStopCard(stop, locale), anchor, coords: stop.coords });
      });
      stopPlacemarks.push(placemark);
      mapInstance.geoObjects.add(placemark);
    }

    // Движение/зум: якорь открытой карточки следует за пином
    const onBoundsChange = () => {
      setActiveStop((prev) => {
        if (!prev) return prev;
        const anchor = projectToContainer(prev.coords);
        return anchor ? { ...prev, anchor } : prev;
      });
    };
    mapInstance.events.add("boundschange", onBoundsChange);

    // Автофит: полилиния может быть далеко от центра карты по умолчанию
    const bounds = ymapsInstance.util.bounds.fromPoints(quickWalk.geometry);
    mapInstance.setBounds(bounds, {
      checkZoomRange: true,
      zoomMargin: [60, 60, 60, window.innerWidth > 768 ? 460 : 60],
      duration: 500
    });

    return () => {
      mapInstance.geoObjects.remove(polyline);
      mapInstance.geoObjects.remove(startPlacemark);
      for (const pm of stopPlacemarks) mapInstance.geoObjects.remove(pm);
      mapInstance.events.remove("boundschange", onBoundsChange);
    };
  }, [ymapsInstance, mapInstance, qwSignature, quickWalk.isActive, quickWalk.startName, quickWalk.stops, locale, projectToContainer]);

  // Новая прогулка — закрываем открытую карточку
  useEffect(() => {
    setActiveStop(null);
  }, [quickWalk.fitNonce]);

  return (
    <YMaps query={{
      apikey: process.env.NEXT_PUBLIC_YANDEX_API_KEY,
      load: "package.full",
      lang: mapLocale === 'en' ? 'en_US' : 'ru_RU'
    }}>
      <div ref={mapContainerRef} className="relative w-full h-full">
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
          modules={["multiRouter.MultiRoute", "util.bounds", "Placemark", "Polyline"]}
          options={{
            suppressMapOpenBlock: true, // Убирает кнопку "Открыть в Яндекс.Картах"
            suppressObsoleteBrowserNotifier: true // Убирает уведомление о старом браузере
          }}
        />
        {/* Карточка выбранной остановки прогулки — богатый вариант, якорь к пину */}
        {activeStop && (
          <PlaceMiniCard
            card={activeStop.card}
            anchor={activeStop.anchor}
            containerRef={mapContainerRef}
            variant="full"
            onExpand={() => setActiveStop(null)}
          />
        )}
      </div>
    </YMaps>
  );
}