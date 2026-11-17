import type { Metadata } from "next";
import { getLocale } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const ru = locale !== "en";
  return {
    title: ru ? "Карта прогулок" : "Walk map",
    description: ru
      ? "Прогулка рядом: петля от вашей геолокации с честным таймингом, или маршрут по точкам."
      : "A walk nearby: a loop from your location with honest timing, or a route through your points.",
  };
}

import { RouteSidebarManager } from '@/components/features/RouteSidebarManager';
import { RouteMapLoader } from '@/components/map/RouteMapLoader';
import { MapPickerOverlay } from '@/components/map/MapPickerOverlay';

// Единая панель «План прогулки» слева: свитчер «Быстрая прогулка ↔ Маршрут»
// (docs/PRODUCT.md входы №1 и №3), shell и компоненты — общие.
// ?sketch=1 (только вне production) оборачивает быстрый режим в SketchCard.
export default async function MapPage({
  searchParams
}: {
  searchParams: Promise<{ sketch?: string }>;
}) {
  const { sketch } = await searchParams;
  const sketchMode = sketch === '1' && process.env.NODE_ENV !== 'production';

  return (
    <main className="relative w-full h-[100dvh] md:h-[calc(100vh-73px)] overflow-hidden">

      {/* Карта на заднем фоне (100% ширины и высоты) */}
      <div className="absolute inset-0 z-0">
        <RouteMapLoader />
      </div>

      {/* Единая панель режимов прогулки (fixed внутри себя) */}
      <RouteSidebarManager sketch={sketchMode} />

      {/* Оверлей для выбора точки на карте */}
      <MapPickerOverlay />

    </main>
  );
}
