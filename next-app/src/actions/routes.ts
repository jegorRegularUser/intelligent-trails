// src/actions/routes.ts

'use server';

import { routesRepo } from '@/lib/db/repositories/routes';
import { auth } from '@/lib/auth/config';
import { RouteDocument } from '@/lib/db/schemas';
import { decodeRouteFromUrl } from '@/utils/routeCodec';
import { RouteFilters, SortOption } from '@/types/history';
import { RoutingMode } from '@/types/map';

// Сохранить маршрут
export async function saveRouteAction(data: {
  name: string;
  encodedRoute: string;
  tags?: string[];
}) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  // Проверяем, не сохранен ли уже этот маршрут
  const { routes } = await routesRepo.getUserRoutes(session.user.id, {}, 'date-desc', 1, 0);
  if (routes.length > 0 && routes[0].encodedRoute === data.encodedRoute) {
    return { success: true, routeId: routes[0]._id, isDuplicate: true };
  }

  // Декодируем маршрут для извлечения метаданных
  const decoded = decodeRouteFromUrl(data.encodedRoute);
  if (!decoded) {
    throw new Error('Invalid route data');
  }

  // Извлекаем категории и транспорт
  const categories = decoded.waypoints
    .filter((wp: any) => wp.type === 'category')
    .map((wp: any) => wp.originalCategory || wp.value)
    .filter((cat: any): cat is string => typeof cat === 'string');

  const transportModes = [
    decoded.startTransport,
    ...decoded.waypoints.map((wp: any) => wp.modeToNext),
  ].filter((mode: any): mode is RoutingMode => typeof mode === 'string');

  // Вычисляем метрики из distanceToNext и durationToNext
  let totalDistance = 0;
  let totalDuration = 0;
  let totalStayDuration = 0;
  const byTransport: Record<string, { distance: number; duration: number }> = {};

  // Первый сегмент: от старта до первой точки
  const firstSegmentDistance = decoded.startDistanceToNext || 0;
  const firstSegmentDuration = decoded.startDurationToNext || 0;
  const firstSegmentMode = decoded.startTransport;

  if (firstSegmentDistance > 0 || firstSegmentDuration > 0) {
    totalDistance += firstSegmentDistance;
    totalDuration += firstSegmentDuration;

    if (!byTransport[firstSegmentMode]) {
      byTransport[firstSegmentMode] = { distance: 0, duration: 0 };
    }
    byTransport[firstSegmentMode].distance += firstSegmentDistance;
    byTransport[firstSegmentMode].duration += firstSegmentDuration;
  }

  // Остальные сегменты: от каждой промежуточной точки до следующей
  decoded.waypoints.forEach((wp: any, index: number) => {
    const distance = wp.distanceToNext || 0;
    const duration = wp.durationToNext || 0;
    const stayDuration = wp.stayDuration || 0;
    const mode = wp.modeToNext;

    // Время на месте
    totalStayDuration += stayDuration;

    // Время в пути
    if (distance > 0 || duration > 0) {
      totalDistance += distance;
      totalDuration += duration;

      if (!byTransport[mode]) {
        byTransport[mode] = { distance: 0, duration: 0 };
      }
      byTransport[mode].distance += distance;
      byTransport[mode].duration += duration;
    }
  });

  const placesCount = 1 + decoded.waypoints.length + (decoded.endPoint ? 1 : 0);

  const routeDoc: Omit<RouteDocument, '_id' | 'userId' | 'createdAt' | 'updatedAt'> = {
    name: data.name,
    encodedRoute: data.encodedRoute,
    metrics: {
      totalDistance: Math.round(totalDistance),
      totalDuration: Math.round(totalDuration),
      totalStayDuration: Math.round(totalStayDuration),
      placesCount,
      byTransport,
    },
    startPoint: {
      type: decoded.startPointType || 'address',
      value: decoded.startPointName || 'Начальная точка',
      coords: decoded.startPoint,
    },
    endPoint: {
      type: decoded.endPointType || 'address',
      value: decoded.endPointName || 'Конечная точка',
      coords: decoded.endPoint,
      category: decoded.endPointCategory,
    },
    waypoints: decoded.waypoints.map((wp: any) => ({
      type: wp.type,
      value: wp.value,
      category: wp.originalCategory,
    })),
    categories: Array.from(new Set(categories)),
    transportModes: Array.from(new Set(transportModes)),
    isFavorite: false,
    tags: data.tags || [],
  };

  const routeId = await routesRepo.saveRoute(session.user.id, routeDoc);
  return { success: true, routeId, isDuplicate: false };
}

// Получить маршруты пользователя
export async function getUserRoutesAction(
  filters?: Partial<RouteFilters>,
  sort?: SortOption,
  limit?: number,
  skip?: number
) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  return await routesRepo.getUserRoutes(session.user.id, filters, sort, limit, skip);
}

// Удалить маршрут
export async function deleteRouteAction(routeId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const success = await routesRepo.deleteRoute(routeId, session.user.id);
  return { success };
}

// Переключить избранное
export async function toggleFavoriteAction(routeId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const route = await routesRepo.getRoute(routeId, session.user.id);
  if (!route) {
    throw new Error('Route not found');
  }

  const success = await routesRepo.updateRoute(routeId, session.user.id, {
    isFavorite: !route.isFavorite,
  });

  return { success, isFavorite: !route.isFavorite };
}

// Обновить маршрут
export async function updateRouteAction(
  routeId: string,
  updates: { name?: string; tags?: string[] }
) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const success = await routesRepo.updateRoute(routeId, session.user.id, updates);
  return { success };
}

// Получить статистику пользователя
export async function getUserStatsAction() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  return await routesRepo.getUserStats(session.user.id);
}

// Получить один маршрут
export async function getRouteAction(routeId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const route = await routesRepo.getRoute(routeId, session.user.id);
  if (!route) {
    throw new Error('Route not found');
  }

  return route;
}
