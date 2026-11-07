import { RouteSidebarManager } from '@/components/features/RouteSidebarManager';
import { QuickWalkContainer } from '@/components/features/quick-walk/QuickWalkContainer';
import { RouteMapLoader } from '@/components/map/RouteMapLoader';
import { MapPickerOverlay } from '@/components/map/MapPickerOverlay';

export default function MapPage() {
  return (
    <main className="relative w-full h-[100dvh] md:h-[calc(100vh-73px)] overflow-hidden">

      {/* Карта на заднем фоне (100% ширины и высоты) */}
      <div className="absolute inset-0 z-0">
        <RouteMapLoader />
      </div>

      {/* Сайдбар поверх карты.
          Он использует fixed-позиционирование внутри себя,
          так что тут мы просто рендерим его в DOM */}
      <RouteSidebarManager />

      {/* Главный сценарий «Прогуляться сейчас» (docs/PRODUCT.md, вход №1).
          Справа — эксперт-режим (RouteSidebarManager), слева-снизу — быстрый старт */}
      <QuickWalkContainer />

      {/* Оверлей для выбора точки на карте */}
      <MapPickerOverlay />

    </main>
  );
}
