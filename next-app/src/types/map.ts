export type Coordinates = [number, number];
export type RoutingMode = "auto" | "pedestrian" | "bicycle" | "masstransit";

export interface PlaceOfInterest {
  id: number;
  name: string;
  category: string;
  coordinates: Coordinates;
  address?: string;
  // Метаданные для ранжирования
  rating?: number; // 0-5 из OSM tags
  size?: number; // Площадь в м² (для парков) или вместимость
  popularity?: number; // Количество отзывов/упоминаний
  tags?: Record<string, string>; // Все OSM теги для анализа
  qualityScore?: number; // Итоговый балл качества (0-100)
}

export interface TransportOption {
  id: string;
  name: string; // Номер маршрута (1, 22, 43, э31)
  type: string; // bus, tram, metro, trolleybus
}

export interface TransportAlternative {
  routeIndex: number; // Индекс альтернативного маршрута от Yandex
  duration: number; // Общее время в секундах
  distance: number; // Общее расстояние в метрах
  transports: TransportOption[]; // Доступные варианты транспорта
  segments: Array<{
    type: 'walk' | 'transport';
    duration: number;
    distance: number;
    transports?: TransportOption[];
  }>;
}

export interface RouteStep {
  id: string;
  type: "point" | "category";
  modeToNext: RoutingMode;
  selectedCoords: Coordinates;
  alternatives?: PlaceOfInterest[];
  stayDuration: number;
  travelMetrics?: TravelMetrics;
}

export interface TravelMetrics {
  distance: number; // в метрах
  duration: number; // в секундах
}