// src/lib/db/schemas.ts

import { Coordinates, RoutingMode } from "@/types/map";

// ============= USERS COLLECTION =============
export interface User {
  _id: string; // MongoDB ObjectId или OAuth provider ID
  email: string;
  name?: string;
  avatar?: string;

  // OAuth данные
  provider: "google" | "github" | "yandex";
  providerId: string; // ID от провайдера

  // Настройки
  preferences: {
    locale: "ru" | "en";
    mapLocale?: "ru" | "en"; // Язык карты (если не указан, используется locale)
    useCustomMapLocale?: boolean; // Включить раздельный язык карты
    distanceUnit?: "km" | "mi"; // Единицы измерения (по умолчанию km)
    defaultTransport: RoutingMode;
    theme?: "light" | "dark";
  };

  // Метаданные
  createdAt: Date;
  lastLoginAt: Date;
}

// ============= ROUTES COLLECTION =============
export interface RouteDocument {
  _id: string; // MongoDB ObjectId
  userId: string; // Ссылка на User._id

  // Основные данные
  name: string;
  encodedRoute: string; // Сжатый Base64 маршрут

  // Метрики (денормализация для быстрых запросов)
  metrics: {
    totalDistance: number; // метры
    totalDuration: number; // минуты (время в пути)
    totalStayDuration: number; // минуты (время на местах)
    placesCount: number;
    byTransport: {
      pedestrian?: { distance: number; duration: number };
      bicycle?: { distance: number; duration: number };
      auto?: { distance: number; duration: number };
      masstransit?: { distance: number; duration: number };
    };
  };

  // Точки маршрута (денормализация для фильтрации)
  startPoint: {
    type: "address" | "map";
    value: string; // адрес или "Точка на карте"
    coords: Coordinates;
  };

  endPoint: {
    type: "address" | "category" | "map";
    value: string;
    coords?: Coordinates;
    category?: string;
  };

  waypoints: Array<{
    type: "address" | "category" | "map";
    value: string;
    category?: string;
  }>;

  // Для фильтрации и поиска
  categories: string[]; // ['cafe', 'park'] - извлекаем из waypoints
  transportModes: RoutingMode[]; // ['pedestrian', 'auto']

  // Пользовательские метки
  isFavorite: boolean;
  tags: string[]; // ['выходные', 'с детьми', 'романтика']

  // Метаданные
  createdAt: Date;
  updatedAt: Date;
}
