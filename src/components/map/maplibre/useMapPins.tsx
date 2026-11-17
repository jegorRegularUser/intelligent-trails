// src/components/map/maplibre/useMapPins.tsx
// Лица брендовых пинов (docs/ux-human-wave.md M1): старт — тёмный брендовый
// кружок с Footprints, остановки — иконка вида (те же 9 lucide, что в
// таймлайне) + номер в белом бейдже.
//
// ПОЧЕМУ ПИНЫ — React-оверлей, а не maplibre-маркеры: маркер забирает элемент
// в пан канвы (reparent), и React reconciliation на следующем обновлении падает
// с insertBefore NotFoundError (ловилось живьём на клике по пину). Оверлей
// рендерится обычным React-деревом поверх канвы, позиции даёт map.project на
// move-тиках канвы (MapCanvas); юзер-точка «вы здесь» остаётся императивным
// маркером — её элемент создаётся вне React.
"use client";

import { useEffect, useRef } from "react";
import { Marker } from "maplibre-gl";
import type { Map as MaplibreMap } from "maplibre-gl";
import { Footprints } from "lucide-react";
import { KIND_ICONS } from "@/components/walk/kindIcons";
import type { WalkStopKind } from "@/components/walk/types";

/** Лицо пина остановки: брендовый кружок + иконка вида + номер в белом бейдже. */
export function StopPinFace({ index, kind }: { index: number; kind: string }) {
  const Icon = KIND_ICONS[kind as WalkStopKind] ?? KIND_ICONS.other;
  return (
    <div className="relative">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-white shadow-md ring-2 ring-white">
        <Icon size={15} />
      </div>
      <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold leading-none text-brand-700 shadow-sm ring-1 ring-slate-200">
        {index}
      </span>
    </div>
  );
}

/** Лицо пина старта: тёмный брендовый кружок с Footprints + подпись. */
export function StartPinFace({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-pine-800 text-white shadow-md ring-2 ring-white">
        <Footprints size={16} />
      </div>
      {label ? (
        <span className="rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200">
          {label}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Точка «вы здесь» (M1.2): императивный маркер вне React (DOM один на сессию),
 * двигается напрямую — геолокация приходит эффектом, а не деревом.
 */
export function useMapUserPin(
  map: MaplibreMap | null,
  userLocation: [number, number] | null,
): void {
  const markerRef = useRef<Marker | null>(null);
  useEffect(() => {
    if (!map || !userLocation) return;
    if (!markerRef.current) {
      const element = document.createElement("div");
      element.className =
        "h-3.5 w-3.5 rounded-full bg-sky-500 ring-[3px] ring-white/90 shadow-md walk-pin-user";
      markerRef.current = new Marker({ element, anchor: "center" })
        .setLngLat([userLocation[1], userLocation[0]])
        .addTo(map);
      return;
    }
    markerRef.current.setLngLat([userLocation[1], userLocation[0]]);
  }, [map, userLocation]);
  // Размонтирование канвы — точка уходит вместе с картой (map.remove).
}
