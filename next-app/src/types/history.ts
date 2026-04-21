import { RoutingMode } from "./map";

export interface RoutePoint {
  type: "address" | "category";
  value: string; // адрес или название категории
  category?: string; // если type === "category"
}

export interface SavedRoute {
  id: string;
  name: string;
  createdAt: string; // ISO date
  updatedAt: string;
  isFavorite: boolean;
  tags: string[];
  encodedRoute: string; // параметр ?r=...

  // Метрики (кешируем для быстрого отображения)
  metrics: {
    totalDistance: number; // метры
    totalDuration: number; // минуты (время в пути)
    totalStayDuration: number; // минуты (время на местах)
    placesCount: number; // общее количество точек (включая старт и финиш)
    byTransport: {
      pedestrian?: { distance: number; duration: number };
      bicycle?: { distance: number; duration: number };
      auto?: { distance: number; duration: number };
      masstransit?: { distance: number; duration: number };
    };
  };

  // Информация о точках маршрута
  startPoint: RoutePoint;
  endPoint: RoutePoint;
  waypoints: RoutePoint[]; // промежуточные точки

  // Для фильтрации
  categories: string[]; // ['cafe', 'park']
  transportModes: RoutingMode[]; // ['pedestrian', 'auto']
}

export interface RouteFilters {
  search: string;
  categories: string[];
  transportModes: RoutingMode[];
  distanceRange: [number, number]; // км
  durationRange: [number, number]; // минуты
  showFavorites: boolean;
}

export type SortOption =
  | 'date-desc'
  | 'date-asc'
  | 'name-asc'
  | 'name-desc'
  | 'distance-asc'
  | 'distance-desc'
  | 'duration-asc'
  | 'duration-desc';
