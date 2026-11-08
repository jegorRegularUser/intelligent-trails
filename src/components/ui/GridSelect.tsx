"use client";

import { useState, useRef, useEffect, ReactNode } from "react";
import { cn } from "@/utils/cn";
import { ChevronDown } from "lucide-react";

export interface GridOption {
  id: string;
  title: string;
  icon: ReactNode;
}

interface GridSelectProps {
  options: GridOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  className?: string;
}

export function GridSelect({ options, value, onChange, placeholder = "Выбрать...", className }: GridSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Закрытие при клике снаружи
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find(opt => opt.id === value);

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <button 
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full h-12 px-4 rounded-2xl border-2 bg-white flex items-center justify-between transition-colors outline-none",
          isOpen ? "border-brand-500" : "border-slate-200 hover:border-brand-500"
        )}
      >
        <div className="flex items-center gap-3 text-slate-700 font-medium">
          {selectedOption ? (
            <>
              {selectedOption.icon}
              {selectedOption.title}
            </>
          ) : (
            <span className="text-slate-400">{placeholder}</span>
          )}
        </div>
        <ChevronDown size={20} className={cn("text-slate-400 transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className="absolute top-full mt-2 left-0 right-0 p-2 bg-white rounded-2xl shadow-float border border-slate-200 z-50 grid grid-cols-2 gap-2 max-h-60 overflow-y-auto custom-scrollbar">
          {options.map(opt => {
            const isSelected = value === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  onChange(opt.id);
                  setIsOpen(false);
                }}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-xl text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-500", 
                  isSelected ? "bg-brand-50 text-brand-700" : "hover:bg-slate-50 text-slate-700"
                )}
              >
                <span className={cn("shrink-0", isSelected ? "text-brand-600" : "text-slate-500")}>
                  {opt.icon}
                </span>
                <span className="truncate">{opt.title}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}