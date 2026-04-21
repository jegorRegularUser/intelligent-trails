"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { RoutePanel } from "@/components/ui/RoutePanel";
import { Button } from "@/components/ui/Button";
import { WaypointItem } from "@/components/features/WaypointItem";
import { TravelInfo } from "@/components/ui/TravelInfo";
import { useRouteStore } from "@/store/useRouteStore";
import { encodeRouteToUrl } from "@/utils/routeCodec";
import { saveRouteAction } from "@/actions/routes";
import { useToast } from "@/contexts/ToastContext";
import { useRouteUrlSync } from "@/hooks/useRouteUrlSync";
import { usePreferences } from "@/contexts/PreferencesContext";
import { formatDistance } from "@/utils/format";
import { RefreshCw, Navigation, ArrowLeft, Bookmark, Share2 } from "lucide-react";

interface RouteResultSidebarProps {
  isNavigationOpen?: boolean;
}

export function RouteResultSidebar({ isNavigationOpen = false }: RouteResultSidebarProps) {
  const router = useRouter();
  const t = useTranslations("BuilderSidebar");
  const tHistory = useTranslations("History");
  const { showToast } = useToast();
  const { distanceUnit, locale } = usePreferences();

  // Автоматическая синхронизация URL с метриками от Яндекса
  useRouteUrlSync();

  const {
    mapPoints, setMapPoints,
    waypoints, setWaypoints,
    startPoint, startTransport, setStartPoint, setStartTransport, startPointName, setStartPointName,
    endPoint, endPointType, endPointCategory, setEndPoint, setEndPointType, setEndPointCategory, endPointName, setEndPointName,
    setIsRouteBuilt,
    setMapPickerActive
  } = useRouteStore();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  // Сбрасываем флаг сохранения при изменении маршрута
  useEffect(() => {
    setIsSaved(false);
  }, [mapPoints, waypoints, startPoint, endPoint]);

  const handleShareRoute = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      showToast(t('routeLinkCopied'), 'success');
    }).catch(() => {
      showToast(t('routeLinkCopyError'), 'error');
    });
  };

  // Маппинг категорий на переводы
  const getCategoryName = (categoryId: string) => {
    const map: Record<string, string> = {
      cafe: t("catCafe"),
      park: t("catPark"),
      museum: t("catMuseum")
    };
    return map[categoryId] || categoryId;
  };

  // Утилита для подготовки данных маршрута к сохранению в URL
  const prepareRouteData = () => {
    return {
      startPoint,
      startPointName: mapPoints[0]?.name,
      startPointAddress: mapPoints[0]?.address,
      startTransport,
      startDistanceToNext: mapPoints[0]?.distanceToNext, // Метрики первого сегмента
      startDurationToNext: mapPoints[0]?.durationToNext,
      waypoints: waypoints.map((wp, index) => {
        // Метрики distanceToNext/durationToNext хранятся в текущей точке mapPoints,
        // а не в следующей (это расстояние ОТ текущей точки ДО следующей)
        const currentMapPoint = mapPoints[index + 1]; // +1 потому что mapPoints[0] это старт
        return {
          id: wp.id,
          type: wp.type,
          value: wp.value,
          originalCategory: wp.originalCategory || wp.value,
          resolvedName: wp.resolvedName || wp.value,
          coords: wp.coords,
          address: wp.address,
          stayDuration: wp.duration, // Используем duration из FormWaypoint как stayDuration
          duration: wp.duration, // Обратная совместимость
          modeToNext: wp.modeToNext,
          selectedAlternativeIndex: wp.selectedAlternativeIndex || 0,
          alternatives: wp.alternatives,
          distanceToNext: currentMapPoint?.distanceToNext,
          durationToNext: currentMapPoint?.durationToNext,
        };
      }),
      endPoint: endPointType === "address" ? endPoint : mapPoints[mapPoints.length - 1]?.coordinates,
      endPointName: mapPoints[mapPoints.length - 1]?.name,
      endPointAddress: mapPoints[mapPoints.length - 1]?.address,
      endPointType,
      endPointCategory,
    };
  };

  const handleSaveRoute = async () => {
    setIsSaving(true);

    try {
      const routeData = prepareRouteData();
      const encoded = encodeRouteToUrl(routeData);

      // Генерируем название маршрута
      const startName = mapPoints[0]?.name || 'Начало';
      const endName = mapPoints[mapPoints.length - 1]?.name || 'Конец';
      const routeName = `${startName} → ${endName}`;

      const result = await saveRouteAction({
        name: routeName,
        encodedRoute: encoded,
        tags: [],
      });

      if (result.isDuplicate) {
        showToast(tHistory('routeAlreadySaved'), 'info');
      } else {
        showToast(tHistory('routeSaved'), 'success');
        setIsSaved(true);
      }
    } catch (error: any) {
      if (error.message === 'Unauthorized') {
        showToast(tHistory('loginToSave'), 'error');
        router.push('/signin');
      } else {
        showToast(tHistory('routeSaveError'), 'error');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <RoutePanel
      className="pb-[20px]"
      isNavigationOpen={isNavigationOpen}
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
          <div className="flex items-center gap-2">
            <button
              onClick={handleShareRoute}
              className="p-2 hover:bg-blue-50 rounded-xl transition-colors text-blue-600 active:scale-95"
              title={t('shareRoute')}
            >
              <Share2 size={20} />
            </button>
            <button
              onClick={handleSaveRoute}
              disabled={isSaving || isSaved}
              className="p-2 hover:bg-brand-50 rounded-xl transition-colors text-brand-600 active:scale-95 disabled:opacity-50"
              title={isSaved ? t('routeSaved') : t('saveRoute')}
            >
              <Bookmark size={20} fill={isSaved || isSaving ? "currentColor" : "none"} />
            </button>
            <div className="p-2 bg-brand-500 text-white rounded-xl shadow-sm">
              <Navigation size={20} />
            </div>
          </div>
        </div>
      }
    >
      <div className="flex flex-col relative">

        {/* Общая информация по маршруту */}
        <div className="mb-4 p-4 bg-gradient-to-r from-brand-50 to-blue-50 rounded-2xl border border-brand-100">
          <div className="flex items-center justify-around gap-4">
            <div className="flex flex-col items-center">
              <span className="text-sm text-slate-600 mb-1">{t("totalDistance")}</span>
              <span className="text-2xl font-bold text-brand-700">
                {(() => {
                  const total = mapPoints.reduce((sum, point) => sum + (point.distanceToNext || 0), 0);
                  return formatDistance(total, locale, distanceUnit);
                })()}
              </span>
            </div>
            <div className="w-px h-12 bg-brand-200"></div>
            <div className="flex flex-col items-center">
              <span className="text-sm text-slate-600 mb-1">{t("totalDuration")}</span>
              <span className="text-2xl font-bold text-brand-700">
                {(() => {
                  const total = mapPoints.reduce((sum, point) => sum + (point.durationToNext || 0), 0);
                  const hours = Math.floor(total / 3600);
                  const minutes = Math.round((total % 3600) / 60);
                  if (hours > 0) {
                    return `${hours} ч ${minutes} мин`;
                  }
                  return `${minutes} мин`;
                })()}
              </span>
            </div>
          </div>
        </div>

        {/* --- 1. СТАРТ --- */}
        <div className="relative" style={{ zIndex: 60 }}>
          <WaypointItem
            variant="start"
            isEditing={editingId === 'start'}
            showDoneButton={true}
            readOnlyFields={true}
            data={{ id: 'start', type: 'address', value: startPointName || mapPoints[0]?.name || "", modeToNext: startTransport }}
            resolvedName={mapPoints[0]?.name}
            resolvedAddress={mapPoints[0]?.address}
            onEdit={() => {
              if (editingId === 'start') {
                setEditingId(null);
              } else {
                setEditingId('start');
              }
            }}
            onMapPickerClick={() => setMapPickerActive(true, 'start')}
            onSave={async (u) => {
              // Обновляем данные в store
              if (u.coords) {
                setStartPoint(u.coords);
                setStartPointName(u.value || startPointName);
                const newMapPoints = [...mapPoints];
                if (newMapPoints[0]) {
                  newMapPoints[0] = {
                    ...newMapPoints[0],
                    coordinates: u.coords,
                    name: u.value || newMapPoints[0].name,
                    address: u.value
                  };
                  setMapPoints(newMapPoints);
                }
              }

              if (u.modeToNext) setStartTransport(u.modeToNext);

              // Обновляем URL
              const routeData = prepareRouteData();
              const encoded = encodeRouteToUrl(routeData);
              window.history.replaceState(null, '', `?r=${encoded}`);

              // Если изменился способ передвижения, сбрасываем метрики
              if (u.modeToNext && u.modeToNext !== startTransport) {
                const newMapPoints = [...mapPoints];
                if (newMapPoints[0]) {
                  newMapPoints[0] = {
                    ...newMapPoints[0],
                    modeToNext: u.modeToNext,
                    distanceToNext: undefined,
                    durationToNext: undefined,
                    transportAlternatives: undefined
                  };
                  setMapPoints(newMapPoints);
                }
              }
            }}
          />
        </div>

        {mapPoints[0] && (
           <TravelInfo
             mode={startTransport}
             distance={mapPoints[0].distanceToNext}
             duration={mapPoints[0].durationToNext}
             transportAlternatives={mapPoints[0].transportAlternatives}
           />
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
                readOnlyFields={true}
                data={wp}
                resolvedName={mapPoint?.name}
                resolvedAddress={mapPoint?.address}
                onEdit={() => {
                  if (isEditing) {
                    setEditingId(null);
                  } else {
                    setEditingId(wp.id);
                  }
                }}
                onMapPickerClick={() => setMapPickerActive(true, wp.id)}
                onSave={async (u) => {
                  let updatedWaypoints = waypoints;
                  let newMapPoints = [...mapPoints];

                  // Обновляем данные точки
                  if (u.coords) {
                    updatedWaypoints = waypoints.map(item =>
                      item.id === wp.id ? { ...item, ...u } : item
                    );
                    setWaypoints(updatedWaypoints);

                    if (newMapPoints[index + 1]) {
                      newMapPoints[index + 1] = {
                        ...newMapPoints[index + 1],
                        coordinates: u.coords,
                        name: u.value || newMapPoints[index + 1].name,
                        address: u.value,
                        distanceToNext: undefined,
                        durationToNext: undefined
                      };
                      if (newMapPoints[index]) {
                        newMapPoints[index].distanceToNext = undefined;
                        newMapPoints[index].durationToNext = undefined;
                      }
                      setMapPoints(newMapPoints);
                    }
                  }
                  // Обновление других параметров
                  else {
                    updatedWaypoints = waypoints.map(item =>
                      item.id === wp.id ? { ...item, ...u } : item
                    );
                    setWaypoints(updatedWaypoints);
                  }

                  // Обновляем URL
                  const routeData = prepareRouteData();
                  const encoded = encodeRouteToUrl(routeData);
                  window.history.replaceState(null, '', `?r=${encoded}`);

                  // Если изменился способ передвижения, сбрасываем метрики
                  if (u.modeToNext && u.modeToNext !== wp.modeToNext) {
                    const newMapPoints = [...mapPoints];
                    if (newMapPoints[index + 1]) {
                      newMapPoints[index + 1] = {
                        ...newMapPoints[index + 1],
                        modeToNext: u.modeToNext,
                        distanceToNext: undefined,
                        durationToNext: undefined,
                        transportAlternatives: undefined
                      };
                      if (newMapPoints[index]) {
                        newMapPoints[index].distanceToNext = undefined;
                        newMapPoints[index].durationToNext = undefined;
                      }
                      setMapPoints(newMapPoints);
                    }
                  }
                }}
                onRemove={() => setWaypoints(prev => prev.filter(item => item.id !== wp.id))}
                onAlternativeSelect={(altIndex) => {
                  const selectedAlt = wp.alternatives?.[altIndex];
                  if (!selectedAlt) return;

                  // Обновляем waypoints
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

                  // Обновляем mapPoints - сбрасываем метрики
                  const newMapPoints = [...mapPoints];
                  newMapPoints[index + 1] = {
                    ...newMapPoints[index + 1],
                    coordinates: selectedAlt.coordinates,
                    name: selectedAlt.name,
                    address: selectedAlt.address,
                    selectedAlternativeIndex: altIndex,
                    distanceToNext: undefined,
                    durationToNext: undefined
                  };
                  if (newMapPoints[index]) {
                    newMapPoints[index].distanceToNext = undefined;
                    newMapPoints[index].durationToNext = undefined;
                  }
                  setMapPoints(newMapPoints);

                  // Обновляем URL
                  const routeData = prepareRouteData();
                  const encoded = encodeRouteToUrl(routeData);
                  window.history.replaceState(null, '', `?r=${encoded}`);
                }}
              />

              {!isEditing && mapPoint && (
                <TravelInfo
                  mode={wp.modeToNext}
                  distance={mapPoint.distanceToNext}
                  duration={mapPoint.durationToNext}
                  transportAlternatives={mapPoint.transportAlternatives}
                />
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
              readOnlyFields={true}
              data={{
                id: 'end', type: endPointType,
                value: endPointType === "category" ? endPointCategory : (endPointName || mapPoints[mapPoints.length - 1]?.name || ""),
                alternatives: mapPoints[mapPoints.length - 1]?.alternatives,
                selectedAlternativeIndex: mapPoints[mapPoints.length - 1]?.selectedAlternativeIndex
              }}
              resolvedName={mapPoints[mapPoints.length - 1]?.name}
              resolvedAddress={mapPoints[mapPoints.length - 1]?.address}
              onEdit={() => {
                if (editingId === 'end') {
                  setEditingId(null);
                } else {
                  setEditingId('end');
                }
              }}
              onMapPickerClick={() => setMapPickerActive(true, 'end')}
              onSave={async (u) => {
                if (u.type) setEndPointType(u.type as any);
                if (u.type === "category" && u.value) setEndPointCategory(u.value);

                const newMapPoints = [...mapPoints];
                const endIndex = mapPoints.length - 1;

                // Обновляем координаты финиша
                if (u.coords) {
                  setEndPoint(u.coords);
                  setEndPointName(u.value || endPointName);
                  if (newMapPoints[endIndex]) {
                    newMapPoints[endIndex] = {
                      ...newMapPoints[endIndex],
                      coordinates: u.coords,
                      name: u.value || newMapPoints[endIndex].name,
                      address: u.value
                    };
                    if (newMapPoints[endIndex - 1]) {
                      newMapPoints[endIndex - 1].distanceToNext = undefined;
                      newMapPoints[endIndex - 1].durationToNext = undefined;
                    }
                    setMapPoints(newMapPoints);
                  }
                }

                // Обновляем URL
                const routeData = prepareRouteData();
                const encoded = encodeRouteToUrl(routeData);
                window.history.replaceState(null, '', `?r=${encoded}`);
              }}
              onAlternativeSelect={(altIndex) => {
                const mapPointIndex = mapPoints.length - 1;
                const endMapPoint = mapPoints[mapPointIndex];
                const selectedAlt = endMapPoint.alternatives?.[altIndex];
                if (!selectedAlt) return;

                const newMapPoints = [...mapPoints];
                newMapPoints[mapPointIndex] = {
                  ...endMapPoint,
                  coordinates: selectedAlt.coordinates,
                  name: selectedAlt.name,
                  address: selectedAlt.address,
                  selectedAlternativeIndex: altIndex
                };
                if (newMapPoints[mapPointIndex - 1]) {
                  newMapPoints[mapPointIndex - 1].distanceToNext = undefined;
                  newMapPoints[mapPointIndex - 1].durationToNext = undefined;
                }
                setMapPoints(newMapPoints);
                setEndPoint(selectedAlt.coordinates);
                setEndPointName(selectedAlt.name);

                const routeData = prepareRouteData();
                const encoded = encodeRouteToUrl(routeData);
                window.history.replaceState(null, '', `?r=${encoded}`);
              }}
            />
          </div>
        )}

      </div>
    </RoutePanel>
  );
}