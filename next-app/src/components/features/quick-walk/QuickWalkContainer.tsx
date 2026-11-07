"use client";

// Живой главный сценарий «Прогуляться сейчас» (docs/PRODUCT.md, вход №1).
// Композиция та же, что в демо (components/walk/WalkDemo), но сборка настоящая:
// геолокация браузера → server action buildQuickWalk (провайдер → погода → вайб
// → движок) → карточка прогулки. «Заменить» = пересборка без выменянных остановок.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Crosshair, Footprints, X } from "lucide-react";
import {
  DEFAULT_CUSTOM_MINUTES,
  INITIAL_WALK_STATE,
  estimateBuildRange,
  normalizeCustomMinutes,
  walkMachine,
  type VibeId,
} from "@/components/walk/logic";
import { QuickStartPanel } from "@/components/walk/QuickStartPanel";
import { OfflineBanner, WalkSummaryCard } from "@/components/walk/WalkSummaryCard";
import type { WalkPlan } from "@/components/walk/types";
import { buildQuickWalk, type QuickVibe } from "@/actions/quickWalk";

interface GeolocationPositionLike {
  coords: { latitude: number; longitude: number };
}

function getCurrentStart(): Promise<[number, number]> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("geolocation-unavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos: GeolocationPositionLike) => resolve([pos.coords.latitude, pos.coords.longitude]),
      () => reject(new Error("geolocation-denied")),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  });
}

