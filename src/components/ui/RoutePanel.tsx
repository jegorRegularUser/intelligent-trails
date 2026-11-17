import { ReactNode, useState, useEffect, useCallback, useRef, MouseEvent, PointerEvent } from "react";
import { cn } from "@/utils/cn";
import { ChevronUp, ChevronDown } from "lucide-react";
import { useRouteStore } from "@/store/useRouteStore";
import { useMapStatusStore } from "@/store/useMapStatusStore";
import { sheetHeightForPhase, swipeStepHeight, type SheetHeight, type WalkPhase } from "@/components/walk/logic";

interface RoutePanelProps {
  children: ReactNode;
  className?: string;
  header?: ReactNode;
  isNavigationOpen?: boolean;
  /**
   * Фаза экрана прогулки — владелец маппинга QuickWalkContent/QuickWalkPanel
   * (docs/ux-human-wave.md M3): idle/params → 45dvh, ready → 85dvh,
   * building/error → 60dvh. Без пропа ('expert') — прежнее бинарное поведение:
   * свёрнутая панель заголовка / развёрнутые 85dvh.
   */
  phase?: WalkPhase | "expert";
}

const MOBILE_BREAKPOINT = 768;

/** Цели тапа, которые ручка не перехватывает (M3: драг по свитчеру не съедает тапы). */
const INTERACTIVE_TARGET = "button, a, input, textarea, select, [role='button']";

export function RoutePanel({ children, className, header, isNavigationOpen = false, phase }: RoutePanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const { isMapPickerActive } = useRouteStore();
  // WebGL недоступен (M7): карта скрыта — панель на весь экран (таймлайн-первый).
  const webglDown = useMapStatusStore((s) => s.status === "webgl");

  const isExpandedOnMobile = isMobile && isExpanded;

  // Режим фаз (M3): высота шторки задаётся машиной экрана; свайп/тап ручки
  // ведут на соседнюю высоту. Ручной оверрайд привязан к ФАЗЕ, при которой он
  // сделан: смена фазы сама «выдыхает» оверрайд — без сброса в эффекте
  // (компилятор React запрещает и ref-в-рендере, и setState-в-эффекте).
  const hasPhases = phase !== undefined && phase !== "expert";
  const [manual, setManual] = useState<{ phase: WalkPhase | "expert"; height: SheetHeight } | null>(null);
  const baseHeight = hasPhases ? sheetHeightForPhase(phase as WalkPhase) : 45;
  const manualHeight =
    manual && manual.phase === phase && manual.height !== baseHeight ? manual.height : null;
  const phaseHeight = hasPhases ? (manualHeight ?? baseHeight) : null;

  useEffect(() => {
    const syncViewport = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  // Сворачиваем панель при активации выбора точки на карте (мобильные) —
  // подгон состояния во время рендера вместо эффекта
  const [prevPickerActive, setPrevPickerActive] = useState(isMapPickerActive);
  if (isMapPickerActive !== prevPickerActive) {
    setPrevPickerActive(isMapPickerActive);
    if (isMapPickerActive && isMobile) {
      setIsExpanded(false);
    }
  }

  // Свайп ручки: pointer events, порог 24px, setPointerCapture (M3).
  const dragRef = useRef<{ startY: number; pointerId: number } | null>(null);
  const swipedRef = useRef(false);

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (!isMobile) return;
      if ((event.target as HTMLElement).closest(INTERACTIVE_TARGET)) return;
      dragRef.current = { startY: event.clientY, pointerId: event.pointerId };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [isMobile],
  );

  const handlePointerUp = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      dragRef.current = null;
      const deltaY = event.clientY - drag.startY;
      const next = swipeStepHeight(deltaY, (phaseHeight ?? baseHeight) as SheetHeight);
      if (next != null) {
        swipedRef.current = true;
        setManual({ phase: phase ?? "expert", height: next });
      }
    },
    [baseHeight, phase, phaseHeight],
  );

  const handleToggle = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if (!isMobile) return;
      // Свайп уже применил высоту на pointerup — тап поверх не дублирует шаг.
      if (swipedRef.current) {
        swipedRef.current = false;
        return;
      }
      const target = event.target as HTMLElement;
      if (target.closest(INTERACTIVE_TARGET)) {
        return;
      }
      if (phaseHeight != null) {
        // Фазовый режим: тап по ручке раскрывает до 85, а из ready (уже 85) —
        // сворачивает к 45 (peek на карту — таймлайн остаётся в DOM).
        setManual({
          phase: phase ?? "expert",
          height: phaseHeight < 85 ? 85 : phase === "ready" ? 45 : baseHeight,
        });
        return;
      }
      setIsExpanded((prev) => !prev);
    },
    [baseHeight, isMobile, phase, phaseHeight],
  );

  const heightStyle = isMobile && phaseHeight != null ? { height: `${webglDown ? 100 : phaseHeight}dvh` } : undefined;

  return (
    <div
      className={cn(
        "bg-white z-40 flex flex-col overflow-hidden transition-[height] duration-300 ease-in-out",

        // --- МОБИЛЬНАЯ ВЕРСИЯ ---
        "fixed bottom-0 left-0 right-0 rounded-t-3xl border-t border-slate-200 shadow-[0_-10px_40px_rgba(0,0,0,0.12)]",
        // Фазовый режим живёт инлайн-высотой (45/60/85dvh, M3); без фазы —
        // прежнее бинарное поведение: свёрнутая панель / 85dvh.
        phaseHeight == null &&
          (isExpandedOnMobile ? "h-[85dvh] max-h-[85dvh]" : "h-auto max-h-none"),
        webglDown && phaseHeight == null && isExpandedOnMobile && "h-[100dvh]",
        isNavigationOpen && "hidden md:flex",

        // --- ДЕСКТОПНАЯ ВЕРСИЯ ---
        "md:top-24 md:bottom-6 md:left-6 md:right-auto md:w-[420px] md:rounded-3xl md:h-auto md:max-h-none md:pointer-events-none",
        webglDown && "md:right-6 md:w-auto",
        "md:border md:border-slate-200 md:shadow-float",

        // iPhone safe area — непрозрачный фон закрывает карту внизу
        "pb-[env(safe-area-inset-bottom,0px)]",

        className
      )}
      style={heightStyle}
    >
      {/* Ручка + хедер: тап для разворота/сворачивания, свайп — по высотам M3 */}
      <div
        className="cursor-pointer md:cursor-default shrink-0 bg-white z-10 md:pointer-events-auto touch-none"
        onClick={handleToggle}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
      >
        <div className="flex items-center justify-center pt-3 pb-1 md:hidden" aria-hidden>
          <div className="w-12 h-1.5 bg-slate-200 rounded-full flex items-center justify-center">
            {(phaseHeight ?? (isExpandedOnMobile ? 85 : 45)) >= 60 ? (
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

      {/* Контент монтирован всегда (M3): высота и overflow решают видимость —
          скролл и состояние полей переживают сворачивание. В легаси-режиме
          свёрнутая панель скрывает контент CSS-ом вместо unmount. */}
      <div
        className={cn(
          "flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-6 custom-scrollbar mobile-panel-scroll overscroll-contain touch-pan-y md:pointer-events-auto",
          !phaseHeight && isMobile && !isExpandedOnMobile && "hidden"
        )}
      >
        {children}
      </div>
    </div>
  );
}
