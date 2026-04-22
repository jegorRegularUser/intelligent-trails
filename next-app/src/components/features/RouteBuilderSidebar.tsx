"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { RoutePanel } from "@/components/ui/RoutePanel";
import { AddressInput } from "@/components/ui/AddressInput";
import { Button } from "@/components/ui/Button";
import { TransportToggle } from "@/components/ui/TransportToggle";
import { PillSelect } from "@/components/ui/PillSelect";
import { GridSelect } from "@/components/ui/GridSelect";
import { useRouteStore, FormWaypoint, MapRoutePoint } from "@/store/useRouteStore";
import { RoutingMode } from "@/types/map";
import { cn } from "@/utils/cn";
import { RouteErrorModal } from "@/components/features/RouteErrorModal";
import { RouteDistanceWarningModal } from "@/components/features/RouteDistanceWarningModal";
import { extractCategoryFromError } from "@/utils/categoryFormatter";
import { shouldShowDistanceWarning, calculateDirectDistance } from "@/utils/routeValidation";

import { useRouter } from 'next/navigation';
import { encodeRouteToUrl } from '@/utils/routeCodec';
import { Navigation, Footprints, Car, Bus, Plus, Trash2, MapPin, Flag } from "lucide-react";
import { PLACE_CATEGORIES } from "@/constants/categories";

interface RouteBuilderSidebarProps {
  isNavigationOpen?: boolean;
}

