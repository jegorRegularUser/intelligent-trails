import { ReactNode, useState } from "react";
import { cn } from "@/utils/cn";
import { ChevronUp, ChevronDown } from "lucide-react";

interface RoutePanelProps {
  children: ReactNode;
  className?: string;
  header?: ReactNode;
}

export function RoutePanel({ children, className, header }: RoutePanelProps) {
  // Стейт для мобилки: развернута шторка или свернута
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div
      className={cn(
        "bg-white z-40 flex flex-col overflow-hidden transition-all duration-300 ease-in-out",
        
        // --- МОБИЛЬНАЯ ВЕРСИЯ ---
        "fixed bottom-0 left-0 right-0 rounded-t-3xl border-t border-slate-200 shadow-[0_-10px_40px_rgba(0,0,0,0.1)]",
        // Динамическая высота: если свернуто, показываем только шапку (около 80px), если развернуто - до 85% экрана
        isExpanded ? "max-h-[85vh] h-[85vh]" : "max-h-[80px] h-[80px]",
        
        // --- ДЕСКТОПНАЯ ВЕРСИЯ ---
        // На десктопе высота всегда автоматическая до низа, шторка не сворачивается
        "md:top-6 md:bottom-6 md:left-6 md:right-auto md:w-[420px] md:rounded-3xl md:h-auto md:max-h-none",
        "md:border md:border-slate-200 md:shadow-float",
        
        className
      )}
    >
      {/* Кликабельная зона для мобилки (Ручка + Хедер) */}
      <div 
        className="cursor-pointer md:cursor-default shrink-0 bg-white z-10"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Ручка (Drag Handle) - видна только на мобилке */}
        <div className="flex items-center justify-center pt-3 pb-1 md:hidden">
          <div className="w-12 h-1.5 bg-slate-200 rounded-full flex items-center justify-center">
            {/* Маленькая иконка, показывающая направление */}
            {isExpanded ? <ChevronDown size={12} className="text-slate-400" /> : <ChevronUp size={12} className="text-slate-400" />}
          </div>
        </div>

        {/* Хедер */}
        {header && (
          <div className="px-6 pb-4 pt-2 md:pt-6 border-b border-slate-100 flex justify-between items-center">
            {header}
          </div>
        )}
      </div>

      {/* Основной контент */}
      <div className={cn(
        "flex-1 overflow-y-auto overflow-x-hidden p-6 custom-scrollbar transition-opacity duration-300",
        // Прячем контент, если свернуто (чтобы нельзя было скроллить невидимку)
        !isExpanded && "opacity-0 pointer-events-none md:opacity-100 md:pointer-events-auto"
      )}>
        {children}
      </div>
    </div>
  );
}