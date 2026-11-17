// src/store/useQuickWalkMapStore.ts
// Отдельный мини-стор быстрой прогулки: карта (MapCanvas/RouteMap) читает только его
// и рисует линию + пины остановок — прямой связи между движком прогулки
// и картой нет.
//
// Контракт диф-апдейта карты (docs/ux-human-wave.md F1): стор разделяет ДАННЫЕ
// (geometry, stops, start) и СИГНАЛ КАМЕРЫ (fitNonce). setWalk инкрементит
// fitNonce только когда просят камеру ({fit:true} — новая прогулка/новая сборка);
// листание вариантов и замена остановки приходят с {fit:false} — карта диффит
// пины по stop.id и линию через source.setData, камеру не трогает (ленивый
// рефит решает MapCanvas по границам).
import { create } from 'zustand';

export interface QuickWalkStopPin {
  id: string;
  name: string;
  kind: string;
  coords: [number, number];
  /** Причина якоря из движка — слот «почему сюда» карточки пина. */
  reason?: string;
  /** Минуты на месте — чип карточки пина (M5, ключ Places.stayMinutes). */
  stayMin?: number;
  /** Часы работы OSM — бейдж «открыто/закрыто» в карточке пина (lib/places/hours). */
  openingHours?: string;
}

/** Building-фаза (M1/S1): центр и радиус пунктирной петли, пока идёт сборка. */
export interface QuickWalkBuildingZone {
  start: [number, number];
  radiusMeters: number;
}

interface QuickWalkMapState {
  /** Есть ли активная прогулка для отрисовки. */
  isActive: boolean;
  /** Полная полилиния [lat,lng]: старт + все леги. */
  geometry: [number, number][];
  /** Стартовая точка прогулки — гидрация ?w= и «Идти» берут её отсюда. */
  start: [number, number] | null;
  /** Имя стартовой точки для пина. */
  startName: string;
  /** Остановки — пины с богатыми карточками на карте. */
  stops: QuickWalkStopPin[];
  /** Меняется только при новой прогулке/сборке — сигнал камеры автофита. */
  fitNonce: number;
  /** Пунктирная окружность зоны поиска на время building (M1); вне сборки — null. */
  building: QuickWalkBuildingZone | null;
  setWalk: (
    geometry: [number, number][],
    startName: string,
    stops?: QuickWalkStopPin[],
    opts?: { fit?: boolean },
  ) => void;
  setBuilding: (building: QuickWalkBuildingZone | null) => void;
  clear: () => void;
}

export const useQuickWalkMapStore = create<QuickWalkMapState>((set) => ({
  isActive: false,
  geometry: [],
  start: null,
  startName: '',
  stops: [],
  fitNonce: 0,
  building: null,
  setWalk: (geometry, startName, stops = [], opts) =>
    set((prev) => ({
      isActive: true,
      geometry,
      start: geometry[0] ?? prev.start,
      startName,
      stops,
      // Сигнал камеры: по умолчанию новая прогулка/сборка (fit), листание
      // вариантов и замена остановки приходят с {fit:false} (F1) и nonce
      // не трогают — карта обновляется диффом без пересоздания пинов.
      fitNonce: (opts?.fit ?? true) ? prev.fitNonce + 1 : prev.fitNonce,
      building: null,
    })),
  setBuilding: (building) => set({ building }),
  clear: () =>
    set({ isActive: false, geometry: [], start: null, startName: '', stops: [], fitNonce: 0, building: null }),
}));
