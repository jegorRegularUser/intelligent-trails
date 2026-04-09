"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { RoutePanel } from "@/components/ui/RoutePanel";
import { Button } from "@/components/ui/Button";
import { WaypointItem } from "@/components/features/WaypointItem";
import { TravelInfo } from "@/components/ui/TravelInfo";
import { useRouteStore } from "@/store/useRouteStore";
import { encodeRouteToUrl } from "@/utils/routeCodec";
import { RefreshCw, Navigation, ArrowLeft } from "lucide-react";

export function RouteResultSidebar() {
  const router = useRouter();
  const t = useTranslations("BuilderSidebar");
  
  const { 
    mapPoints, setMapPoints, 
    waypoints, setWaypoints, 
    startPoint, startTransport, setStartPoint, setStartTransport,
    endPoint, endPointType, endPointCategory, setEndPoint, setEndPointType, setEndPointCategory, 
    setIsRouteBuilt 
  } = useRouteStore();
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isRebuilding, setIsRebuilding] = useState(false);

  // Утилита, которая забирает ТОЛЬКО нужные данные для жесткого сохранения в URL
  const getCleanWaypoints = (wps: typeof waypoints) => wps.map(wp => ({
    id: wp.id,
    type: wp.type,
    value: wp.value,
    originalCategory: wp.originalCategory || wp.value, // Сохраняем интент ("кафе")
    resolvedName: wp.resolvedName || wp.value,         // Сохраняем имя ("Шоколадница")
    coords: wp.coords,                                 // ЖЕСТКИЕ КООРДИНАТЫ
    address: wp.address,
    duration: wp.duration,
    modeToNext: wp.modeToNext,
    selectedAlternativeIndex: wp.selectedAlternativeIndex || 0
  }));

  const handleRebuild = () => {
    setIsRebuilding(true);
    setIsRouteBuilt(false); // Открываем замок для Менеджера, если пользователь захотел ПЕРЕстроить
    
    const routeData = {
      startPoint,
      startTransport,
      startPointName: mapPoints[0]?.name,
      waypoints: getCleanWaypoints(waypoints),
      endPoint: endPointType === "address" ? endPoint : mapPoints[mapPoints.length - 1]?.coordinates,
      endPointType,
      endPointCategory,
      endPointName: mapPoints[mapPoints.length - 1]?.name
    };

    const encoded = encodeRouteToUrl(routeData);
    router.push(`?r=${encoded}`, { scroll: false });
    
    setEditingId(null);
    setIsRebuilding(false);
  };

  return (
    <RoutePanel
      className="pb-[100px]"
      header={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsRouteBuilt(false)} 
              className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500 active:scale-95"
            >
              <ArrowLeft size={20} />
            </button>
            <h2 className="text-xl font-bold text-slate-800">Ваш путь</h2>
          </div>
          <div className="p-2 bg-brand-500 text-white rounded-xl shadow-sm">
            <Navigation size={20} />
          </div>
        </div>
      }
    >
      <div className="flex flex-col relative">
        
        {/* --- 1. СТАРТ --- */}
        <div className="relative" style={{ zIndex: 60 }}>
          <WaypointItem
            variant="start"
            isEditing={editingId === 'start'}
            showDoneButton={true}
            data={{ id: 'start', type: 'address', value: mapPoints[0]?.name || "", modeToNext: startTransport }}
            resolvedName={mapPoints[0]?.name}
            resolvedAddress={mapPoints[0]?.address}
            onEdit={() => setEditingId(editingId === 'start' ? null : 'start')}
            onSave={(u) => { 
              if (u.coords) setStartPoint(u.coords); 
              if (u.modeToNext) setStartTransport(u.modeToNext); 
            }}
          />
        </div>

        {mapPoints[0] && (
           <TravelInfo mode={startTransport} distance={mapPoints[0].distanceToNext} duration={mapPoints[0].durationToNext} />
        )}

        {/* --- 2. ПРОМЕЖУТОЧНЫЕ ТОЧКИ --- */}
        {waypoints.map((wp, index) => {
          const mapPoint = mapPoints[index + 1];
          const isEditing = editingId === wp.id;

          return (
            <div key={wp.id} className="relative" style={{ zIndex: 50 - index }}>
              <WaypointItem
                variant="waypoint"
                index={index + 1}
                isEditing={isEditing}
                showDoneButton={true}
                data={wp} 
                resolvedName={mapPoint?.name}
                resolvedAddress={mapPoint?.address}
                onEdit={() => setEditingId(isEditing ? null : wp.id)}
                onSave={(u) => setWaypoints(prev => prev.map(item => item.id === wp.id ? { ...item, ...u } : item))}
                onRemove={() => setWaypoints(prev => prev.filter(item => item.id !== wp.id))}
                onAlternativeSelect={(altIndex) => {
                  const selectedAlt = wp.alternatives?.[altIndex];
                  if (!selectedAlt) return;

                  // 1. Атомарно обновляем Zustand (Черновик)
                  const newWaypoints = waypoints.map(item => 
                    item.id === wp.id ? { 
                      ...item, 
                      selectedAlternativeIndex: altIndex,
                      coords: selectedAlt.coordinates,
                      resolvedName: selectedAlt.name,
                      address: selectedAlt.address
                    } : item
                  );
                  setWaypoints(newWaypoints);

                  // 2. Атомарно обновляем Zustand (Карта) - сбрасываем метрики, Яндекс.Карты сами нарисуют новую линию!
                  const newMapPoints = [...mapPoints];
                  newMapPoints[index + 1] = {
                    ...newMapPoints[index + 1],
                    coordinates: selectedAlt.coordinates,
                    name: selectedAlt.name,
                    address: selectedAlt.address,
                    distanceToNext: undefined, 
                    durationToNext: undefined
                  };
                  if (newMapPoints[index]) {
                    newMapPoints[index].distanceToNext = undefined;
                    newMapPoints[index].durationToNext = undefined;
                  }
                  setMapPoints(newMapPoints);

                  // 3. ТИХО ОБНОВЛЯЕМ URL С НОВЫМИ КООРДИНАТАМИ
                  const routeData = {
                    startPoint, startTransport, startPointName: mapPoints[0]?.name,
                    waypoints: getCleanWaypoints(newWaypoints),
                    endPoint: endPointType === "address" ? endPoint : mapPoints[mapPoints.length - 1]?.coordinates,
                    endPointType, endPointCategory, endPointName: mapPoints[mapPoints.length - 1]?.name
                  };
                  const encoded = encodeRouteToUrl(routeData);
                  window.history.replaceState(null, '', `?r=${encoded}`);
                }}
              />
              
              {!isEditing && mapPoint && (
                <TravelInfo mode={wp.modeToNext} distance={mapPoint.distanceToNext} duration={mapPoint.durationToNext} />
              )}
            </div>
          );
        })}

        {/* --- 3. ФИНИШ --- */}
        {endPoint && mapPoints.length > 1 && (
          <div className="relative" style={{ zIndex: 10 }}>
            <WaypointItem
              variant="end"
              isLast={true}
              isEditing={editingId === 'end'}
              showDoneButton={true}
              data={{ 
                id: 'end', type: endPointType, 
                value: endPointType === "category" ? endPointCategory : mapPoints[mapPoints.length - 1]?.name || "",
                alternatives: mapPoints[mapPoints.length - 1]?.alternatives,
                selectedAlternativeIndex: mapPoints[mapPoints.length - 1]?.selectedAlternativeIndex
              }}
              resolvedName={mapPoints[mapPoints.length - 1]?.name}
              resolvedAddress={mapPoints[mapPoints.length - 1]?.address}
              onEdit={() => setEditingId(editingId === 'end' ? null : 'end')}
              onSave={(u) => { 
                if (u.type) setEndPointType(u.type as any);
                if (u.type === "category" && u.value) setEndPointCategory(u.value);
                if (u.coords) setEndPoint(u.coords); 
              }}
              onAlternativeSelect={(altIndex) => {
                const mapPointIndex = mapPoints.length - 1;
                const endMapPoint = mapPoints[mapPointIndex];
                const selectedAlt = endMapPoint.alternatives?.[altIndex];
                if (!selectedAlt) return;

                const newMapPoints = [...mapPoints];
                newMapPoints[mapPointIndex] = {
                  ...endMapPoint, coordinates: selectedAlt.coordinates, name: selectedAlt.name,
                  address: selectedAlt.address, selectedAlternativeIndex: altIndex
                };
                if (newMapPoints[mapPointIndex - 1]) {
                  newMapPoints[mapPointIndex - 1].distanceToNext = undefined;
                  newMapPoints[mapPointIndex - 1].durationToNext = undefined;
                }
                setMapPoints(newMapPoints);

                const routeData = {
                  startPoint, startTransport, startPointName: mapPoints[0]?.name,
                  waypoints: getCleanWaypoints(waypoints),
                  endPoint: selectedAlt.coordinates,
                  endPointType: "category" as const, endPointCategory, endPointName: selectedAlt.name
                };
                const encoded = encodeRouteToUrl(routeData);
                window.history.replaceState(null, '', `?r=${encoded}`);
              }}
            />
          </div>
        )}

      </div>

      <div className="absolute bottom-0 left-0 right-0 p-6 bg-white/90 backdrop-blur-md border-t border-slate-100 z-30">
        <Button 
          className="w-full h-14 shadow-lg shadow-brand-500/20" 
          size="lg" 
          onClick={handleRebuild} 
          isLoading={isRebuilding} 
          leftIcon={<RefreshCw size={20} className={isRebuilding ? "animate-spin" : ""} />}
        >
          Обновить маршрут
        </Button>
      </div>
    </RoutePanel>
  );
}