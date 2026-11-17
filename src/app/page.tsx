import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { RouteSidebarManager } from '@/components/features/RouteSidebarManager';
import { RouteMapLoader } from '@/components/map/RouteMapLoader';
import { MapPickerOverlay } from '@/components/map/MapPickerOverlay';

// Главный экран (docs/ux-human-wave.md M2): карта + единая панель «План прогулки»
// открываются сразу — главный сценарий больше не закрыт лендингом
// (docs/PRODUCT.md, принцип 2). Лендинг переехал на /about, старые ссылки
// /map?... перенаправляются сюда с сохранением query (блокер B1).
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const ru = locale !== "en";
  return {
    title: ru
      ? "Генератор прогулок по реальным улицам"
      : "A walk generator on real streets",
    description: ru
      ? "Скажите, сколько у вас времени — и получите готовую пешеходную петлю с осмысленными остановками и честным таймингом."
      : "Tell it how much time you have — get a ready walking loop with meaningful stops and honest timing.",
  };
}

// Единая панель «План прогулки» слева: свитчер «Быстрая прогулка ↔ Новый город ↔
// Маршрут» (docs/PRODUCT.md входы №1–№3), shell и компоненты — общие.
// ?sketch=1 (только вне production) оборачивает быстрый режим в SketchCard;
// ?r= открывает эксперт-маршрут по ссылке, ?w= — чужую быструю прогулку.
export default async function MainPage({
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
