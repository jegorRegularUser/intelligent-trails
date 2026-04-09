export type Coordinates = [number, number];
export type RoutingMode = "auto" | "pedestrian" | "bicycle" | "masstransit";

export interface PlaceOfInterest {
  id: number;
  name: string;
  category: string;
  coordinates: Coordinates;
  address?: string;
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