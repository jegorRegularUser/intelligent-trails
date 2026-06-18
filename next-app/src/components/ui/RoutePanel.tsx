import { ReactNode, useState, useEffect, useCallback, MouseEvent } from "react";
import { cn } from "@/utils/cn";
import { ChevronUp, ChevronDown } from "lucide-react";
import { useRouteStore } from "@/store/useRouteStore";

interface RoutePanelProps {
  children: ReactNode;
  className?: string;
  header?: ReactNode;
  isNavigationOpen?: boolean;
}

const MOBILE_BREAKPOINT = 768;

export function RoutePanel({ children, className, header, isNavigationOpen = false }: RoutePanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const { isMapPickerActive } = useRouteStore();

  const isExpandedOnMobile = isMobile && isExpanded;

  useEffect(() => {
    const syncViewport = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  useEffect(() => {
    if (isMapPickerActive && isMobile) {
      setIsExpanded(false);
    }
  }, [isMapPickerActive, isMobile]);

  const handleToggle = useCallback((event: MouseEvent<HTMLElement>) => {
    if (!isMobile) return;

    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, textarea, select, [role='button']")) {
      return;
    }

    setIsExpanded((prev) => !prev);
  }, [isMobile]);

  return (
    <div
      className={cn(
        "bg-white z-40 flex flex-col overflow-hidden transition-[height,max-height] duration-300 ease-in-out",

        // --- МОБИЛЬНАЯ ВЕРСИЯ ---
        "fixed bottom-0 left-0 right-0 rounded-t-3xl border-t border-slate-200 shadow-[0_-10px_40px_rgba(0,0,0,0.12)]",
        isExpandedOnMobile ? "h-[85dvh] max-h-[85dvh]" : "h-auto max-h-none",
        isNavigationOpen && "hidden md:flex",

        // --- ДЕСКТОПНАЯ ВЕРСИЯ ---
        "md:top-24 md:bottom-6 md:left-6 md:right-auto md:w-[420px] md:rounded-3xl md:h-auto md:max-h-none md:pointer-events-none",
        "md:border md:border-slate-200 md:shadow-float",

        // iPhone safe area — непрозрачный фон закрывает карту внизу
        "pb-[env(safe-area-inset-bottom,0px)]",

        className
      )}
    >
      {/* Ручка + хедер: тап для быстрого разворота/сворачивания */}
      <div
        className="cursor-pointer md:cursor-default shrink-0 bg-white z-10 md:pointer-events-auto"
        onClick={handleToggle}
      >
        <div className="flex items-center justify-center pt-3 pb-1 md:hidden" aria-hidden>
          <div className="w-12 h-1.5 bg-slate-200 rounded-full flex items-center justify-center">
            {isExpandedOnMobile ? (
              <ChevronDown size={12} className="text-slate-400" />
            ) : (
              <ChevronUp size={12} className="text-slate-400" />
            )}
          </div>
        </div>

        {header && (
          <div className="px-6 pb-4 pt-2 md:pt-6 border-b border-slate-100 flex justify-between items-center">
            {header}
          </div>
        )}
      </div>

      {/* Контент: на мобилке рендерим только в развёрнутом состоянии */}
      {(!isMobile || isExpanded) && (
        <div
          className={cn(
            "flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-6 custom-scrollbar mobile-panel-scroll overscroll-contain touch-pan-y md:pointer-events-auto"
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}