import { RouteSidebarManager } from '@/components/features/RouteSidebarManager';
import { RouteMap } from '@/components/map/RouteMap';
import { MapPickerOverlay } from '@/components/map/MapPickerOverlay';

export default function MapPage() {
  return (
    <main className="relative w-full h-[calc(100vh-73px)] overflow-hidden">

      {/* Карта на заднем фоне (100% ширины и высоты) */}
      <div className="absolute inset-0 z-0">
        <RouteMap />
      </div>

      {/* Сайдбар поверх карты.
          Он использует fixed-позиционирование внутри себя,
          так что тут мы просто рендерим его в DOM */}
      <RouteSidebarManager />

      {/* Оверлей для выбора точки на карте */}
      <MapPickerOverlay />

    </main>
  );
}
