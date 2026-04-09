"use client";

import { AddressInput } from "@/components/ui/AddressInput";
import { PillSelect } from "@/components/ui/PillSelect";
import { GridSelect } from "@/components/ui/GridSelect";
import { TransportToggle } from "@/components/ui/TransportToggle";
import { AlternativesSelect } from "@/components/ui/AlternativesSelect";
import { 
  MapPin, Check, Coffee, TreePine, Landmark, 
  Flag, Trash2, Pencil, Footprints, Car, Bus, Bike 
} from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/utils/cn";
import { RoutingMode, PlaceOfInterest } from "@/types/map";

export interface WaypointData {
  id: string;
  type: "address" | "category" | "map";
  value: string;
  duration?: number;
  modeToNext?: RoutingMode;
  alternatives?: PlaceOfInterest[];
  selectedAlternativeIndex?: number;
}

interface WaypointItemProps {
  variant: "start" | "waypoint" | "end";
  data: WaypointData;
  index?: number;
  isLast?: boolean;
  isEditing: boolean;
  showDoneButton?: boolean;
  resolvedName?: string;
  resolvedAddress?: string;
  onEdit?: () => void;
  onSave: (updates: Partial<WaypointData> & { coords?: any }) => void;
  onRemove?: () => void;
  onAlternativeSelect?: (index: number) => void;
}

