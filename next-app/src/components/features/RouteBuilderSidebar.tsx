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

import { useRouter } from 'next/navigation';
import { encodeRouteToUrl } from '@/utils/routeCodec';
import { Navigation, Footprints, Car, Bus, Plus, Trash2, MapPin, Coffee, TreePine, Landmark, Flag } from "lucide-react";

interface RouteBuilderSidebarProps {
  isNavigationOpen?: boolean;
}

export function RouteBuilderSidebar({ isNavigationOpen = false }: RouteBuilderSidebarProps) {
  const router = useRouter();
  const t = useTranslations("BuilderSidebar");
  
  // 1. Достаем всё из глобального стора вместо локального стейта
  const { 
    startPoint, setStartPoint, 
    startTransport, setStartTransport,
    waypoints, setWaypoints,
    endPoint, setEndPoint,
    endPointType, setEndPointType,
    endPointCategory, setEndPointCategory,
    setMapPoints, setIsRouteBuilt 
  } = useRouteStore();

  // Локальный стейт нужен только для спиннера на кнопке загрузки
  const [isGenerating, setIsGenerating] = useState(false);

  // Формируем массивы ВНУТРИ компонента, чтобы работал хук переводов t()
  const CATEGORIES = [
    { id: "cafe", title: t("catCafe"), icon: <Coffee size={18} /> },
    { id: "park", title: t("catPark"), icon: <TreePine size={18} /> },
    { id: "museum", title: t("catMuseum"), icon: <Landmark size={18} /> },
  ];

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
      duration: 60,
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



  const handleBuildRoute = () => {
    setIsGenerating(true);
    
    if (!startPoint) {
      setIsGenerating(false);
      return;
    }

    // Снимаем блокировку: разрешаем Менеджеру запустить процесс OSM
    setIsRouteBuilt(false); 

    // Очищаем waypoints от тяжелых данных перед кодированием в URL
    const cleanWaypoints = waypoints.map(wp => ({
      id: wp.id,
      type: wp.type,
      value: wp.value,
      coords: wp.coords,
      duration: wp.duration,
      modeToNext: wp.modeToNext,
      selectedAlternativeIndex: wp.selectedAlternativeIndex || 0
    }));

    const routeData = {
      startPoint,
      startTransport,
      waypoints: cleanWaypoints,
      endPoint: endPointType === "address" ? endPoint : null,
      endPointType,
      endPointCategory
    };

    const encodedString = encodeRouteToUrl(routeData);
    router.push(`?r=${encodedString}`, { scroll: false });
    
    setIsGenerating(false);
  };

  return (
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
            <AddressInput placeholder={t("startPointPlaceholder")} onSelect={setStartPoint} />
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
                <button className="flex-1 text-xs font-bold py-2 rounded-lg text-slate-400 cursor-not-allowed">
                  {t("typeMap")}
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
                <AddressInput placeholder={t("startPointPlaceholder")} onSelect={(coords, text) => updateWaypoint(wp.id, { value: text, coords })} />
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
              <button className="flex-1 text-xs font-bold py-2 rounded-lg text-slate-400 cursor-not-allowed">
                {t("typeMap")}
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
              <AddressInput placeholder={t("endPointPlaceholder")} onSelect={setEndPoint} />
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
  );
}