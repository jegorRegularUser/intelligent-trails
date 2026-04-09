"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, MapPin } from "lucide-react";
import { PlaceOfInterest } from "@/types/map";
import { cn } from "@/utils/cn";

interface AlternativesSelectProps {
  alternatives: PlaceOfInterest[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

export function AlternativesSelect({ alternatives, selectedIndex, onSelect }: AlternativesSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!alternatives || alternatives.length <= 1) return null;

  const currentPlace = alternatives[selectedIndex] || alternatives[0];

  return (
    <div ref={wrapperRef} className="relative w-full">
      {/* КЛИКАБЕЛЬНЫЙ ЗАГОЛОВОК */}
      <button 
        type="button"
        onClick={(e) => {
          e.stopPropagation(); // Чтобы не срабатывало редактирование всей точки
          setIsOpen(!isOpen);
        }}
        className="flex flex-col items-start w-full text-left group/select outline-none"
      >
        <div className="flex items-center gap-1.5 w-full">
          <h3 className="font-bold text-slate-800 leading-tight truncate group-hover/select:text-brand-600 transition-colors">
            {currentPlace.name}
          </h3>
          <div className="bg-brand-50 text-brand-600 rounded-md p-0.5 shrink-0">
            <ChevronDown size={14} className={cn("transition-transform", isOpen && "rotate-180")} />
          </div>
        </div>
        
        {currentPlace.address && (
          <p className="text-xs text-slate-500 mt-0.5 truncate w-full">
            {currentPlace.address}
          </p>
        )}
        
        <p className="text-[10px] font-bold text-brand-500/80 uppercase tracking-wider mt-1">
          Вариант {selectedIndex + 1} из {alternatives.length}
        </p>
      </button>

      {/* ВЫПАДАЮЩИЙ СПИСОК */}
      {isOpen && (
        <div className="absolute top-full mt-2 left-0 w-[280px] p-2 bg-white rounded-2xl shadow-float border border-slate-200 z-[100] flex flex-col gap-1 max-h-64 overflow-y-auto custom-scrollbar">
          {alternatives.map((place, index) => {
            const isSelected = index === selectedIndex;
            return (
              <button
                key={place.id || index}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(index);
                  setIsOpen(false);
                }}
                className={cn(
                  "flex flex-col items-start w-full p-3 rounded-xl transition-all outline-none text-left",
                  isSelected ? "bg-brand-50 border border-brand-200" : "hover:bg-slate-50 border border-transparent"
                )}
              >
                <div className="flex items-start justify-between w-full gap-2">
                  <span className={cn("text-sm font-bold leading-tight", isSelected ? "text-brand-700" : "text-slate-700")}>
                    {place.name}
                  </span>
                  {isSelected && <MapPin size={14} className="text-brand-500 shrink-0 mt-0.5" />}
                </div>
                {place.address && (
                  <span className="text-xs text-slate-500 mt-1 line-clamp-2 w-full">
                    {place.address}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}