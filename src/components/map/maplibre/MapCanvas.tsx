"use client";

// src/components/map/maplibre/MapCanvas.tsx
// Канва главного сценария на maplibre (docs/ux-human-wave.md M1): геолокация,
// пин «вы здесь», линия и пины прогулки из useQuickWalkMapStore, карточка пина
// с причиной и стоянкой, пикер точек, язык подписей. Эксперт-режим остаётся на
// Яндексе — переключение стеков решает RouteMapLoader по mapStack.shouldRenderMaplibre.
//
// Честная деградация (M7): тайлы не загрузились — серая канва + плашка
// «Карта недоступна» (прогулка живёт в таймлайне); WebGL недоступен — канва
// не рендерится вовсе, панель разворачивается на весь экран (useMapStatusStore).
import { useCallback, useEffect, useRef, useState } from "react";
import { Map as MaplibreMap, setWorkerUrl } from "maplibre-gl";
import type { MapMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useLocale, useTranslations } from "next-intl";
import { Compass } from "lucide-react";
import { useRouteStore } from "@/store/useRouteStore";
import { useQuickWalkMapStore, type QuickWalkStopPin } from "@/store/useQuickWalkMapStore";
import { useMapStatusStore } from "@/store/useMapStatusStore";
import { usePreferences } from "@/contexts/PreferencesContext";
import { reverseGeocode } from "@/actions/geocoder";
import { PlaceMiniCard } from "@/components/places/PlaceMiniCard";
import { buildWalkStopCard } from "@/components/places/walkStopCard";
import type { Coordinates } from "@/types/map";
import type { FormWaypoint } from "@/store/useRouteStore";
import { loadStyleOrFallback } from "./style";
import { useMapRoute } from "./useMapRoute";
import { StartPinFace, StopPinFace, useMapUserPin } from "./useMapPins";
import { useMapLocale } from "./useMapLocale";

/** Окно ожидания первого успешного рендера тайлов до плашки недоступности (M7). */
const TILE_AVAILABILITY_WINDOW_MS = 8000;

/**
 * Воркер maplibre v6 резолвится через import.meta.url бандла — после упаковки
 * Next/Turbopack путь «./maplibre-gl-worker.mjs» уходит в чанки, fetch воркера
 * падает и канва навсегда остаётся без тайлов. Явный путь на копию воркера
 * в public/ui (обновлять вместе с dep) чинит резолв на любом бандлере.
 */
setWorkerUrl("/ui/maplibre-gl-worker.mjs");

