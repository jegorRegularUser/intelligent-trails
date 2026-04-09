// src/store/useRouteStore.ts
import { create } from 'zustand';
import { Coordinates, RoutingMode, PlaceOfInterest } from '@/types/map';

export interface MapRoutePoint {
  coordinates: Coordinates;
  modeToNext: RoutingMode;
  name: string;
  address?: string; // Добавлено
  alternatives?: PlaceOfInterest[]; // Добавлено для синхронизации
  selectedAlternativeIndex?: number;
  distanceToNext?: number;
  durationToNext?: number;
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
}

interface RouteState {
  isRouteBuilt: boolean;
  setIsRouteBuilt: (val: boolean) => void;
  startPoint: Coordinates | null;
  startTransport: RoutingMode;
  waypoints: FormWaypoint[];
  endPoint: Coordinates | null;
  endPointType: "address" | "category" | "map";
  endPointCategory: string;

  setStartPoint: (coords: Coordinates | null) => void;
  setStartTransport: (mode: RoutingMode) => void;
  setWaypoints: (waypoints: FormWaypoint[] | ((prev: FormWaypoint[]) => FormWaypoint[])) => void;
  setEndPoint: (coords: Coordinates | null) => void;
  setEndPointType: (type: "address" | "category" | "map") => void;
  setEndPointCategory: (cat: string) => void;

  mapPoints: MapRoutePoint[];
  setMapPoints: (points: MapRoutePoint[]) => void;
}

export const useRouteStore = create<RouteState>((set) => ({
  isRouteBuilt: false,
  setIsRouteBuilt: (val) => set({ isRouteBuilt: val }),
  startPoint: null,
  startTransport: "pedestrian",
  waypoints: [],
  endPoint: null,
  endPointType: "address",
  endPointCategory: "",
  setStartPoint: (coords) => set({ startPoint: coords }),
  setStartTransport: (mode) => set({ startTransport: mode }),
  setWaypoints: (updater) => set((state) => ({
    waypoints: typeof updater === 'function' ? updater(state.waypoints) : updater
  })),
  setEndPoint: (coords) => set({ endPoint: coords }),
  setEndPointType: (type) => set({ endPointType: type }),
  setEndPointCategory: (cat) => set({ endPointCategory: cat }),
  mapPoints: [],
  setMapPoints: (points) => set({ mapPoints: points }),
}));