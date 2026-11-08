// src/lib/walk/ports.ts
// Локальный структурный порт маршрутизации движка прогулок.
//
// Совместимость с GeoProvider (lib/geo/types) — структурная, без импорта:
// любой GeoProvider удовлетворяет WalkRoutingPort, потому что
//  - RouteRequest = { waypoints, alternatives? } принимает { waypoints };
//  - RouteSegment/MatrixCell структурно шире локальных двойников.
// Чанкинг матрицы (≤40 точек на запрос) — забота реализации порта, не движка
// (правило 3/4 ADR-001). Ошибки недостижимости: route() бросает, матрица
// честно ставит null в ячейку.

/** Сегмент маршрута по реальным улицам. */
export interface WalkRouteSegment {
  distanceMeters: number;
  durationSeconds: number;
  /** Полилиния [lat,lng]; пустой массив, если источник не дал геометрию. */
  geometry: WalkLatLng[];
  /** Откуда метрики — для отладки и бейджа fast mode. */
  source?: string;
}

/** Ячейка матрицы; null = недостижимо пешком (честная деградация ADR-001). */
export interface WalkMatrixCell {
  sourceIndex: number;
  targetIndex: number;
  distanceMeters: number | null;
  durationSeconds: number | null;
}

import type { WalkLatLng } from './types';

export interface WalkRoutingPort {
  /** Маршрут по списку точек. Бросает, если маршрут не построился. */
  route(req: { waypoints: WalkLatLng[] }): Promise<WalkRouteSegment>;
  /** Плоская матрица ячеек size(sources)×size(targets). */
  matrix(sources: WalkLatLng[], targets: WalkLatLng[]): Promise<WalkMatrixCell[]>;
}
