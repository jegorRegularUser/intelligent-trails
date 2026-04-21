"use client";

import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useRouteStore, MapRoutePoint, FormWaypoint } from "@/store/useRouteStore";
import { RouteBuilderSidebar } from "./RouteBuilderSidebar";
import { RouteResultSidebar } from "./RouteResultSidebar";
import { decodeRouteFromUrl } from "@/utils/routeCodec";
import { useNavigation } from "@/contexts/NavigationContext";
import { ToastProvider } from "@/contexts/ToastContext";

export function RouteSidebarManager() {
  const searchParams = useSearchParams();
  const routeParam = searchParams.get("r");
  const { isMobileMenuOpen } = useNavigation();

  const {
    setMapPoints, setStartPoint, setWaypoints,
    setEndPoint, setStartTransport, setStartPointName, setEndPointName,
    setEndPointType, setEndPointCategory,
    isRouteBuilt, setIsRouteBuilt
  } = useRouteStore();

  const [isInitializing, setIsInitializing] = useState(false);
  const lastProcessedUrl = useRef<string | null>(null);

  useEffect(() => {
    async function processUrlRoute() {
      // Нет параметра маршрута - показываем Builder
      if (!routeParam) {
        setIsRouteBuilt(false);
        return;
      }

      // Уже обработали этот URL
      if (isRouteBuilt || lastProcessedUrl.current === routeParam) return;

      setIsInitializing(true);
      lastProcessedUrl.current = routeParam;

      const decodedData = decodeRouteFromUrl(routeParam);
      if (!decodedData) {
        setIsInitializing(false);
        setIsRouteBuilt(false);
        return;
      }

      // ПРОВЕРКА: Все ли waypoints имеют координаты?
      const hasAllCoordinates = decodedData.waypoints.every((wp: any) => wp.coords);

      if (!hasAllCoordinates) {
        console.warn("URL содержит неполные данные, требуется перестроение маршрута");
        setIsInitializing(false);
        setIsRouteBuilt(false);
        return;
      }

      // FAST PATH: Все данные уже есть в URL, просто загружаем в store
      setStartPoint(decodedData.startPoint);
      setStartPointName(decodedData.startPointName);
      setStartTransport(decodedData.startTransport);
      setEndPoint(decodedData.endPoint);
      setEndPointName(decodedData.endPointName);
      setEndPointType(decodedData.endPointType);
      setEndPointCategory(decodedData.endPointCategory);

      // Формируем MapRoutePoint[] из декодированных данных
      const finalMapPoints: MapRoutePoint[] = [];

      // Старт
      finalMapPoints.push({
        coordinates: decodedData.startPoint,
        modeToNext: decodedData.startTransport,
        name: decodedData.startPointName,
        address: decodedData.startPointAddress,
        distanceToNext: decodedData.startDistanceToNext,
        durationToNext: decodedData.startDurationToNext,
      });

      // Промежуточные точки
      decodedData.waypoints.forEach((wp: any) => {
        finalMapPoints.push({
          coordinates: wp.coords,
          modeToNext: wp.modeToNext,
          name: wp.resolvedName,
          address: wp.address,
          alternatives: wp.alternatives,
          selectedAlternativeIndex: wp.selectedAlternativeIndex || 0,
          stayDuration: wp.stayDuration || 0,
          distanceToNext: wp.distanceToNext,
          durationToNext: wp.durationToNext,
        });
      });

      // Финиш
      if (decodedData.endPoint) {
        finalMapPoints.push({
          coordinates: decodedData.endPoint,
          modeToNext: "pedestrian",
          name: decodedData.endPointName,
          address: decodedData.endPointAddress,
        });
      }

      setWaypoints(decodedData.waypoints);
      setMapPoints(finalMapPoints);
      setIsRouteBuilt(true);
      setIsInitializing(false);
    }

    processUrlRoute();
  }, [routeParam, isRouteBuilt, setEndPoint, setEndPointCategory, setEndPointName, setEndPointType, setMapPoints, setStartPoint, setStartPointName, setStartTransport, setWaypoints, setIsRouteBuilt]);

  if (isInitializing) {
    return (
      <div className="absolute left-6 top-6 w-[400px] bg-white p-10 rounded-3xl shadow-float z-40 flex flex-col items-center gap-4">
         <div className="w-12 h-12 border-4 border-brand-100 border-t-brand-500 rounded-full animate-spin" />
         <p className="text-slate-600 font-bold text-lg">Загружаем маршрут...</p>
      </div>
    );
  }

  return (isRouteBuilt && routeParam) ? (
    <ToastProvider>
      <RouteResultSidebar isNavigationOpen={isMobileMenuOpen} />
    </ToastProvider>
  ) : (
    <RouteBuilderSidebar isNavigationOpen={isMobileMenuOpen} />
  );
}