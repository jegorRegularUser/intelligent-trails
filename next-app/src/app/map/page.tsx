import { RouteSidebarManager } from '@/components/features/RouteSidebarManager';
import { DevMapPanel } from '@/components/features/dev/DevMapPanel';
import { QuickWalkContainer } from '@/components/features/quick-walk/QuickWalkContainer';
import { RouteMapLoader } from '@/components/map/RouteMapLoader';
import { MapPickerOverlay } from '@/components/map/MapPickerOverlay';

// ?dev=1 — dev-панель (демо главного экрана + sketch-эксперименты) блоком
// на карте; в проде параметр игнорируется целиком.
export default async function MapPage({
  searchParams
}: {
  searchParams: Promise<{ dev?: string }>;
}) {
  const { dev } = await searchParams;
  const devMode = dev === '1' && process.env.NODE_ENV !== 'production';

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
          Эксперт-режим занимает левый край — быстрый старт живёт справа.
          В dev-режиме скрываем, чтобы демо-панель не конкурировала за экран */}
      {!devMode && <QuickWalkContainer />}

      {/* Dev-панель: только ?dev=1 и вне production */}
      {devMode && <DevMapPanel />}

      {/* Оверлей для выбора точки на карте */}
      <MapPickerOverlay />

    </main>
  );
}
