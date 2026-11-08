// src/store/useQuickWalkMapStore.ts
// Отдельный мини-стор быстрой прогулки: RouteMap (эксперт-зона) читает только его
// и рисует полилинию + пины остановок — прямой связи между движком прогулки
// и картой нет.
import { create } from 'zustand';

export interface QuickWalkStopPin {
  id: string;
  name: string;
  kind: string;
  coords: [number, number];
  /** Причина якоря из движка — слот «почему сюда» карточки. */
  reason?: string;
}

interface QuickWalkMapState {
  /** Есть ли активная прогулка для отрисовки. */
  isActive: boolean;
  /** Полная полилиния [lat,lng]: старт + все леги. */
  geometry: [number, number][];
  /** Имя стартовой точки для балуны. */
  startName: string;
  /** Остановки — пины с богатыми карточками на карте. */
  stops: QuickWalkStopPin[];
  /** Меняется при каждой новой прогулке — триггер автофита карты. */
  fitNonce: number;
  setWalk: (geometry: [number, number][], startName: string, stops?: QuickWalkStopPin[]) => void;
  clear: () => void;
}

export const useQuickWalkMapStore = create<QuickWalkMapState>((set) => ({
  isActive: false,
  geometry: [],
  startName: '',
  stops: [],
  fitNonce: 0,
  setWalk: (geometry, startName, stops = []) =>
    set((prev) => ({ isActive: true, geometry, startName, stops, fitNonce: prev.fitNonce + 1 })),
  clear: () => set({ isActive: false, geometry: [], startName: '', stops: [], fitNonce: 0 }),
}));
