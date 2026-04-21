import { ReactNode, useState, useEffect } from "react";
import { cn } from "@/utils/cn";
import { ChevronUp, ChevronDown } from "lucide-react";
import { useRouteStore } from "@/store/useRouteStore";

interface RoutePanelProps {
  children: ReactNode;
  className?: string;
  header?: ReactNode;
  isNavigationOpen?: boolean;
}

export function RoutePanel({ children, className, header, isNavigationOpen = false }: RoutePanelProps) {
  // Стейт для мобилки: развернута шторка или свернута
  const [isExpanded, setIsExpanded] = useState(true);
  const { isMapPickerActive } = useRouteStore();

  // Автоматически сворачиваем сайдбар на мобилке при активации режима выбора
  useEffect(() => {
    if (isMapPickerActive && typeof window !== 'undefined' && window.innerWidth < 768) {
      setIsExpanded(false);
    }
  }, [isMapPickerActive]);

  return (
    <div
      className={cn(
        "bg-white z-40 flex flex-col overflow-hidden transition-all duration-300 ease-in-out",

        // --- МОБИЛЬНАЯ ВЕРСИЯ ---
        "fixed bottom-0 left-0 right-0 rounded-t-3xl border-t border-slate-200 shadow-[0_-10px_40px_rgba(0,0,0,0.1)]",
        // Динамическая высота: если свернуто, показываем только шапку (около 80px), если развернуто - до 85% экрана
        isExpanded ? "max-h-[85vh] h-[85vh]" : "max-h-[80px] h-[80px]",
        // Прячем сайдбар когда открыта навигация на мобилке
        isNavigationOpen && "hidden md:flex",

        // --- ДЕСКТОПНАЯ ВЕРСИЯ ---
        // На десктопе высота всегда автоматическая до низа, шторка не сворачивается
        // top-24 вместо top-6 чтобы не перекрывать навигацию (навигация ~60px + отступ)
        // pointer-events-none чтобы не блокировать карту, но pointer-events-auto на контенте
        "md:top-24 md:bottom-6 md:left-6 md:right-auto md:w-[420px] md:rounded-3xl md:h-auto md:max-h-none md:pointer-events-none",
        "md:border md:border-slate-200 md:shadow-float",

        className
      )}
    >
      {/* Кликабельная зона для мобилки (Ручка + Хедер) */}
      <div
        className="cursor-pointer md:cursor-default shrink-0 bg-white z-10 md:pointer-events-auto"
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
        "flex-1 overflow-y-auto overflow-x-hidden p-6 custom-scrollbar transition-opacity duration-300 md:pointer-events-auto",
        // Прячем контент, если свернуто (чтобы нельзя было скроллить невидимку)
        !isExpanded && "opacity-0 pointer-events-none md:opacity-100 md:pointer-events-auto"
      )}>
        {children}
      </div>
    </div>
  );
}