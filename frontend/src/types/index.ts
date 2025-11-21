export interface Coordinates {
  lat: number;
  lng: number;
}

export interface Address {
  title: string;
  subtitle?: string;
  fullAddress?: string;
  coordinates?: Coordinates;
  boundedBy?: [[number, number], [number, number]];
}

export interface RoutePoint {
  address: Address;
  coordinates: Coordinates;
}

export interface RouteOptions {
  mode: 'driving' | 'walking' | 'transit';
  avoidTraffic?: boolean;
}

export interface RouteData {
  points: RoutePoint[];
  options: RouteOptions;
  distance?: number;
  duration?: number;
  path?: Coordinates[];
}

export interface Preferences {
  interests: string[];
  timeLimit: number;
  groupSize: number;
  budget: number;
}

export interface MapState {
  center: Coordinates;
  zoom: number;
}