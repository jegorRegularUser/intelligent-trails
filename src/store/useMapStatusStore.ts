// src/store/useMapStatusStore.ts
// Здоровье канвы карты главного сценария (docs/ux-human-wave.md M7):
//   - 'webgl'  — WebGL недоступен/потерян: карта не рендерится вообще, панель
//                прогулки разворачивается на весь экран (таймлайн-первый режим);
//   - 'tiles'  — тайлы не загрузились: серая канва + плашка «Карта недоступна»,
//                прогулка продолжается по таймлайну (движок от карты не зависит).
// Стор общий для панели и карты, потому что шторка (RoutePanel) и канва
// (MapCanvas) не состоят в отношениях родитель/ребёнок.
import { create } from 'zustand';

export type MapHealthStatus = 'ok' | 'tiles' | 'webgl';

interface MapStatusState {
  status: MapHealthStatus;
  setStatus: (status: MapHealthStatus) => void;
  /** Успешно созданная канва снова переводит статус в ok (retry через смену режима). */
  reset: () => void;
}

export const useMapStatusStore = create<MapStatusState>((set) => ({
  status: 'ok',
  setStatus: (status) => set({ status }),
  reset: () => set({ status: 'ok' }),
}));
