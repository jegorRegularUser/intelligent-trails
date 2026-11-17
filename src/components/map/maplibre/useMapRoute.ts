// src/components/map/maplibre/useMapRoute.ts
// Линия прогулки и building-петля на maplibre (docs/ux-human-wave.md M1/F1):
//   - линия — GeoJSON source + два line-слоя (белая обводка 9px + бренд 6px);
//   - данные обновляются source.setData (диф-апдейт F1: без пересоздания слоёв);
//   - камера — только по fitNonce (новая прогулка/сборка); листание вариантов и
//     замена остановки приходят с прежним nonce и проходят ленивый рефит:
//     новый bbox внутри текущих границ с запасом +20% — камеру не трогаем;
//   - building — пунктирная окружность радиуса зоны поиска (клиентская формула
//     shared/geometry = серверный searchRadiusMeters) с анимацией бега штрихов.
"use client";

import { useEffect, useRef } from 'react';
import type { Map as MaplibreMap, GeoJSONSource } from 'maplibre-gl';
import type { QuickWalkBuildingZone } from '@/store/useQuickWalkMapStore';

const ROUTE_SOURCE = 'walk-route';
const ROUTE_CASING_LAYER = 'walk-route-casing';
const ROUTE_LINE_LAYER = 'walk-route-line';
const BUILDING_SOURCE = 'walk-building';
const BUILDING_LAYER = 'walk-building-line';

/** Бренд-600 из globals.css: интерактивный зелёный, читается на positron. */
const BRAND_600 = '#047857';

const EMPTY_COLLECTION = { type: 'FeatureCollection' as const, features: [] };

function lineFeature(coords: [number, number][]) {
  return {
    type: 'Feature' as const,
    properties: {},
    // Приложение живёт в [lat,lng], GeoJSON — [lng,lat].
    geometry: { type: 'LineString' as const, coordinates: coords.map(([lat, lng]) => [lng, lat]) },
  };
}

/** Замкнутое кольцо окружности в [lng,lat] — пунктир building-фазы. */
function circleRing(center: [number, number], radiusMeters: number, segments = 72): [number, number][] {
  const [lat, lng] = center;
  const rad = Math.PI / 180;
  const dLat = radiusMeters / 111320;
  const dLng = radiusMeters / (111320 * Math.max(0.2, Math.cos(lat * rad)));
  const ring: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    ring.push([lng + Math.cos(angle) * dLng, lat + Math.sin(angle) * dLat]);
  }
  return ring;
}

