"use client";

import { useState, useRef, useEffect, ReactNode } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/utils/cn";

export interface DropdownOption<T = string> {
  value: T;
  label: string;
  description?: string;
  icon?: ReactNode;
}

interface DropdownProps<T = string> {
  options: DropdownOption<T>[];
  value: T;
  onChange: (value: T) => void;
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
}

export function Dropdown<T extends string | number>({
  options,
  value,
  onChange,
  placeholder = "Выбрать...",
  className,
  triggerClassName,
}: DropdownProps<T>) {
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

  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center justify-between gap-2 w-full px-4 py-2 bg-white border-2 border-slate-200 rounded-xl",
          "text-sm font-medium text-slate-700 transition-all",
          "hover:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500",
          isOpen && "border-brand-500 ring-2 ring-brand-500",
          triggerClassName
        )}
      >
        <span className="flex items-center gap-2">
          {selectedOption?.icon}
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDown
          size={16}
          className={cn("text-slate-400 transition-transform", isOpen && "rotate-180")}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full mt-2 left-0 w-full min-w-[200px] p-2 bg-white rounded-2xl shadow-lg border border-slate-200 z-[100] flex flex-col gap-1 max-h-64 overflow-y-auto custom-scrollbar">
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={String(option.value)}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={cn(
                  "flex items-center justify-between w-full p-3 rounded-xl transition-all outline-none text-left",
                  isSelected
                    ? "bg-brand-50 border border-brand-200"
                    : "hover:bg-slate-50 border border-transparent"
                )}
              >
                <div className="flex flex-col items-start flex-1">
                  <span
                    className={cn(
                      "text-sm font-medium leading-tight flex items-center gap-2",
                      isSelected ? "text-brand-700" : "text-slate-700"
                    )}
                  >
                    {option.icon}
                    {option.label}
                  </span>
                  {option.description && (
                    <span className="text-xs text-slate-500 mt-1">{option.description}</span>
                  )}
                </div>
                {isSelected && <Check size={16} className="text-brand-500 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
