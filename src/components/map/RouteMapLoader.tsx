'use client';

// src/components/map/RouteMapLoader.tsx
// Переключатель карт-стеков (docs/ux-human-wave.md «Решения», блокер B2):
//   - главный сценарий (quick/sightseeing, эксперт-маршрут ещё не построен)
//     рендерится на maplibre MapCanvas;
//   - эксперт-режим (?r= или вкладка «Маршрут») — Яндекс RouteMap, пока его
//     метрики и транспортные альтернативы живут в multiRouter.MultiRoute.
// Бандл-инвариант (C1): оба стека — только через dynamic(ssr:false) ЗДЕСЬ;
// статический импорт RouteMap в лоадере запрещён, иначе Яндекс-чанк едет на /.
import { useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import { useRouteStore } from '@/store/useRouteStore';
import { shouldRenderMaplibre } from './mapStack';

const RouteMap = dynamic(
  () => import('@/components/map/RouteMap').then((mod) => mod.RouteMap),
  { ssr: false }
);

const MapCanvas = dynamic(
  () => import('@/components/map/maplibre/MapCanvas').then((mod) => mod.MapCanvas),
  { ssr: false }
);

function MapLoadingPlaceholder() {
  return (
    <div className="w-full h-full bg-slate-100 flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-brand-100 border-t-brand-500 rounded-full animate-spin" />
    </div>
  );
}

const noopSubscribe = () => () => {};

export function RouteMapLoader() {
  // Гидрационный гард без setState-в-эффекте: false на сервере, true на клиенте
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const walkMode = useRouteStore((s) => s.walkMode);
  const mapPointsCount = useRouteStore((s) => s.mapPoints.length);

  if (!mounted) {
    return <MapLoadingPlaceholder />;
  }

  if (shouldRenderMaplibre(walkMode, mapPointsCount)) {
    return <MapCanvas />;
  }
  return <RouteMap />;
}
