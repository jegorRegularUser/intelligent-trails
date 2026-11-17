// src/components/map/maplibre/style.ts
// Тайлы главного сценария (docs/ux-human-wave.md «Решения»): OpenFreeMap positron
// без ключа (лимит только на offline-выгрузки; атрибуция обязательна — её несёт
// сам стиль + AttributionControl канвы). Стиль меняется одной строкой STYLE_URL;
// риск C2 (бледные footway на z14-15) проверяется живым смоуком против liberty.
//
// Фолбэк при недоступности тайлов — растровые тайлы. Отступление от буквы дока
// (CARTO light_all → OSM standard): CARTO с 2025 отдаёт без ключа только
// заглушку «API KEY REQUIRED», фолбэк был бы нерабочим; честная деградация
// (принцип 5 PRODUCT.md) требует настоящей карты. Атрибуция по лицензии ODbL.

import type { StyleSpecification } from 'maplibre-gl';

/** Positron OpenFreeMap — светлый «бумажный» стиль под бренд карточки прогулки. */
export const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

/**
 * Стиль доступен? Префетч ДО создания канвы: при недоступности сразу берём
 * фолбэк-растр, вместо агрессивного setStyle по любому 'error' канвы
 * (спрайты/шрифты/RTL тоже шумят ошибками, пока стиль ещё грузится).
 */
export async function loadStyleOrFallback(): Promise<string | StyleSpecification> {
  try {
    const response = await fetch(STYLE_URL, { signal: AbortSignal.timeout(6000) });
    if (response.ok) return STYLE_URL;
  } catch {
    // Стиль не открылся — сразу фолбэк.
  }
  return fallbackRasterStyle();
}

/** Фолбэк-стиль на готовых растрах OSM: работает без ключей и векторного пайплайна. */
export function fallbackRasterStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      'osm-raster': {
        type: 'raster',
        tiles: [
          'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
          'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
        ],
        tileSize: 256,
        maxzoom: 19,
        attribution: '© OpenStreetMap contributors (ODbL)',
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#f8fafb' } },
      { id: 'osm-raster', type: 'raster', source: 'osm-raster' },
    ],
  };
}