export function RouteBuilderSidebar({ isNavigationOpen = false }: RouteBuilderSidebarProps) {
  const router = useRouter();
  const t = useTranslations("BuilderSidebar");
  
  // 1. Достаем всё из глобального стора вместо локального стейта
  const {
    startPoint, setStartPoint,
    startPointName, setStartPointName,
    startPointType, setStartPointType,
    startTransport, setStartTransport,
    waypoints, setWaypoints,
    endPoint, setEndPoint,
    endPointName, setEndPointName,
    endPointType, setEndPointType,
    endPointCategory, setEndPointCategory,
    setMapPoints, setIsRouteBuilt,
    setMapPickerActive
  } = useRouteStore();

  // Локальный стейт для спиннера и модального окна ошибок
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorModal, setErrorModal] = useState<{
    isOpen: boolean;
    message: string;
    categoryName?: string;
    failedWaypointId?: string;
  }>({
    isOpen: false,
    message: "",
  });
  const [distanceWarning, setDistanceWarning] = useState<{
    isOpen: boolean;
    distance: number;
  }>({
    isOpen: false,
    distance: 0,
  });

  // Формируем массивы ВНУТРИ компонента, чтобы работал хук переводов t()
  const CATEGORIES = Object.entries(PLACE_CATEGORIES)
    .map(([id, config]) => {
      const Icon = config.icon;
      return {
        id,
        title: t(`cat${id.charAt(0).toUpperCase() + id.slice(1)}`),
        icon: <Icon size={18} />
      };
    });

  const TIME_OPTIONS = [
    { label: t("time15m"), value: 15 },
    { label: t("time30m"), value: 30 },
    { label: t("time1h"), value: 60 },
    { label: t("time2h"), value: 120 },
  ];

  const TRANSPORT_OPTIONS = [
    { value: "pedestrian" as RoutingMode, label: t("transportPedestrian"), icon: <Footprints size={18} /> },
    { value: "auto" as RoutingMode, label: t("transportAuto"), icon: <Car size={18} /> },
    { value: "masstransit" as RoutingMode, label: t("transportMassTransit"), icon: <Bus size={18} /> },
  ];

  const addWaypoint = () => {
    const newPoint: FormWaypoint = {
      id: Math.random().toString(36).substring(7),
      type: "category",
      value: "cafe",
      duration: 60, // Обратная совместимость (используется в UI)
      modeToNext: "pedestrian",
    };
    setWaypoints((prev) => [...prev, newPoint]);
  };

  const removeWaypoint = (id: string) => {
    setWaypoints((prev) => prev.filter(wp => wp.id !== id));
  };

  const updateWaypoint = (id: string, updates: Partial<FormWaypoint>) => {
    setWaypoints((prev) => prev.map(wp => wp.id === id ? { ...wp, ...updates } : wp));
  };



  const handleBuildRoute = async () => {
    if (!startPoint) {
      return;
    }

    // Определяем конечную точку для проверки расстояния
    const finalEndPoint = endPointType === "address" ? endPoint : null;

    // Проверяем расстояние только если есть конечная точка
    if (finalEndPoint) {
      const distance = calculateDirectDistance(startPoint, finalEndPoint);

      if (shouldShowDistanceWarning(distance)) {
        // Показываем предупреждение вместо немедленного построения
        setDistanceWarning({
          isOpen: true,
          distance,
        });
        return;
      }
    }

    // Если проверка пройдена или конечной точки нет, строим маршрут
    await buildRoute();
  };

  const buildRoute = async () => {
    setIsGenerating(true);

    if (!startPoint) {
      setIsGenerating(false);
      return;
    }

    try {
      // Импортируем Server Action для построения маршрута
      const { buildCompleteRoute } = await import("@/actions/routeBuilder");

      // Вызываем построение маршрута с OSM и геокодированием
      const result = await buildCompleteRoute({
        startPoint,
        startPointName: startPointName || undefined,
        startTransport,
        waypoints,
        endPoint: endPointType === "address" ? endPoint : null,
        endPointName: endPointName || undefined,
        endPointType: endPointType === "map" ? "address" : endPointType,
        endPointCategory: endPointType === "category" ? endPointCategory : undefined,
      });

      if (!result.success) {
        // Показываем модальное окно с ошибкой вместо alert
        setErrorModal({
          isOpen: true,
          message: result.error || "Не удалось построить маршрут",
          categoryName: extractCategoryFromError(result.error),
        });
        setIsGenerating(false);
        return;
      }

      // Записываем готовые данные в store
      setMapPoints(result.mapPoints || []);
      setWaypoints(result.waypoints || []);

      if (result.startPointName) {
        setStartPointName(result.startPointName);
      }

      if (result.endPoint) {
        setEndPoint(result.endPoint);
      }

      if (result.endPointName) {
        setEndPointName(result.endPointName);
      }

      // Кодируем ПОЛНЫЕ данные в URL
      const routeData = {
        startPoint,
        startPointName: result.startPointName,
        startPointAddress: result.startPointAddress,
        startTransport,
        waypoints: result.waypoints || [],
        endPoint: result.endPoint,
        endPointName: result.endPointName,
        endPointAddress: result.endPointAddress,
        endPointType,
        endPointCategory: endPointType === "category" ? endPointCategory : undefined,
      };

      const encodedString = encodeRouteToUrl(routeData);

      // Переходим на Result view
      setIsRouteBuilt(true);
      router.push(`?r=${encodedString}`, { scroll: false });
    } catch (error: any) {
      console.error("Ошибка построения маршрута:", error);
      setErrorModal({
        isOpen: true,
        message: "Произошла ошибка при построении маршрута",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Обработчик повторной попытки построения
  const handleRetry = () => {
    setErrorModal({ isOpen: false, message: "" });
    handleBuildRoute();
  };

  // Обработчик удаления проблемной точки
  const handleRemovePoint = () => {
    const categoryName = errorModal.categoryName;

    // Находим и удаляем точку с проблемной категорией
    if (categoryName) {
      // Проверяем, это промежуточная точка или финиш
      const isEndPoint = endPointType === "category" && endPointCategory === categoryName;

      if (isEndPoint) {
        // Удаляем финишную точку (делаем её пустой)
        setEndPointType("address");
        setEndPoint(null);
        setEndPointName("");
      } else {
        // Удаляем промежуточную точку
        const waypointToRemove = waypoints.find(
          wp => wp.type === "category" && (wp.value === categoryName || wp.originalCategory === categoryName)
        );
        if (waypointToRemove) {
          setWaypoints(waypoints.filter(wp => wp.id !== waypointToRemove.id));
        }
      }
    }

    setErrorModal({ isOpen: false, message: "" });

    // Автоматически перестраиваем маршрут без проблемной точки
    setTimeout(() => {
      handleBuildRoute();
    }, 100);
  };

  // Обработчик подтверждения построения длинного маршрута
  const handleProceedWithLongRoute = () => {
    setDistanceWarning({ isOpen: false, distance: 0 });
    // Строим маршрут без дополнительных проверок
    buildRoute();
  };

  // Обработчик отмены построения длинного маршрута
  const handleCancelLongRoute = () => {
    setDistanceWarning({ isOpen: false, distance: 0 });
  };

  return (
    <>
      <RoutePanel
        isNavigationOpen={isNavigationOpen}
        header={
          <div className="flex items-center gap-3 text-slate-800">
            <div className="p-2 bg-brand-100 rounded-xl text-brand-600">
              <Navigation size={20} />
            </div>
            <h2 className="text-xl font-bold">{t("title")}</h2>
          </div>
        }
      >
      <div className="flex flex-col relative pb-4">
        
        <div className="absolute left-[20px] top-4 bottom-14 w-0.5 bg-slate-200 z-0" />

        {/* --- СТАРТОВАЯ ТОЧКА --- */}
        <div className="relative mb-6" style={{ zIndex: 60 }}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center border-2 border-white shadow-sm shrink-0">
              <MapPin size={20} className="text-slate-500" />
            </div>
            <label className="text-sm font-bold text-slate-700">{t("startPointLabel")}</label>
          </div>
          <div className="pl-12">
            <AddressInput
              placeholder={t("startPointPlaceholder")}
              onSelect={(coords, text) => {
                setStartPoint(coords);
                setStartPointName(text);
              }}
              defaultValue={startPointName || ""}
              onMapPickerClick={() => setMapPickerActive(true, "start")}
            />
          </div>
        </div>

        <div className="relative z-10 pl-12 mb-6">
          <TransportToggle
            activeValue={startTransport}
            onChange={setStartTransport}
            options={TRANSPORT_OPTIONS}
          />
        </div>

        {/* --- ПРОМЕЖУТОЧНЫЕ ТОЧКИ --- */}
        {waypoints.map((wp, index) => (
          <div key={wp.id} className="relative mb-8" style={{ zIndex: 50 - index }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center border-2 border-white shadow-sm shrink-0">
                <span className="font-bold text-brand-600">{index + 1}</span>
              </div>
              <span className="text-sm font-bold text-slate-700">{t("waypointLabel")}</span>
              <button onClick={() => removeWaypoint(wp.id)} className="ml-auto text-slate-400 hover:text-red-500 p-1 transition-colors">
                <Trash2 size={18} />
              </button>
            </div>

            <div className="pl-12 flex flex-col gap-4">

              <div className="flex bg-slate-100 p-1 rounded-xl w-full">
                <button
                  onClick={() => updateWaypoint(wp.id, { type: "category" })}
                  className={cn("flex-1 text-xs font-bold py-2 rounded-lg transition-all", wp.type === "category" ? "bg-white shadow-sm text-brand-600" : "text-slate-500 hover:text-slate-700")}
                >
                  {t("typeCategory")}
                </button>
                <button
                  onClick={() => updateWaypoint(wp.id, { type: "address" })}
                  className={cn("flex-1 text-xs font-bold py-2 rounded-lg transition-all", wp.type === "address" ? "bg-white shadow-sm text-brand-600" : "text-slate-500 hover:text-slate-700")}
                >
                  {t("typeAddress")}
                </button>
              </div>

              {wp.type === "category" ? (
                <GridSelect
                  options={CATEGORIES}
                  value={wp.value}
                  onChange={(val) => updateWaypoint(wp.id, { value: val })}
                  placeholder={t("selectPlaceholder")}
                />
              ) : (
                <AddressInput
                  placeholder={t("startPointPlaceholder")}
                  onSelect={(coords, text) => updateWaypoint(wp.id, { value: text, coords })}
                  defaultValue={wp.value}
                  onMapPickerClick={() => {
                    updateWaypoint(wp.id, { type: "address" });
                    setMapPickerActive(true, wp.id);
                  }}
                />
              )}

              <div>
                <label className="text-xs font-bold text-slate-500 mb-2 block uppercase tracking-wider">{t("durationLabel")}</label>
                <PillSelect 
                  options={TIME_OPTIONS} 
                  value={wp.duration} 
                  onChange={(val) => updateWaypoint(wp.id, { duration: val })} 
                />
              </div>

              <div className="pt-2">
                <TransportToggle
                  activeValue={wp.modeToNext}
                  onChange={(mode) => updateWaypoint(wp.id, { modeToNext: mode })}
                  options={TRANSPORT_OPTIONS}
                />
              </div>
            </div>
          </div>
        ))}

        <div className="relative z-10 pl-12 mb-8">
          <Button variant="outline" size="sm" onClick={addWaypoint} leftIcon={<Plus size={16} />} className="w-full border-dashed bg-slate-50">
            {t("addWaypointButton")}
          </Button>
        </div>

        {/* --- КОНЕЧНАЯ ТОЧКА --- */}
        <div className="relative mb-8" style={{ zIndex: 10 }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center border-2 border-white shadow-sm shrink-0">
              <Flag size={18} className="text-white" />
            </div>
            <label className="text-sm font-bold text-slate-700">
              {t("endPointLabel")} <span className="font-normal text-slate-400">{t("endPointOptional")}</span>
            </label>
          </div>
          
          <div className="pl-12 flex flex-col gap-4">
            <div className="flex bg-slate-100 p-1 rounded-xl w-full">
              <button
                onClick={() => setEndPointType("address")}
                className={cn("flex-1 text-xs font-bold py-2 rounded-lg transition-all", endPointType === "address" ? "bg-white shadow-sm text-brand-600" : "text-slate-500 hover:text-slate-700")}
              >
                {t("typeAddress")}
              </button>
              <button
                onClick={() => setEndPointType("category")}
                className={cn("flex-1 text-xs font-bold py-2 rounded-lg transition-all", endPointType === "category" ? "bg-white shadow-sm text-brand-600" : "text-slate-500 hover:text-slate-700")}
              >
                {t("typeCategory")}
              </button>
            </div>

            {endPointType === "category" ? (
               <GridSelect
                 options={CATEGORIES}
                 value={endPointCategory}
                 onChange={setEndPointCategory}
                 placeholder={t("selectPlaceholder")}
               />
            ) : (
              <AddressInput
                placeholder={t("endPointPlaceholder")}
                onSelect={(coords, text) => {
                  setEndPoint(coords);
                  setEndPointName(text);
                }}
                defaultValue={endPointName || ""}
                onMapPickerClick={() => {
                  setEndPointType("address");
                  setMapPickerActive(true, "end");
                }}
              />
            )}
          </div>
        </div>

        <div className="relative z-0">
          <Button size="lg" className="w-full shadow-md" disabled={!startPoint} isLoading={isGenerating} onClick={handleBuildRoute} rightIcon={<Navigation size={20} />}>
            {isGenerating ? t("buildingRouteButton") : t("buildRouteButton")}
          </Button>
        </div>

      </div>
    </RoutePanel>

    <RouteErrorModal
      isOpen={errorModal.isOpen}
      onClose={() => setErrorModal({ isOpen: false, message: "" })}
      errorMessage={errorModal.message}
      categoryName={errorModal.categoryName}
      onRetry={handleRetry}
      onRemovePoint={handleRemovePoint}
    />

    <RouteDistanceWarningModal
      isOpen={distanceWarning.isOpen}
      onClose={handleCancelLongRoute}
      onProceed={handleProceedWithLongRoute}
      distance={distanceWarning.distance}
    />
  </>
  );
}