interface CameraPadding {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function cameraPadding(): CameraPadding {
  if (typeof window === 'undefined') return { left: 460, right: 60, top: 60, bottom: 60 };
  if (window.innerWidth < 768) {
    // Панель снизу: петля уезжает в верхние ~55% экрана, а не под шторку.
    const bottom = Math.round(window.innerHeight * 0.45);
    return { left: 24, right: 24, top: 48, bottom };
  }
  return { left: 460, right: 60, top: 60, bottom: 60 };
}

function boundsOfGeometry(coords: [number, number][]) {
  let minLat = Infinity;
  let minLng = Infinity;
  let maxLat = -Infinity;
  let maxLng = -Infinity;
  for (const [lat, lng] of coords) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  return { minLat, minLng, maxLat, maxLng };
}

/** Запас ленивого рефита: +20% по обеим осям (F1). */
const LAZY_REFIT_INFLATE = 0.2;

export interface MapRouteState {
  isActive: boolean;
  geometry: [number, number][];
  /** Сигнал камеры: инкрементится только новой прогулкой/сборкой (F1). */
  fitNonce: number;
  building: QuickWalkBuildingZone | null;
}

export function useMapRoute(map: MaplibreMap | null, state: MapRouteState): void {
  const { isActive, geometry, fitNonce, building } = state;
  // Прежние значения для различения «новая прогулка» и «данные без сигнала камеры».
  const prevFitNonce = useRef(0);
  const prevGeometryRef = useRef<[number, number][]>([]);
  // Актуальная геометрия для ensure() на styledata: setData мог прийти раньше,
  // чем создались source'ы (сборка/гидрация опережают загрузку стиля).
  const latestGeometryRef = useRef<[number, number][] | null>(null);
  // Запись ref'а — только в эффекте (компилятор React запрещает ref в рендере).
  useEffect(() => {
    latestGeometryRef.current = isActive && geometry.length >= 2 ? geometry : null;
  }, [isActive, geometry]);

  // 1. Слои и source — после загрузки стиля (в т.ч. фолбэка); вместе с ними
  // сразу применяется последняя известная геометрия линии.
  useEffect(() => {
    if (!map) return;
    const ensure = () => {
      if (!map.getSource(ROUTE_SOURCE)) {
        map.addSource(ROUTE_SOURCE, { type: 'geojson', data: EMPTY_COLLECTION });
      }
      if (!map.getLayer(ROUTE_CASING_LAYER)) {
        map.addLayer({
          id: ROUTE_CASING_LAYER,
          type: 'line',
          source: ROUTE_SOURCE,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#ffffff', 'line-width': 9, 'line-opacity': 0.9 },
        });
      }
      if (!map.getLayer(ROUTE_LINE_LAYER)) {
        map.addLayer({
          id: ROUTE_LINE_LAYER,
          type: 'line',
          source: ROUTE_SOURCE,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': BRAND_600, 'line-width': 6, 'line-opacity': 0.95 },
        });
      }
      if (!map.getSource(BUILDING_SOURCE)) {
        map.addSource(BUILDING_SOURCE, { type: 'geojson', data: EMPTY_COLLECTION });
      }
      if (!map.getLayer(BUILDING_LAYER)) {
        map.addLayer({
          id: BUILDING_LAYER,
          type: 'line',
          source: BUILDING_SOURCE,
          paint: { 'line-color': BRAND_600, 'line-width': 3, 'line-opacity': 0.85, 'line-dasharray': [2, 2.5] },
        });
      }
      const pending = latestGeometryRef.current;
      if (pending) {
        const source = map.getSource(ROUTE_SOURCE);
        if (source && source.type === 'geojson') (source as GeoJSONSource).setData(lineFeature(pending));
      }
    };
    if (map.isStyleLoaded()) {
      ensure();
      return;
    }
    // Стиль ещё грузится (первый рендер или setStyle-фолбэк) — вешаемся на styledata.
    map.on('styledata', ensure);
    return () => {
      map.off('styledata', ensure);
    };
  }, [map]);

  // 2. Данные линии — setData, без пересоздания слоёв/пинов (F1). Source может
  // ещё не существовать (стиль грузится) — тогда данные применит ensure (п.1).
  useEffect(() => {
    if (!map || !isActive || geometry.length < 2) return;
    const source = map.getSource(ROUTE_SOURCE);
    if (!source || source.type !== 'geojson') return;
    (source as GeoJSONSource).setData(lineFeature(geometry));
  }, [map, isActive, geometry]);

  // 3. Камера: fitNonce — полный рефит; те же nonce при новых данных — ленивый рефит.
  useEffect(() => {
    if (!map || !isActive || geometry.length < 2) {
      // Пока канва не создана (префетч стиля), nonce «не съедаем»: прогулка,
      // пришедшая до карты, обязана получить полный рефит при её появлении.
      if (map) {
        prevFitNonce.current = fitNonce;
        prevGeometryRef.current = geometry;
      }
      return;
    }
    const isNewWalk = fitNonce !== prevFitNonce.current;
    const geometryChanged = geometry !== prevGeometryRef.current;
    prevFitNonce.current = fitNonce;
    prevGeometryRef.current = geometry;
    if (!geometryChanged) return;

    const bounds = boundsOfGeometry(geometry);
    if (isNewWalk) {
      map.fitBounds(
        [
          [bounds.minLng, bounds.minLat],
          [bounds.maxLng, bounds.maxLat],
        ],
        { padding: cameraPadding(), duration: 800, pitch: 0, maxZoom: 16 },
      );
      return;
    }
    // Ленивый рефит варианта (F1): bbox текущих границ +20% по обеим осям;
    // новая петля внутри — камера стоит, глаз не прыгает.
    const current = map.getBounds();
    if (!current) return;
    const sw = current.getWest();
    const east = current.getEast();
    const south = current.getSouth();
    const north = current.getNorth();
    const spanLat = north - south;
    const spanLng = east - sw;
    const fits =
      bounds.minLat >= south - spanLat * LAZY_REFIT_INFLATE &&
      bounds.maxLat <= north + spanLat * LAZY_REFIT_INFLATE &&
      bounds.minLng >= sw - spanLng * LAZY_REFIT_INFLATE &&
      bounds.maxLng <= east + spanLng * LAZY_REFIT_INFLATE;
    if (!fits) {
      map.fitBounds(
        [
          [bounds.minLng, bounds.minLat],
          [bounds.maxLng, bounds.maxLat],
        ],
        { padding: cameraPadding(), duration: 800, pitch: 0, maxZoom: 16 },
      );
    }
  }, [map, isActive, geometry, fitNonce]);

  // 4. Building-петля: окружность радиуса зоны + бегущие штрихи (покой — статика).
  useEffect(() => {
    if (!map) return;
    const source = map.getSource(BUILDING_SOURCE);
    if (!source || source.type !== 'geojson') return;
    const geoSource = source as GeoJSONSource;
    if (!building) {
      geoSource.setData(EMPTY_COLLECTION);
      return;
    }
    geoSource.setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: circleRing(building.start, building.radiusMeters),
          },
        },
      ],
    });

    // Анимация штрихов: maplibre не знает line-dashoffset — бежим по кругу
    // предвычисленных dasharray (канонический приём animate-a-line).
    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return;

    const dashSequence: number[][] = [];
    for (let i = 0; i < 16; i++) {
      // Штрих 2 + зазор 2.5, фаза сдвигается — визуально «бегущий» пунктир.
      dashSequence.push([0, 2 + i / 16, 2.5, 2 - i / 16]);
    }
    let step = 0;
    let raf = 0;
    let last = 0;
    const tick = (time: number) => {
      if (time - last > 60) {
        step = (step + 1) % dashSequence.length;
        if (map.getLayer(BUILDING_LAYER)) {
          map.setPaintProperty(BUILDING_LAYER, 'line-dasharray', dashSequence[step]);
        }
        last = time;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [map, building]);

  // 5. Прогулка снята — линия и петля уходят из канвы, но слои остаются.
  useEffect(() => {
    if (!map) return;
    if (isActive) return;
    const source = map.getSource(ROUTE_SOURCE);
    if (source && source.type === 'geojson') (source as GeoJSONSource).setData(EMPTY_COLLECTION);
    const buildingSource = map.getSource(BUILDING_SOURCE);
    if (buildingSource && buildingSource.type === 'geojson') {
      (buildingSource as GeoJSONSource).setData(EMPTY_COLLECTION);
    }
  }, [map, isActive]);

}