export function MapCanvas() {
  const locale = useLocale();
  const { mapLocale } = usePreferences();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [map, setMap] = useState<MaplibreMap | null>(null);
  const [styleLoaded, setStyleLoaded] = useState(false);
  const setStatus = useMapStatusStore((s) => s.setStatus);
  const resetStatus = useMapStatusStore((s) => s.reset);

  // Геолокация при монтировании (M1.1): bias подсказок AddressInput опирается
  // на useRouteStore.userLocation — тот же контракт, что у RouteMap.
  const setStoreUserLocation = useRouteStore((s) => s.setUserLocation);
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords: Coordinates = [position.coords.latitude, position.coords.longitude];
        setUserLocation(coords);
        setStoreUserLocation(coords);
      },
      () => {
        // Отказ/недоступность геолокации честно разбирает QuickWalkContent
        // (WalkUI.geoDenied) — канве здесь делать нечего.
      },
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 },
    );
  }, [setStoreUserLocation]);

  // Пикер точек (M1): клик по карте → координата + reverse geocoding — тот же
  // контракт, что у Яндекса в RouteMap (start / end / waypoint по target).
  const isMapPickerActive = useRouteStore((s) => s.isMapPickerActive);
  const mapPickerTarget = useRouteStore((s) => s.mapPickerTarget);
  const {
    setStartPoint, setStartPointName, setEndPoint, setEndPointName, setWaypoints, setMapPickerActive,
  } = useRouteStore();
  const pickerRefs = useRef({
    isMapPickerActive, mapPickerTarget,
    setStartPoint, setStartPointName, setEndPoint, setEndPointName, setWaypoints, setMapPickerActive,
  });
  // Запись ref'а во время рендера запрещена компилятором — синхронизируем эффектом.
  useEffect(() => {
    pickerRefs.current = {
      isMapPickerActive, mapPickerTarget,
      setStartPoint, setStartPointName, setEndPoint, setEndPointName, setWaypoints, setMapPickerActive,
    };
  }, [isMapPickerActive, mapPickerTarget, setStartPoint, setStartPointName, setEndPoint, setEndPointName, setWaypoints, setMapPickerActive]);

  // Создание канвы — один раз. Стиль префетчится ДО конструктора: недоступный
  // positron сразу заменяется фолбэк-растром (style.ts), а не агрессивным
  // setStyle по любому 'error'. Конструктор бросает без WebGL → M7.
  useEffect(() => {
    let disposed = false;
    const container = containerRef.current;
    if (!container || map) return;
    let instance: MaplibreMap | null = null;
    let created: MaplibreMap | null = null;
    void (async () => {
      const style = await loadStyleOrFallback();
      if (disposed) return;
      try {
        instance = new MaplibreMap({
          container,
          style,
          center: [37.61, 55.75], // [lng, lat]: Москва — центр по умолчанию, как у RouteMap
          zoom: 12,
          pitch: 0,
          attributionControl: { compact: true },
        });
      } catch {
        // WebGL недоступен: карта скрыта, панель на весь экран (таймлайн-первый режим).
        setStatus("webgl");
        return;
      }
      resetStatus();
      created = instance;
      created.on("load", () => setStyleLoaded(true));
      setMap(created);
    })();
    return () => {
      disposed = true;
      created?.remove();
      setMap(null);
      setStyleLoaded(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Центр на юзере, пока прогулки нет (M1.1: повтор семантики RouteMap).
  useMapLocale(map, mapLocale);

  const quickWalk = useQuickWalkMapStore();
  useEffect(() => {
    if (!map || !userLocation) return;
    if (quickWalk.isActive) return;
    map.easeTo({ center: [userLocation[1], userLocation[0]], zoom: 13, duration: 500 });
    // Юзер-пин обновляется через хук пинов ниже.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, userLocation]);

  // --- Здоровье тайлов (M7): стиль выбирается префетчем до создания канвы
  // (style.ts); здесь остаётся честная плашка после окна ожидания без единого
  // успешного рендера — прогулка продолжается по таймлайну.
  useEffect(() => {
    if (!map) return;
    let sawRenderedData = false;
    let sawTileError = false;
    const onError = () => {
      sawTileError = true;
    };
    const onData = (event: { dataType?: string }) => {
      if (event.dataType === "source" && map.areTilesLoaded()) sawRenderedData = true;
    };
    map.on("error", onError);
    map.on("data", onData);
    const timer = window.setTimeout(() => {
      if (!sawRenderedData && sawTileError) setStatus("tiles");
    }, TILE_AVAILABILITY_WINDOW_MS);
    return () => {
      map.off("error", onError);
      map.off("data", onData);
      window.clearTimeout(timer);
    };
  }, [map, setStatus, styleLoaded]);

  // --- Быстрая прогулка: линия + building-петля (useMapRoute), пин юзера.
  const quickWalkState = {
    isActive: quickWalk.isActive,
    geometry: quickWalk.geometry,
    fitNonce: quickWalk.fitNonce,
    building: quickWalk.building,
  };
  useMapRoute(map, quickWalkState);
  useMapUserPin(map, userLocation);

  // Building-фаза: зона поиска может быть далеко от дефолтного центра — камера
  // едет к старту, чтобы пунктирная петля была в кадре (M1/S1).
  useEffect(() => {
    if (!map) return;
    const zone = quickWalk.building;
    if (!zone) return;
    map.easeTo({ center: [zone.start[1], zone.start[0]], zoom: 12.5, duration: 800 });
  }, [map, quickWalk.building]);

  // Карточка пина (M1.3/M1.7): активный stop id — состояние, остальное выводится
  // из плана: stop id исчез из плана → карточка закрывается сама (F1), жив —
  // остаётся и пере-якоривается на move (M1.4).
  const [activeStopId, setActiveStopId] = useState<string | null>(null);
  const [, bumpMoveTick] = useState(0);
  useEffect(() => {
    if (!map) return;
    // move покрывает пан/зум/поворот — якорь едет вместе с пином.
    const onMove = () => bumpMoveTick((tick) => tick + 1);
    map.on("move", onMove);
    return () => {
      map.off("move", onMove);
    };
  }, [map]);

  const activeStop = activeStopId
    ? (quickWalk.stops.find((stop) => stop.id === activeStopId) ?? null)
    : null;

  // Проекция координат в пиксели контейнера канвы (якорь карточки, M1.3):
  // map.project возвращает пиксели относительно контейнера. Чистое чтение
  // внешней канвы — пере-вычисляется на move-тиках и на каждом рендере.
  const projectToContainer = useCallback(
    (coords: [number, number]) => {
      if (!map) return null;
      try {
        const point = map.project([coords[1], coords[0]]); // maplibre живёт в [lng,lat]
        return { x: Math.round(point.x), y: Math.round(point.y) };
      } catch {
        return null;
      }
    },
    [map],
  );

  const anchor = activeStop ? projectToContainer(activeStop.coords) : null;

  const handlePinClick = useCallback(
    (stop: QuickWalkStopPin) => {
      setActiveStopId((prev) => (prev === stop.id ? null : stop.id));
    },
    [],
  );

  // Пикер точек: обработчик клика канвы.
  useEffect(() => {
    if (!map) return;
    if (!pickerRefs.current.isMapPickerActive) return;
    const handleMapClick = async (event: MapMouseEvent) => {
      try {
        const { lng, lat } = event.lngLat;
        const coords: Coordinates = [lat, lng];
        const { name, address } = await reverseGeocode(coords);
        const target = pickerRefs.current.mapPickerTarget;
        if (target === "start") {
          pickerRefs.current.setStartPoint(coords);
          pickerRefs.current.setStartPointName(address || name);
        } else if (target === "end") {
          pickerRefs.current.setEndPoint(coords);
          pickerRefs.current.setEndPointName(address || name);
        } else if (target) {
          pickerRefs.current.setWaypoints((prev: FormWaypoint[]) =>
            prev.map((wp) =>
              wp.id === target
                ? {
                    ...wp,
                    type: "address" as const,
                    coords,
                    value: address || name,
                    address: address || name,
                    resolvedName: name,
                  }
                : wp,
            ),
          );
        }
        pickerRefs.current.setMapPickerActive(false);
      } catch (error) {
        console.error("Map picker error:", error);
      }
    };
    map.on("click", handleMapClick);
    return () => {
      map.off("click", handleMapClick);
    };
  }, [map, isMapPickerActive]);

  const stopCard = activeStop ? buildWalkStopCard(activeStop, locale) : null;

  // Building: пин старта ставится до линии — глаз видит, откуда пойдём.
  const pinStart = quickWalk.building?.start ?? (quickWalk.isActive ? quickWalk.start : null);

  return (
    <div ref={containerRef} className="relative w-full h-full">
      {/* Карточка выбранной остановки — богатая, с причиной и стоянкой (M5).
          На мобилке якорится к верху карты: bottom sheet закрывается панелью
          снизу (шторка 45/60/85dvh). */}
      {activeStop && stopCard && anchor && (
        <PlaceMiniCard
          card={stopCard}
          anchor={anchor}
          containerRef={containerRef}
          variant="full"
          reason={<PinCardReason stop={activeStop} />}
          onExpand={() => setActiveStopId(null)}
          mobileClassName="left-2 right-auto bottom-auto top-3"
        />
      )}

      {/* Пины-оверлей: React-дерево поверх канвы, позиции — map.project,
          пересчитываются на move-тиках (M1.4). Диф по stop.id делает reconcile:
          живые пины двигаются, пропавшие размонтируются (F1). Элементы не
          отдаются maplibre-маркерам — их reparent ломал reconciliation. */}
      <div className="pointer-events-none absolute inset-0 z-[5]">
        {pinStart && (() => {
          const p = projectToContainer(pinStart);
          return p ? (
            <div className="absolute" style={{ left: p.x, top: p.y }} data-testid="pin-start">
              <div className="-translate-x-1/2 -translate-y-1/2">
                <StartPinFace label={quickWalk.startName} />
              </div>
            </div>
          ) : null;
        })()}
        {quickWalk.stops.map((stop, index) => {
          const p = projectToContainer(stop.coords);
          return p ? (
            <button
              key={stop.id}
              type="button"
              className="pointer-events-auto absolute"
              style={{ left: p.x, top: p.y }}
              onClick={() => handlePinClick(stop)}
              aria-label={stop.name}
              data-testid={`pin-stop-${stop.id}`}
            >
              <div className="-translate-x-1/2 -translate-y-1/2">
                <StopPinFace index={index + 1} kind={stop.kind} />
              </div>
            </button>
          ) : null;
        })}
      </div>

      {/* Тайлы недоступны (M7): серая канва + честная плашка — движок прогулки
          от карты не зависит, таймлайн продолжает работать. */}
      <UnavailablePlate />
    </div>
  );
}

/** Слот «почему сюда» карточки пина: причина движка + честная стоянка (M5). */
function PinCardReason({ stop }: { stop: QuickWalkStopPin }) {
  const tStay = useTranslations("Places");
  return (
    <div className="flex flex-col gap-1.5">
      {stop.reason ? <p>{stop.reason}</p> : null}
      <span className="inline-flex items-center gap-1 self-start rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
        {tStay("stayMinutes", { minutes: stop.stayMin ?? 0 })}
      </span>
    </div>
  );
}

function UnavailablePlate() {
  const t = useTranslations("WalkUI");
  const status = useMapStatusStore((s) => s.status);
  if (status !== "tiles") return null;
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-100">
      <div className="mx-4 flex max-w-xs flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-center shadow-card">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500">
          <Compass size={20} />
        </span>
        <p className="text-sm font-bold text-slate-700">{t("mapUnavailableTitle")}</p>
        <p className="text-xs leading-relaxed text-slate-500">{t("mapUnavailableHint")}</p>
      </div>
    </div>
  );
}
