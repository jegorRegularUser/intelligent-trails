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
import { formatDistance, formatDuration } from "@/utils/format";

export function RouteResultSidebar() {
  const router = useRouter();
  const t = useTranslations("BuilderSidebar");
  
  const { 
    mapPoints, waypoints, setWaypoints, 
    startPoint, startTransport, setStartPoint, setStartTransport,
    endPoint, endPointType, endPointCategory, setEndPoint, setEndPointType, setEndPointCategory, 
    setIsRouteBuilt 
  } = useRouteStore();
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isRebuilding, setIsRebuilding] = useState(false);

  const handleRebuild = () => {
    setIsRebuilding(true);
    
    const routeData = {
      startPoint,
      startTransport,
      waypoints,
      endPoint,
      endPointType,
      endPointCategory,
      // Сохраняем названия из mapPoints, чтобы избежать мерцания при перезагрузке
      startPointName: mapPoints[0]?.name || "",
      endPointName: mapPoints[mapPoints.length - 1]?.name || ""
    };
    const encoded = encodeRouteToUrl(routeData);
    router.push(`?r=${encoded}`, { scroll: false });
    
    // Менеджер сайдбаров сам сбросит состояние, когда увидит новый URL
    // Но мы закроем режим редактирования сразу для отзывчивости
    setEditingId(null);
    setIsRebuilding(false);
  };
  console.log(mapPoints)
  return (
    <RoutePanel
      className="pb-[100px]"
      header={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsRouteBuilt(false)} 
              className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500"
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
            data={{ 
              id: 'start', 
              type: 'address', 
              value: mapPoints[0]?.name || "", 
              modeToNext: startTransport 
            }}
            resolvedName={mapPoints[0]?.name}
            resolvedAddress={mapPoints[0]?.address}
            onEdit={() => setEditingId(editingId === 'start' ? null : 'start')}
            onSave={(u) => { 
              if (u.coords) setStartPoint(u.coords); 
              if (u.modeToNext) setStartTransport(u.modeToNext); 
            }}
          />
        </div>

        {/* РЕАЛЬНЫЕ ДАННЫЕ О ПУТИ: берем из первого mapPoint (дистанция до следующей точки) */}
        {mapPoints[0] && (
           <TravelInfo 
             mode={startTransport} 
             distance={mapPoints[0].distanceToNext || 0} 
             duration={mapPoints[0].durationToNext || 0} 
           />
        )}

        {/* --- ПРОМЕЖУТОЧНЫЕ ТОЧКИ --- */}
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
                // ВАЖНО: передаем весь wp, где лежат .alternatives и .selectedAlternativeIndex
                data={wp} 
                resolvedName={mapPoint?.name}
                resolvedAddress={mapPoint?.address}
                onEdit={() => setEditingId(isEditing ? null : wp.id)}
                onSave={(u) => setWaypoints(prev => prev.map(item => item.id === wp.id ? { ...item, ...u } : item))}
                onRemove={() => setWaypoints(prev => prev.filter(item => item.id !== wp.id))}
                onAlternativeSelect={(altIndex) => {
                  setWaypoints(prev => prev.map(item => 
                    item.id === wp.id ? { ...item, selectedAlternativeIndex: altIndex } : item
                  ));
                }}
              />
              
              {/* Метрики (реальные данные из стора) */}
              {!isEditing && mapPoint && (
                <TravelInfo 
                  mode={wp.modeToNext} 
                  distance={mapPoint.distanceToNext} 
                  duration={mapPoint.durationToNext} 
                />
              )}
            </div>
          );
        })}
        {/* --- 3. ФИНИШ --- */}
        {endPoint && (
          <div className="relative" style={{ zIndex: 10 }}>
            <WaypointItem
              variant="end"
              isLast={true}
              isEditing={editingId === 'end'}
              showDoneButton={true}
              data={{ 
                id: 'end', 
                type: endPointType, 
                value: endPointType === "category" ? endPointCategory : mapPoints[mapPoints.length - 1]?.name || "" 
              }}
              resolvedName={mapPoints[mapPoints.length - 1]?.name}
              resolvedAddress={mapPoints[mapPoints.length - 1]?.address}
              onEdit={() => setEditingId(editingId === 'end' ? null : 'end')}
              onSave={(u) => { 
                if (u.type) setEndPointType(u.type as any);
                if (u.type === "category" && u.value) setEndPointCategory(u.value);
                if (u.coords) setEndPoint(u.coords); 
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