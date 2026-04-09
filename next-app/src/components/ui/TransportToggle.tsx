import { ReactNode } from "react";
import { cn } from "@/utils/cn";
import { RoutingMode } from "@/types/map";

export interface TransportOption {
  value: RoutingMode;
  icon: ReactNode;
  label: string;
}

interface TransportToggleProps {
  options: TransportOption[];
  activeValue: RoutingMode;
  onChange: (value: RoutingMode) => void;
  className?: string;
}

export function TransportToggle({ options, activeValue, onChange, className }: TransportToggleProps) {
  return (
    <div className={cn("flex w-full p-1 bg-slate-100 rounded-2xl", className)}>
      {options.map((option) => {
        const isActive = activeValue === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            title={option.label}
            className={cn(
              "relative flex-1 flex items-center justify-center h-10 rounded-xl text-sm font-medium transition-all duration-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
              isActive 
                ? "bg-white text-brand-600 shadow-sm" // Активная вкладка выглядит как "приподнятая" карточка
                : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
            )}
          >
            {option.icon}
          </button>
        );
      })}
    </div>
  );
}