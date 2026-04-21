import { useEffect, useRef } from 'react';
import { useRouteStore } from '@/store/useRouteStore';
import { encodeRouteToUrl } from '@/utils/routeCodec';

/**
 * Хук для автоматической синхронизации URL с состоянием маршрута
 * Обновляет URL когда Яндекс возвращает метрики (distance, duration)
 */
export function useRouteUrlSync() {
  const {
    isRouteBuilt,
    startPoint,
    startPointName,
    startTransport,
    waypoints,
    endPoint,
    endPointName,
    endPointType,
    endPointCategory,
    mapPoints
  } = useRouteStore();

  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  useEffect(() => {
    // Синхронизируем только если маршрут построен
    if (!isRouteBuilt) return;

    // Дебаунс: обновляем URL через 500мс после последнего изменения
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      const routeData = {
        startPoint,
        startPointName: mapPoints[0]?.name || startPointName,
        startPointAddress: mapPoints[0]?.address,
        startTransport,
        waypoints: waypoints.map((wp, index) => ({
          ...wp,
          distanceToNext: mapPoints[index + 1]?.distanceToNext,
          durationToNext: mapPoints[index + 1]?.durationToNext,
        })),
        endPoint,
        endPointName: mapPoints[mapPoints.length - 1]?.name || endPointName,
        endPointAddress: mapPoints[mapPoints.length - 1]?.address,
        endPointType,
        endPointCategory,
      };

      const encoded = encodeRouteToUrl(routeData);
      const currentUrl = new URL(window.location.href);
      const currentParam = currentUrl.searchParams.get('r');

      // Обновляем только если URL изменился
      if (currentParam !== encoded) {
        window.history.replaceState(null, '', `?r=${encoded}`);
      }
    }, 500);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isRouteBuilt, mapPoints, waypoints, startPoint, startPointName, startTransport, endPoint, endPointName, endPointType, endPointCategory]);
}
