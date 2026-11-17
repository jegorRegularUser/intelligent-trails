// src/components/map/maplibre/useMapLocale.ts
// Язык подписей карты (docs/ux-human-wave.md M1.5): вместо опции lang: Яндекса —
// setLayoutProperty text-field по mapLocale из PreferencesContext. OpenMapTiles
// несёт name:ru/name:en/name:latin; positron-стиль говорит {name} — подменяем
// выражением с coalesce. Raster-фолбэк символ-слоёв не имеет — no-op.
"use client";

import { useEffect } from 'react';
import type { Map as MaplibreMap, ExpressionSpecification } from 'maplibre-gl';

const LABEL_FIELD: Record<'ru' | 'en', ExpressionSpecification> = {
  ru: ['coalesce', ['get', 'name:ru'], ['get', 'name']],
  en: ['coalesce', ['get', 'name:latin'], ['get', 'name']],
};

export function useMapLocale(map: MaplibreMap | null, mapLocale: 'ru' | 'en'): void {
  useEffect(() => {
    if (!map) return;
    const apply = () => {
      const style = map.getStyle();
      if (!style?.layers) return;
      for (const layer of style.layers) {
        if (layer.type !== 'symbol') continue;
        const textField = (layer.layout as Record<string, unknown> | undefined)?.['text-field'];
        // Подменяем только подписи названий — реф-метки дорог/номеров оставляем как есть.
        if (typeof textField !== 'string' || !textField.includes('name')) continue;
        try {
          map.setLayoutProperty(layer.id, 'text-field', LABEL_FIELD[mapLocale]);
        } catch {
          // Слой исчез между getStyle и setLayoutProperty — не фатально.
        }
      }
    };
    if (map.isStyleLoaded()) {
      apply();
      return;
    }
    map.on('styledata', apply);
    return () => {
      map.off('styledata', apply);
    };
  }, [map, mapLocale]);
}