export function QuickWalkContainer() {
  const t = useTranslations("WalkUI");
  const [machine, dispatch] = useReducer(walkMachine, INITIAL_WALK_STATE);
  const [open, setOpen] = useState(false);
  const [selectedMinutes, setSelectedMinutes] = useState<number | null>(null);
  const [isCustomActive, setIsCustomActive] = useState(false);
  const [customMinutes, setCustomMinutes] = useState<number | null>(null);
  const [vibe, setVibe] = useState<VibeId | null>(null);
  const [plan, setPlan] = useState<WalkPlan | null>(null);
  const [swappingIds, setSwappingIds] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fastMode, setFastMode] = useState(false);
  const [lastInput, setLastInput] = useState<{ minutes: number; vibe: QuickVibe } | null>(null);

  // Выменянные остановки живут в рамках одной прогулки: каждая «Заменить»
  // добавляет id в чёрный список пересборки; новый сетап параметров его чистит.
  const excludedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const goOffline = () => dispatch({ type: "OFFLINE" });
    const goOnline = () => dispatch({ type: "ONLINE" });
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  const touchParams = useCallback(() => dispatch({ type: "PARAMS_TOUCHED" }), []);

  const runBuild = useCallback(
    async (minutes: number, vibeId: QuickVibe) => {
      dispatch({ type: "START_BUILD" });
      setErrorMessage(null);
      try {
        const start = await getCurrentStart();
        const result = await buildQuickWalk({
          start,
          budgetMinutes: minutes,
          vibe: vibeId,
          excludeStopIds: [...excludedRef.current],
        });
        if (result.ok) {
          setPlan(result.plan);
          setFastMode(result.fastMode);
          dispatch({ type: "BUILD_SUCCESS" });
        } else {
          setErrorMessage(result.error);
          dispatch({ type: "BUILD_FAILED" });
        }
      } catch (error) {
        setErrorMessage(
          error instanceof Error && error.message === "geolocation-denied"
            ? "Не получилось определить ваше местоположение — разрешите доступ к геолокации"
            : t("errorGeneric"),
        );
        dispatch({ type: "BUILD_FAILED" });
      }
    },
    [t],
  );

  const handleStart = useCallback(() => {
    if (selectedMinutes == null || vibe == null) return;
    const minutes = isCustomActive
      ? normalizeCustomMinutes(customMinutes ?? DEFAULT_CUSTOM_MINUTES)
      : selectedMinutes;
    excludedRef.current = new Set();
    setLastInput({ minutes, vibe });
    void runBuild(minutes, vibe);
  }, [customMinutes, isCustomActive, runBuild, selectedMinutes, vibe]);

  const handleRetry = useCallback(() => {
    if (!lastInput) return;
    dispatch({ type: "RETRY" });
    void runBuild(lastInput.minutes, lastInput.vibe);
  }, [lastInput, runBuild]);

  const handleRebuild = useCallback(() => {
    dispatch({ type: "RESET" });
    setPlan(null);
    setSwappingIds([]);
    setErrorMessage(null);
    setLastInput(null);
    excludedRef.current = new Set();
    setSelectedMinutes(null);
    setIsCustomActive(false);
    setCustomMinutes(null);
    setVibe(null);
  }, []);

  const handleSwapRequest = useCallback(
    (stopId: string) => {
      if (!lastInput) return;
      setSwappingIds((prev) => (prev.includes(stopId) ? prev : [...prev, stopId]));
      excludedRef.current.add(stopId);
      void (async () => {
        try {
          const start = await getCurrentStart();
          const result = await buildQuickWalk({
            start,
            budgetMinutes: lastInput.minutes,
            vibe: lastInput.vibe,
            excludeStopIds: [...excludedRef.current],
          });
          if (result.ok) {
            setPlan(result.plan);
            dispatch({ type: "BUILD_SUCCESS" });
          } else {
            // Заменить не получилось — оставляем старый план и честно сообщаем
            excludedRef.current.delete(stopId);
            setErrorMessage(result.error);
            dispatch({ type: "BUILD_FAILED" });
          }
        } catch {
          excludedRef.current.delete(stopId);
          dispatch({ type: "BUILD_FAILED" });
        } finally {
          setSwappingIds((prev) => prev.filter((id) => id !== stopId));
        }
      })();
    },
    [lastInput],
  );

  const phase = machine.phase;
  const cardPhase = phase === "offline" ? (machine.resumePhase ?? "idle") : phase;
  const showPanel = open && (cardPhase === "idle" || cardPhase === "params");
  const showCard = cardPhase === "ready" || cardPhase === "error" || cardPhase === "building";
  const forecast = useMemo(
    () => (selectedMinutes != null ? estimateBuildRange(selectedMinutes) : null),
    [selectedMinutes],
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          touchParams();
        }}
        className="fixed bottom-4 left-4 z-30 flex items-center gap-2 rounded-full bg-brand-500 px-5 py-3.5 font-semibold text-white shadow-float transition-all hover:bg-brand-600 active:scale-95"
      >
        <Footprints size={20} />
        {t("screenTitle")}
      </button>
    );
  }

  return (
    <section
      className="fixed bottom-0 left-0 right-0 z-30 max-h-[85dvh] overflow-y-auto rounded-t-3xl border border-slate-200 bg-white p-5 shadow-float md:bottom-4 md:left-4 md:right-auto md:max-w-[440px] md:rounded-3xl md:p-6"
      aria-label={t("screenTitle")}
    >
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-label={t("editParamsCta")}
        className="absolute right-3 top-3 rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
      >
        <X size={18} />
      </button>

      {phase === "offline" && <OfflineBanner />}

      {showPanel ? (
        <QuickStartPanel
          selectedMinutes={selectedMinutes}
          isCustomActive={isCustomActive}
          customMinutes={customMinutes}
          onSelectPreset={(minutes) => {
            touchParams();
            setIsCustomActive(false);
            setSelectedMinutes(minutes);
          }}
          onCustomActivate={() => {
            touchParams();
            setIsCustomActive(true);
            setCustomMinutes((prev) => prev ?? DEFAULT_CUSTOM_MINUTES);
          }}
          onCustomChange={(minutes) => {
            touchParams();
            setCustomMinutes(normalizeCustomMinutes(minutes));
          }}
          selectedVibe={vibe}
          onSelectVibe={(next) => {
            touchParams();
            setVibe(next);
          }}
          onStart={handleStart}
          isBuilding={phase === "building"}
          disabled={phase === "offline"}
          forecast={forecast}
          className="pt-8"
        />
      ) : null}

      {showCard ? (
        <WalkSummaryCard
          phase={cardPhase === "ready" || cardPhase === "error" ? cardPhase : "building"}
          plan={plan}
          errorMessage={errorMessage}
          swappingStopIds={swappingIds}
          interactionsDisabled={phase === "offline"}
          onSwapRequest={handleSwapRequest}
          onRetry={handleRetry}
          onEditParams={() => {
            dispatch({ type: "PARAMS_TOUCHED" });
          }}
          onRebuild={handleRebuild}
          onStartWalk={() => {
            /* навигация к маршруту — следующий шаг интеграции карты */
          }}
          className="pt-8"
        />
      ) : null}

      {/* Геолокация подсказывает, что старт берётся отсюда; fast mode — бейдж тира провайдера */}
      {phase === "building" && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
          <Crosshair size={12} />
          {t("buildingHint")}
        </p>
      )}
      {fastMode && phase === "ready" && (
        <p className="mt-2 text-xs font-semibold text-brand-600">fast mode</p>
      )}
    </section>
  );
}
