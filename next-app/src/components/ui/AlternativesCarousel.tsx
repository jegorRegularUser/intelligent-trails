"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { PlaceOfInterest } from "@/types/map";
import { cn } from "@/utils/cn";

interface AlternativesCarouselProps {
  alternatives: PlaceOfInterest[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  className?: string;
}

export function AlternativesCarousel({ 
  alternatives, 
  selectedIndex, 
  onSelect, 
  className 
}: AlternativesCarouselProps) {
  if (alternatives.length <= 1) return null;

  const currentPlace = alternatives[selectedIndex];

  return (
    <div className={cn("mt-3 flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between p-2 bg-slate-50 rounded-xl border border-slate-100">
        <button 
          onClick={() => onSelect(Math.max(0, selectedIndex - 1))}
          disabled={selectedIndex === 0}
          className="p-1 text-slate-400 hover:text-brand-600 disabled:opacity-30 transition-colors"
        >
          <ChevronLeft size={20} />
        </button>

        <div className="flex flex-col items-center">
          <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
            Вариант {selectedIndex + 1} из {alternatives.length}
          </span>
          <span className="text-xs font-medium text-slate-600 truncate max-w-[150px]">
            {currentPlace.name}
          </span>
        </div>

        <button 
          onClick={() => onSelect(Math.min(alternatives.length - 1, selectedIndex + 1))}
          disabled={selectedIndex === alternatives.length - 1}
          className="p-1 text-slate-400 hover:text-brand-600 disabled:opacity-30 transition-colors"
        >
          <ChevronRight size={20} />
        </button>
      </div>
      
      {/* Маленькие точки-индикаторы */}
      <div className="flex justify-center gap-1">
        {alternatives.map((_, i) => (
          <div 
            key={i} 
            className={cn(
              "w-1 h-1 rounded-full transition-all",
              i === selectedIndex ? "bg-brand-500 w-3" : "bg-slate-200"
            )} 
          />
        ))}
      </div>
    </div>
  );
}