// src/store/useQuickWalkMapStore.ts
// Отдельный мини-стор быстрой прогулки: RouteMap (эксперт-зона) читает только его
// и рисует полилинию — прямой связи между движком прогулки и картой нет.
import { create } from 'zustand';

interface QuickWalkMapState {
  /** Есть ли активная прогулка для отрисовки. */
  isActive: boolean;
  /** Полная полилиния [lat,lng]: старт + все леги. */
  geometry: [number, number][];
  /** Имя стартовой точки для балуны. */
  startName: string;
  /** Меняется при каждой новой прогулке — триггер автофита карты. */
  fitNonce: number;
  setWalk: (geometry: [number, number][], startName: string) => void;
  clear: () => void;
}

export const useQuickWalkMapStore = create<QuickWalkMapState>((set) => ({
  isActive: false,
  geometry: [],
  startName: '',
  fitNonce: 0,
  setWalk: (geometry, startName) =>
    set((prev) => ({ isActive: true, geometry, startName, fitNonce: prev.fitNonce + 1 })),
  clear: () => set({ isActive: false, geometry: [], startName: '', fitNonce: 0 }),
}));
