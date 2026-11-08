"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/utils/cn";
import {
  DEFAULT_CUSTOM_MINUTES,
  INITIAL_WALK_STATE,
  estimateBuildRange,
  normalizeCustomMinutes,
  walkMachine,
  type VibeId,
} from "./logic";
import { nextSwapCandidate, pickFixture } from "./fixtures";
import type { WalkPlan } from "./types";
import { QuickStartPanel } from "./QuickStartPanel";
import { OfflineBanner, WalkSummaryCard } from "./WalkSummaryCard";

const FAKE_BUILD_MS = 1400;
const FAKE_SWAP_MS = 900;

const toggleLabelClassName = "flex items-center gap-1.5 cursor-pointer";

/**
 * Демо-харнесс главного экрана «Прогуляться сейчас»: держит состояние фаз и
 * выбора локально, имитирует сборку/ошибки/замены таймерами. Движок и стор
 * не подключены — компоненты управляемые, наружу уходят только колбэки.
 */
export function WalkDemo({ className }: { className?: string }) {
  const t = useTranslations("WalkUI");
  const [machine, dispatch] = useReducer(walkMachine, INITIAL_WALK_STATE);
  const [selectedMinutes, setSelectedMinutes] = useState<number | null>(null);
  const [isCustomActive, setIsCustomActive] = useState(false);
  const [customMinutes, setCustomMinutes] = useState<number | null>(null);
  const [vibe, setVibe] = useState<VibeId | null>(null);
  const [plan, setPlan] = useState<WalkPlan | null>(null);
  const [swappingIds, setSwappingIds] = useState<string[]>([]);
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [simulateOffline, setSimulateOffline] = useState(false);
  const swapAttempts = useRef<Record<string, number>>({});
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  const touchParams = useCallback(() => dispatch({ type: "PARAMS_TOUCHED" }), []);

  const runFakeBuild = useCallback(() => {
    later(() => {
      // Обрыв сети во время сборки — это BUILD_FAILED (docs/ux-main-screen.md §2),
      // тумблер оффлайна в демо воспроизводит ровно этот путь
      if (simulateFailure || simulateOffline) {
        dispatch({ type: "BUILD_FAILED" });
      } else {
        setPlan(pickFixture(vibe, selectedMinutes));
        dispatch({ type: "BUILD_SUCCESS" });
      }
    }, FAKE_BUILD_MS);
  }, [later, simulateFailure, simulateOffline, vibe, selectedMinutes]);

  const handleStart = useCallback(() => {
    dispatch({ type: "START_BUILD" });
    runFakeBuild();
  }, [runFakeBuild]);

  const handleRetry = useCallback(() => {
    dispatch({ type: "RETRY" });
    runFakeBuild();
  }, [runFakeBuild]);

  const handleRebuild = useCallback(() => {
    dispatch({ type: "RESET" });
    // Демо-тумблер «нет сети» живёт своей жизнью — возвращаем экран в оффлайн
    if (simulateOffline) dispatch({ type: "OFFLINE" });
    setPlan(null);
    setSwappingIds([]);
    setSelectedMinutes(null);
    setIsCustomActive(false);
    setCustomMinutes(null);
    setVibe(null);
    swapAttempts.current = {};
  }, [simulateOffline]);

  // Демо-тумблер сети ↔ событие машины
  useEffect(() => {
    dispatch({ type: simulateOffline ? "OFFLINE" : "ONLINE" });
  }, [simulateOffline]);

  const handleSwapRequest = useCallback(
    (stopId: string) => {
      setSwappingIds((prev) => (prev.includes(stopId) ? prev : [...prev, stopId]));
      later(() => {
        setPlan((prev) => {
          if (!prev) return prev;
          const stop = prev.stops.find((s) => s.id === stopId);
          if (!stop) return prev;
          const attempt = swapAttempts.current[stopId] ?? 0;
          const candidate = {
            ...nextSwapCandidate(stop.kind, attempt),
            id: `${stopId}-alt-${attempt + 1}`,
          };
          swapAttempts.current[stopId] = attempt + 1;
          return {
            ...prev,
            stops: prev.stops.map((s) => (s.id === stopId ? candidate : s)),
          };
        });
        setSwappingIds((prev) => prev.filter((id) => id !== stopId));
      }, FAKE_SWAP_MS);
    },
    [later]
  );

  const phase = machine.phase;
  // Под баннером оффлайна показываем замороженный контент той фазы, где был человек
  const cardPhase = phase === "offline" ? (machine.resumePhase ?? "idle") : phase;
  const showQuickStart = cardPhase === "idle" || cardPhase === "params";
  const forecast = useMemo(
    () => (selectedMinutes ? estimateBuildRange(selectedMinutes) : null),
    [selectedMinutes]
  );

  return (
    <div className={cn("flex w-full flex-col gap-4", className)}>
      {/* Демо-панель: не часть продукта, только для dev-страницы */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-dashed border-slate-300 bg-white/80 p-3 text-xs text-slate-500">
        <span className="font-bold text-slate-600">{t("demoTitle")}</span>
        <label className={toggleLabelClassName}>
          <input
            type="checkbox"
            checked={simulateFailure}
            onChange={(e) => setSimulateFailure(e.target.checked)}
          />
          {t("demoFailToggle")}
        </label>
        <label className={toggleLabelClassName}>
          <input
            type="checkbox"
            checked={simulateOffline}
            onChange={(e) => setSimulateOffline(e.target.checked)}
          />
          {t("demoOfflineToggle")}
        </label>
        <button
          type="button"
          onClick={handleRebuild}
          className="ml-auto rounded-full border border-slate-300 px-3 py-1 font-semibold text-slate-600 transition-colors hover:border-brand-500 hover:text-brand-600"
        >
          {t("demoReset")}
        </button>
        <p className="w-full leading-relaxed">{t("demoHint")}</p>
      </div>

      {/* Макет шторки: на мобилке прижата к низу, на десктопе — слева (как RoutePanel) */}
      <section className="flex flex-col gap-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-float">
        {phase === "offline" && <OfflineBanner />}

        {showQuickStart ? (
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
              const next = normalizeCustomMinutes(customMinutes ?? DEFAULT_CUSTOM_MINUTES);
              setCustomMinutes(next);
              setSelectedMinutes(next);
            }}
            onCustomChange={(minutes) => {
              touchParams();
              setIsCustomActive(true);
              const next = normalizeCustomMinutes(minutes);
              setCustomMinutes(next);
              setSelectedMinutes(next);
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
          />
        ) : (
          <WalkSummaryCard
            phase={cardPhase === "ready" ? "ready" : cardPhase === "building" ? "building" : "error"}
            plan={plan}
            // Оффлайн замораживает карточку: кнопки видны, но инертны
            interactionsDisabled={phase === "offline"}
            swappingStopIds={swappingIds}
            onSwapRequest={handleSwapRequest}
            onRetry={handleRetry}
            onEditParams={() => dispatch({ type: "PARAMS_TOUCHED" })}
            onStartWalk={() => console.info("WalkDemo: «Идти» — вне скоупа демо")}
            onRebuild={handleRebuild}
          />
        )}
      </section>
    </div>
  );
}
