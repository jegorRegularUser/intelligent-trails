import { useState, useCallback, useEffect, useRef } from 'react';
import { useToast } from '../components/ui/use-toast';
import { useYandexAPI } from './use-yandex-api';
import { Coordinates, RouteData, RoutePoint } from '../types';

export const useYandexMap = () => {
  const { ymaps, isLoaded, error } = useYandexAPI();
  const [map, setMap] = useState<any>(null);
  const [route, setRoute] = useState<any>(null);
  const [isReady, setIsReady] = useState(false);
  const [isRouteLoading, setIsRouteLoading] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const {toast} = useToast();
  const initializedRef = useRef(false);
  const mapInstanceRef = useRef<any>(null); // Храним ссылку на карту

  const defaultCenter = { lat: 55.76, lng: 37.64 };

  useEffect(() => {
    if (!isLoaded || !ymaps || !mapRef.current || initializedRef.current) return;

    const initializeMap = () => {
      if (window.ymaps?.Map && mapRef.current && !mapInstanceRef.current) {
        try {
          const newMap = new ymaps.Map(
            mapRef.current,
            {
              center: [defaultCenter.lat, defaultCenter.lng],
              zoom: 10,
              controls: ['zoomControl', 'fullscreenControl', 'geolocationControl'],
            },
            {
              suppressMapOpenBlock: true,
            }
          );

          mapInstanceRef.current = newMap;
          setMap(newMap);
          setIsReady(true);
          initializedRef.current = true;

          newMap.events.add('click', (e: any) => {
            console.log('Map clicked', e.get('coords'));
          });

          // Устанавливаем cleanup только один раз
          return () => {
            if (newMap && mapInstanceRef.current === newMap) {
              newMap.destroy();
              mapInstanceRef.current = null;
            }
          };
        } catch (err) {
          console.error('Map initialization error:', err);
          toast({
            title: 'Ошибка',
            description: 'Не удалось инициализировать карту',
            variant: 'destructive',
          });
        }
      }
    };

    // Инициализация только при полной готовности API
    if (ymaps && !initializedRef.current) {
      // Добавляем небольшую задержку для гарантии полной загрузки
      const timeoutId = setTimeout(() => {
        if (!initializedRef.current) {
          ymaps.ready(initializeMap);
        }
      }, 100);

      return () => clearTimeout(timeoutId);
    }

    // Cleanup при размонтировании или смене API
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.destroy();
        mapInstanceRef.current = null;
        setMap(null);
        setIsReady(false);
        initializedRef.current = false;
      }
    };
  }, [isLoaded, ymaps, toast]); // Убрали map из зависимостей

  const geocodeAddress = useCallback(
    async (address: string, options?: { results?: number }): Promise<Coordinates | null> => {
      if (!ymaps) return null;
      try {
        const result = await ymaps.geocode(address, { ...options, results: options?.results || 1 });
        if (result.geoObjects.getLength() === 0) {
          return null;
        }
        const coordinates = result.geoObjects.get(0).geometry.getCoordinates();
        return { lat: coordinates[0], lng: coordinates[1] };
      } catch (err) {
        console.error('Geocoding error:', err);
        toast({
          title: 'Ошибка геокодирования',
          description: `Адрес "${address}" не найден`,
          variant: 'destructive',
        });
        return null;
      }
    },
    [ymaps, toast]
  );

  const buildRoute = useCallback(
    async (routeData: RouteData) => {
      if (!map || !ymaps || routeData.points.length < 2) {
        toast({
          title: 'Ошибка',
          description: 'Недостаточно точек для построения маршрута',
          variant: 'destructive',
        });
        return;
      }

      const [startPoint, endPoint] = routeData.points;
      if (!startPoint.address.title || !endPoint.address.title) {
        toast({
          title: 'Ошибка',
          description: 'Укажите адреса начала и конца маршрута',
          variant: 'destructive',
        });
        return;
      }

      setIsRouteLoading(true);
      try {
        // Очищаем предыдущий маршрут
        if (route) {
          map.geoObjects.remove(route);
        }

        let startCoords = startPoint.coordinates.lat
          ? startPoint.coordinates
          : await geocodeAddress(startPoint.address.fullAddress || startPoint.address.title);
        let endCoords = endPoint.coordinates.lat
          ? endPoint.coordinates
          : await geocodeAddress(endPoint.address.fullAddress || endPoint.address.title);

        if (!startCoords || !endCoords) {
          throw new Error('Не удалось определить координаты адресов');
        }

        const multiRoute = new ymaps.multiRouter.MultiRoute(
          {
            referencePoints: [
              [startCoords.lat, startCoords.lng],
              [endCoords.lat, endCoords.lng],
            ],
          },
          {
            routingMode: routeData.options.mode,
            avoidTrafficJams: routeData.options.avoidTraffic || false,
            boundsAutoApply: true,
            routeActiveStrokeColor: '#4285f4',
            routeStrokeColor: '#d9e7ff',
            routePanelMode: 'none',
            suppressBalloons: true,
            suppressMarkers: false,
          }
        );

        map.geoObjects.add(multiRoute);
        setRoute(multiRoute);

        multiRoute.model.events.once('requestsuccess', () => {
          try {
            const activeRoute = multiRoute.getActiveRoute();
            if (activeRoute) {
              const distance = activeRoute.getLength() / 1000;
              const duration = activeRoute.getTime() / 1000 / 60;
              const updatedRouteData: RouteData = {
                ...routeData,
                distance,
                duration,
                path: activeRoute
                  .getPaths()
                  .get(0)
                  .getSegments()
                  .reduce((acc: Coordinates[], segment) => {
                    const coords = segment.getCoordinates();
                    return [
                      ...acc,
                      ...coords.map(([lat, lng]: [number, number]) => ({ lat, lng })),
                    ];
                  }, []),
              };
              toast({
                title: 'Маршрут построен',
                description: `${distance.toFixed(1)} км • ${duration.toFixed(0)} мин`,
              });
              setIsRouteLoading(false);
              // Обновление через callback в useRouteBuilder при необходимости
            }
          } catch (err) {
            console.error('Route processing error:', err);
            setIsRouteLoading(false);
          }
        });

        multiRoute.model.events.once('requestfail', (e: any) => {
          const errorText = e.get('error');
          toast({
            title: 'Ошибка построения маршрута',
            description: errorText || 'Не удалось найти маршрут между указанными точками',
            variant: 'destructive',
          });
          setIsRouteLoading(false);
        });
      } catch (err) {
        console.error('Build route error:', err);
        toast({
          title: 'Ошибка',
          description: 'Не удалось построить маршрут',
          variant: 'destructive',
        });
        setIsRouteLoading(false);
      }
    },
    [map, ymaps, geocodeAddress, toast, route]
  );

  const clearRoute = useCallback(() => {
    if (map && route) {
      map.geoObjects.remove(route);
      setRoute(null);
    }
  }, [map, route]);

  const fitBounds = useCallback((coordinates: Coordinates[]) => {
    if (!map || coordinates.length === 0) return;
    const bounds = coordinates.reduce(
      (bounds, coord) => {
        bounds[0] = Math.min(bounds[0], coord.lat);
        bounds[1] = Math.min(bounds[1], coord.lng);
        bounds[2] = Math.max(bounds[2], coord.lat);
        bounds[3] = Math.max(bounds[3], coord.lng);
        return bounds;
      },
      [Infinity, Infinity, -Infinity, -Infinity]
    );
    map.setBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], {
      checkZoomRange: true,
      zoomMargin: 50,
    });
  }, [map]);

  const addMarker = useCallback(
    (coordinates: Coordinates, options?: { title?: string; description?: string; color?: string }) => {
      if (!map || !ymaps) return null;
      const placemark = new ymaps.Placemark(
        [coordinates.lat, coordinates.lng],
        {
          hintContent: options?.title || '',
          balloonContent: options?.description || '',
        },
        {
          preset: 'islands#icon',
          iconColor: options?.color || '#4285f4',
          draggable: false,
        }
      );
      map.geoObjects.add(placemark);
      return placemark;
    },
    [map, ymaps]
  );

  const clearMap = useCallback(() => {
    if (map) {
      map.geoObjects.removeAll();
      setRoute(null);
    }
  }, [map]);

  return {
    map,
    isReady,
    isRouteLoading,
    error: error || (isLoaded ? null : 'API не загружен'),
    geocodeAddress,
    buildRoute,
    clearRoute,
    addMarker,
    fitBounds,
    clearMap,
    mapRef,
    ymaps,
  };
};
