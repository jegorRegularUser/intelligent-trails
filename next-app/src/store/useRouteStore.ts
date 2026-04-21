// src/store/useRouteStore.ts
import { create } from 'zustand';
import { Coordinates, RoutingMode, PlaceOfInterest, TransportAlternative } from '@/types/map';

export interface MapRoutePoint {
  coordinates: Coordinates;
  modeToNext: RoutingMode;
  name: string;
  address?: string;
  alternatives?: PlaceOfInterest[];
  selectedAlternativeIndex?: number;
  stayDuration?: number; // Время пребывания на месте (минуты)
  distanceToNext?: number;
  durationToNext?: number;
  transportAlternatives?: TransportAlternative[]; // Альтернативные маршруты транспорта (только для информации)
}

export interface FormWaypoint {
  id: string;
  type: "address" | "category" | "map";
  value: string;
  coords?: Coordinates;
  duration: number;
  modeToNext: RoutingMode;
  alternatives?: PlaceOfInterest[];
  selectedAlternativeIndex?: number;
  address?: string;
  originalCategory?: string;
  resolvedName?: string;
  distanceToNext?: number; // Расстояние до следующей точки (от Яндекса)
  durationToNext?: number; // Время до следующей точки (от Яндекса)
}

interface RouteState {
  isRouteBuilt: boolean;
  setIsRouteBuilt: (val: boolean) => void;
  startPoint: Coordinates | null;
  startPointName: string | null;
  startPointType: "address" | "map";
  startTransport: RoutingMode;
  waypoints: FormWaypoint[];
  endPoint: Coordinates | null;
  endPointName: string | null;
  endPointType: "address" | "category" | "map";
  endPointCategory: string;

  setStartPoint: (coords: Coordinates | null) => void;
  setStartPointName: (name: string | null) => void;
  setStartPointType: (type: "address" | "map") => void;
  setStartTransport: (mode: RoutingMode) => void;
  setWaypoints: (waypoints: FormWaypoint[] | ((prev: FormWaypoint[]) => FormWaypoint[])) => void;
  setEndPoint: (coords: Coordinates | null) => void;
  setEndPointName: (name: string | null) => void;
  setEndPointType: (type: "address" | "category" | "map") => void;
  setEndPointCategory: (cat: string) => void;

  mapPoints: MapRoutePoint[];
  setMapPoints: (points: MapRoutePoint[]) => void;

  // Map picker state
  isMapPickerActive: boolean;
  mapPickerTarget: string | null; // 'start' | waypoint.id | 'end'
  setMapPickerActive: (active: boolean, target?: string | null) => void;

  // User location
  userLocation: Coordinates | null;
  setUserLocation: (coords: Coordinates | null) => void;
}

export const useRouteStore = create<RouteState>((set) => ({
  isRouteBuilt: false,
  setIsRouteBuilt: (val) => set({ isRouteBuilt: val }),
  startPoint: null,
  startPointName: null,
  startPointType: "address",
  startTransport: "pedestrian",
  waypoints: [],
  endPoint: null,
  endPointName: null,
  endPointType: "address",
  endPointCategory: "",
  setStartPoint: (coords) => set({ startPoint: coords }),
  setStartPointName: (name) => set({ startPointName: name }),
  setStartPointType: (type) => set({ startPointType: type }),
  setStartTransport: (mode) => set({ startTransport: mode }),
  setWaypoints: (updater) => set((state) => ({
    waypoints: typeof updater === 'function' ? updater(state.waypoints) : updater
  })),
  setEndPoint: (coords) => set({ endPoint: coords }),
  setEndPointName: (name) => set({ endPointName: name }),
  setEndPointType: (type) => set({ endPointType: type }),
  setEndPointCategory: (cat) => set({ endPointCategory: cat }),
  mapPoints: [],
  setMapPoints: (points) => set({ mapPoints: points }),
  isMapPickerActive: false,
  mapPickerTarget: null,
  setMapPickerActive: (active, target = null) => set({ isMapPickerActive: active, mapPickerTarget: target }),
  userLocation: null,
  setUserLocation: (coords) => set({ userLocation: coords }),
}));