export function WaypointItem({
  variant, data, index, isLast, isEditing, showDoneButton, resolvedName, resolvedAddress, onEdit, onSave, onRemove, onAlternativeSelect
}: WaypointItemProps) {
  const t = useTranslations("BuilderSidebar");

  /**
   * ЛОГИКА ЗАГОЛОВКОВ (Согласно ТЗ)
   * displayTitle: Сначала ищем реальное название (Парк Кулибина). 
   * Если его нет — берем адрес (Агрономическая, 132).
   * Если и адреса нет — берем то, что введено (data.value).
   */
  const displayTitle = resolvedName || resolvedAddress || data.value || t("loading");
  
  /**
   * Подзаголовок: Показываем адрес только если он отличается от заголовка.
   */
  let displaySubtitle = null;
  if (resolvedAddress && resolvedAddress !== displayTitle) {
    const titleLower = displayTitle.toLowerCase();
    const addrLower = resolvedAddress.toLowerCase();
    
    // Показываем подзаголовок ТОЛЬКО если адрес не содержит название (и наоборот)
    if (!addrLower.includes(titleLower) && !titleLower.includes(addrLower)) {
      displaySubtitle = resolvedAddress;
    }
  }

  /**
   * ЛОГИКА АЛЬТЕРНАТИВ
   * Показываем селектор, если это НЕ старт (старт всегда фиксирован) 
   * и у нас в данных уже лежат найденные варианты.
   */
  const showAlternatives = 
    variant !== "start" && 
    data.alternatives && 
    data.alternatives.length > 1 && 
    onAlternativeSelect;

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
    { value: "pedestrian" as RoutingMode, label: t("transportPedestrian"), icon: <Footprints size={16} /> },
    { value: "auto" as RoutingMode, label: t("transportAuto"), icon: <Car size={16} /> },
    { value: "masstransit" as RoutingMode, label: t("transportMassTransit"), icon: <Bus size={16} /> },
    { value: "bicycle" as RoutingMode, label: t("transportBicycle"), icon: <Bike size={18} /> },
  ];

  return (
    <div className={cn("relative flex gap-4 pb-8", isLast && "pb-0")}>
      
      {/* ЛЕВАЯ КОЛОНКА (ИКОНКИ) */}
      <div className="flex flex-col items-center shrink-0">
        <div className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center border-2 border-white shadow-sm z-10",
          variant === "start" ? "bg-slate-100 text-slate-500" :
          variant === "end" ? "bg-slate-800 text-white" : "bg-brand-100 text-brand-600"
        )}>
          {variant === "start" ? <MapPin size={18} /> :
           variant === "end" ? <Flag size={18} /> : <span className="font-bold">{index}</span>}
        </div>
        {!isLast && <div className="absolute left-[19px] top-10 bottom-0 w-0.5 bg-slate-200 z-0" />}
      </div>

      {/* ПРАВАЯ КОЛОНКА (КОНТЕНТ) */}
      <div className="flex-1 pt-1 min-w-0">
        {isEditing ? (
          /* --- РЕЖИМ РЕДАКТИРОВАНИЯ --- */
          <div className="flex flex-col gap-4 p-4 bg-white rounded-2xl border border-brand-100 shadow-sm animate-in fade-in zoom-in duration-200">
             <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                {variant === "start" ? t("startPointLabel") : variant === "end" ? t("endPointLabel") : `${t("waypointLabel")} ${index}`}
              </span>
              {variant === "waypoint" && onRemove && (
                <button type="button" onClick={onRemove} className="text-slate-300 hover:text-red-500 p-1 transition-colors">
                  <Trash2 size={16} />
                </button>
              )}
            </div>

            {/* Переключатель Категория/Адрес (только для промежуточных и финиша) */}
            {variant !== "start" && (
              <div className="flex bg-slate-100 p-1 rounded-xl w-full">
                <button 
                  type="button"
                  onClick={() => onSave({ type: "category" })}
                  className={cn("flex-1 text-[10px] font-bold py-1.5 rounded-lg transition-all", data.type === "category" ? "bg-white shadow-sm text-brand-600" : "text-slate-500 hover:text-slate-700")}
                >
                  {t("typeCategory").toUpperCase()}
                </button>
                <button 
                  type="button"
                  onClick={() => onSave({ type: "address" })}
                  className={cn("flex-1 text-[10px] font-bold py-1.5 rounded-lg transition-all", data.type === "address" ? "bg-white shadow-sm text-brand-600" : "text-slate-500 hover:text-slate-700")}
                >
                  {t("typeAddress").toUpperCase()}
                </button>
              </div>
            )}

            {/* Поле ввода */}
            {data.type === "category" ? (
              <GridSelect 
                options={CATEGORIES} 
                value={data.value} 
                onChange={(v) => onSave({ value: v })} 
              />
            ) : (
              <AddressInput 
                defaultValue={data.value} 
                onSelect={(c, v) => onSave({ coords: c, value: v })} 
                placeholder={t("enterAddress")}
              />
            )}

            {/* Настройки транспорта и времени */}
            {variant !== "end" && (
              <div className="space-y-4">
                {variant === "waypoint" && (
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">{t("durationLabel")}</label>
                    <PillSelect options={TIME_OPTIONS} value={data.duration || 60} onChange={(v) => onSave({ duration: v })} />
                  </div>
                )}
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">{t("transportLabel")}</label>
                  <TransportToggle activeValue={data.modeToNext || 'pedestrian'} onChange={(v) => onSave({ modeToNext: v })} options={TRANSPORT_OPTIONS} />
                </div>
              </div>
            )}

            {showDoneButton && (
              <button 
                type="button" 
                onClick={onEdit} 
                className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors shadow-lg shadow-slate-200"
              >
                <Check size={18} /> {t("done")}
              </button>
            )}
          </div>
        ) : (
          /* --- РЕЖИМ ПРОСМОТРА --- */
          <div className="flex justify-between items-start gap-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="flex-1 min-w-0">
              
              {/* Приоритет 1: Выбор альтернатив из категории */}
              {showAlternatives ? (
                <AlternativesSelect 
                  alternatives={data.alternatives!} 
                  selectedIndex={data.selectedAlternativeIndex || 0} 
                  onSelect={onAlternativeSelect!} 
                />
              ) : (
                /* Приоритет 2: Статический текст для адресов или точек без альтернатив */
                <div className="flex flex-col">
                  <h3 className="font-bold text-slate-800 leading-tight truncate">
                    {displayTitle}
                  </h3>
                  {displaySubtitle && (
                    <p className="text-xs text-slate-500 mt-1 truncate">
                      {displaySubtitle}
                    </p>
                  )}
                </div>
              )}

              {/* Метка времени для промежуточных остановок */}
              {variant === "waypoint" && (
                <div className="flex items-center gap-3 mt-2 text-slate-400 text-[10px] font-bold uppercase tracking-widest">
                  <span className="flex items-center gap-1 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                    <Coffee size={12} className="text-slate-300" /> {data.duration} мин
                  </span>
                </div>
              )}
            </div>
            
            {/* Кнопка редактирования — единственный способ открыть форму */}
            <button 
              type="button" 
              onClick={onEdit} 
              title={t("edit")}
              className="p-2 text-slate-300 hover:text-brand-500 hover:bg-brand-50 rounded-xl transition-all shrink-0 active:scale-95"
            >
              <Pencil size={18} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}