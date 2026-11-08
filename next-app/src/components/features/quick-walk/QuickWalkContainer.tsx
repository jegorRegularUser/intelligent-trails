"use client";

// Живой главный сценарий «Прогуляться сейчас» (docs/PRODUCT.md, вход №1).
// Композиция та же, что в демо (components/walk/WalkDemo), но сборка настоящая:
// геолокация/адрес → server action buildQuickWalk (провайдер → погода → вайб →
// движок) → карточка прогулки + петля на карте.
// «Заменить» = пересборка без выменянных остановок; «Пересобрать» = цикл по
// альтернативам движка без похода в сеть, если планов несколько.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CloudRain, Crosshair, Footprints, MapPin, Save, ThermometerSun, X } from "lucide-react";
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
import { AddressInput } from "@/components/ui/AddressInput";
import { LoginRequiredModal } from "@/components/features/LoginRequiredModal";
import { useToast } from "@/contexts/ToastContext";
import { useQuickWalkMapStore } from "@/store/useQuickWalkMapStore";
import type { WalkPlan } from "@/components/walk/types";
import { buildQuickWalk, type QuickVibe, type WalkContextInfo } from "@/actions/quickWalk";
import { saveQuickWalkToHistory } from "@/actions/quickWalkSave";
import { planPolyline } from "@/lib/walk/uiAdapter";
import { quickWalkToYandexMapsUrl } from "@/lib/walk/shareCodec";

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

function browserTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

export function QuickWalkContainer() {
  const t = useTranslations("WalkUI");
  const locale = useLocale();
  const { showToast } = useToast();
  const mapStore = useQuickWalkMapStore();
  const [machine, dispatch] = useReducer(walkMachine, INITIAL_WALK_STATE);
  const [open, setOpen] = useState(false);
  const [selectedMinutes, setSelectedMinutes] = useState<number | null>(null);
  const [isCustomActive, setIsCustomActive] = useState(false);
  const [customMinutes, setCustomMinutes] = useState<number | null>(null);
  const [vibe, setVibe] = useState<VibeId | null>(null);
  /** Все варианты плана от движка + индекс показанного («Пересобрать» циклит без сети). */
  const [plans, setPlans] = useState<WalkPlan[] | null>(null);
  const [planIndex, setPlanIndex] = useState(0);
  const [context, setContext] = useState<WalkContextInfo | null>(null);
  const [swappingIds, setSwappingIds] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fastMode, setFastMode] = useState(false);
  const [lastInput, setLastInput] = useState<{ minutes: number; vibe: QuickVibe; start: [number, number] } | null>(null);

  /** Старт: геолокация или адрес (фолбэк, когда геолокацию не дали). */
  const [addressStart, setAddressStart] = useState<[number, number] | null>(null);
  const [needsAddress, setNeedsAddress] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);

  // Выменянные остановки живут в рамках одной прогулки: каждая «Заменить»
  // добавляет id в чёрный список пересборки; новый сетап параметров его чистит.
  const excludedRef = useRef<Set<string>>(new Set());

  const plan = plans && planIndex < plans.length ? plans[planIndex] : null;
  const alternativesCount = plans?.length ?? 0;

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
    async (minutes: number, vibeId: QuickVibe, opts?: { manualStart?: [number, number] }) => {
      dispatch({ type: "START_BUILD" });
      setErrorMessage(null);
      try {
        const start = opts?.manualStart ?? (await getCurrentStart());
        const result = await buildQuickWalk({
          start,
          budgetMinutes: minutes,
          vibe: vibeId,
          excludeStopIds: [...excludedRef.current],
          timezone: browserTimezone(),
          locale: locale === "en" ? "en" : "ru",
        });
        if (result.ok) {
          setPlans(result.plans);
          setPlanIndex(0);
          setContext(result.context);
          setFastMode(result.fastMode);
          setLastInput({ minutes, vibe: vibeId, start });
          mapStore.setWalk(planPolyline(result.plans[0], start), "Старт прогулки");
          dispatch({ type: "BUILD_SUCCESS" });
        } else {
          setErrorMessage(result.error);
          dispatch({ type: "BUILD_FAILED" });
        }
      } catch (error) {
        const denied =
          error instanceof Error &&
          (error.message === "geolocation-denied" || error.message === "geolocation-unavailable");
        if (denied) {
          // Честный фолбэк: пусть человек скажет, откуда пойдёт.
          // Машину выводим из building через BUILD_FAILED (PARAMS_TOUCHED из
          // building — но-оп, экран залип бы в спиннере); блок ввода адреса
          // рендерим в фазе error рядом с кнопкой Retry.
          setNeedsAddress(true);
          dispatch({ type: "BUILD_FAILED" });
          return;
        }
        setErrorMessage(t("errorGeneric"));
        dispatch({ type: "BUILD_FAILED" });
      }
    },
    [locale, mapStore, t],
  );

  const handleStart = useCallback(() => {
    if (selectedMinutes == null || vibe == null) return;
    const minutes = isCustomActive
      ? normalizeCustomMinutes(customMinutes ?? DEFAULT_CUSTOM_MINUTES)
      : selectedMinutes;
    excludedRef.current = new Set();
    // lastInput (включая фактический старт) запишет runBuild при успехе
    void runBuild(minutes, vibe, addressStart ? { manualStart: addressStart } : undefined);
  }, [addressStart, customMinutes, isCustomActive, runBuild, selectedMinutes, vibe]);

  const handleRetry = useCallback(() => {
    if (!lastInput) return;
    dispatch({ type: "RETRY" });
    void runBuild(lastInput.minutes, lastInput.vibe, addressStart ? { manualStart: addressStart } : undefined);
  }, [addressStart, lastInput, runBuild]);

  const handleRebuild = useCallback(() => {
    // «Пересобрать»: если у движка есть другие варианты — циклим локально и мгновенно;
    // иначе начинаем новый сетап
    if (plans && plans.length > 1) {
      const next = (planIndex + 1) % plans.length;
      setPlanIndex(next);
      if (lastInput) {
        mapStore.setWalk(planPolyline(plans[next], lastInput.start), "Старт прогулки");
      }
      return;
    }
    dispatch({ type: "RESET" });
    setPlans(null);
    setPlanIndex(0);
    setContext(null);
    setSwappingIds([]);
    setErrorMessage(null);
    setLastInput(null);
    mapStore.clear();
    excludedRef.current = new Set();
    setSelectedMinutes(null);
    setIsCustomActive(false);
    setCustomMinutes(null);
    setVibe(null);
  }, [lastInput, mapStore, planIndex, plans]);

  const handleSwapRequest = useCallback(
    (stopId: string) => {
      if (!lastInput) return;
      setSwappingIds((prev) => (prev.includes(stopId) ? prev : [...prev, stopId]));
      excludedRef.current.add(stopId);
      void (async () => {
        try {
          const start = addressStart ?? (await getCurrentStart());
          const result = await buildQuickWalk({
            start,
            budgetMinutes: lastInput.minutes,
            vibe: lastInput.vibe,
            excludeStopIds: [...excludedRef.current],
            timezone: browserTimezone(),
            locale: locale === "en" ? "en" : "ru",
          });
          if (result.ok) {
            setPlans(result.plans);
            setPlanIndex(0);
            setContext(result.context);
            mapStore.setWalk(planPolyline(result.plans[0], start), "Старт прогулки");
            dispatch({ type: "BUILD_SUCCESS" });
          } else {
            // Заменить не получилось — оставляем старый план и честно сообщаем.
            // BUILD_FAILED из фазы ready — но-оп машины, поэтому тост.
            excludedRef.current.delete(stopId);
            dispatch({ type: "BUILD_SUCCESS" });
            showToast(result.error, "error");
          }
        } catch {
          excludedRef.current.delete(stopId);
          dispatch({ type: "BUILD_SUCCESS" });
          showToast(t("errorGeneric"), "error");
        } finally {
          setSwappingIds((prev) => prev.filter((id) => id !== stopId));
        }
      })();
    },
    [addressStart, lastInput, locale, mapStore],
  );

  const handleSave = useCallback(async () => {
    if (!plan) return;
    const saveStart = lastInput?.start ?? mapStore.geometry[0] ?? plan.stops[0]?.coordinates;
    if (!saveStart) return;
    setIsSaving(true);
    try {
      const result = await saveQuickWalkToHistory({
        plan,
        name: t("walkName", { minutes: plan.budgetMin }),
        vibe: lastInput?.vibe ?? "green",
        start: saveStart,
      });
      if (result === "unauthorized") {
        setShowLoginModal(true);
      } else if (result === "ok") {
        showToast(t("savedToast"), "success");
      } else {
        showToast(t("saveError"), "error");
      }
    } finally {
      setIsSaving(false);
    }
  }, [lastInput, mapStore.geometry, plan, showToast, t]);

  const handleStartWalk = useCallback(() => {
    if (!plan || !lastInput) return;
    // Старт для внешней навигации: первая координата плана (первая остановка)
    // неточна как место старта — берём старт из стора карты, он всегда актуален
    const start = mapStore.geometry[0];
    if (!start) return;
    const url = quickWalkToYandexMapsUrl(plan, start);
    window.open(url, "_blank", "noopener");
  }, [lastInput, mapStore.geometry, plan]);

  const phase = machine.phase;
  const cardPhase = phase === "offline" ? (machine.resumePhase ?? "idle") : phase;
  const showPanel = open && (cardPhase === "idle" || cardPhase === "params");
  const showCard = cardPhase === "ready" || cardPhase === "error" || cardPhase === "building";
  const forecast = useMemo(
    () => (selectedMinutes != null ? estimateBuildRange(selectedMinutes) : null),
    [selectedMinutes],
  );

  const weatherBadge = useMemo(() => {
    if (!context || cardPhase !== "ready") return null;
    if (context.adjustments.includes("rain-indoor")) return { icon: CloudRain, text: t("weatherRain") };
    if (context.adjustments.includes("heat-shade")) return { icon: ThermometerSun, text: t("weatherHeat") };
    if (context.adjustments.includes("dark-evening")) return null; // вечер — не предупреждение, а тон
    return { icon: null, text: t("weatherNeutral") };
  }, [cardPhase, context, t]);

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
      className="fixed bottom-0 left-0 right-0 z-30 max-h-[85dvh] overflow-y-auto rounded-t-3xl border border-slate-200 bg-white p-5 shadow-float md:bottom-4 md:left-auto md:right-6 md:max-w-[440px] md:rounded-3xl md:p-6"
      aria-label={t("screenTitle")}
    >
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-label={t("editParamsCta")}
        className="absolute right-3 top-3 z-10 rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
      >
        <X size={18} />
      </button>

      {phase === "offline" && <OfflineBanner />}

      {showPanel ? (
        <>
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
        </>
      ) : null}

      {/* Фолбэк старта: геолокацию не дали — пусть человек введёт адрес.
          Виден и в фазе error (после BUILD_FAILED), и в параметрах */}
      {needsAddress && (showPanel || cardPhase === "error") && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-medium text-slate-900">{t("startFromAddress")}</p>
          <p className="mt-0.5 text-xs text-slate-500">{t("addressHint")}</p>
          <div className="mt-3">
            <AddressInput
              placeholder={t("startFromAddress")}
              onSelect={(coords) => {
                setAddressStart(coords);
                setNeedsAddress(false);
              }}
            />
          </div>
          {addressStart && (
            <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-brand-600">
              <MapPin size={12} />
              {addressStart[0].toFixed(4)}, {addressStart[1].toFixed(4)}
            </p>
          )}
        </div>
      )}

      {showCard ? (
        <>
          {/* Индикатор цикла альтернатив: «Пересобрать» листает планы мгновенно */}
          {cardPhase === "ready" && alternativesCount > 1 && (
            <p className="pt-8 text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t("variantOf", { index: planIndex + 1, count: alternativesCount })}
            </p>
          )}
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
            onStartWalk={handleStartWalk}
            className="pt-8"
          />

          {/* Погодный контекст: почему движок выбрал такие места */}
          {weatherBadge && cardPhase === "ready" && (
            <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {weatherBadge.icon && <weatherBadge.icon size={13} className="text-brand-600" />}
              {weatherBadge.text}
            </p>
          )}

          {/* Сохранение: под карточкой, не мешает таймлайну */}
          {cardPhase === "ready" && plan && (
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || phase === "offline"}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-brand-500 hover:text-brand-600 disabled:opacity-50"
            >
              <Save size={16} />
              {isSaving ? t("saving") : t("saveCta")}
            </button>
          )}

          {/* Геолокация подсказывает, что старт берётся отсюда; fast mode — бейдж тира провайдера */}
          {phase === "building" && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
              <Crosshair size={12} />
              {t("buildingHint")}
            </p>
          )}
          {fastMode && cardPhase === "ready" && (
            <p className="mt-2 text-xs font-semibold text-brand-600">fast mode</p>
          )}
          {plan?.gatesPass && cardPhase === "ready" && (
            <p className="mt-1 text-xs text-slate-400">{t("qualityOk")}</p>
          )}
        </>
      ) : null}

      <LoginRequiredModal isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} />
    </section>
  );
}
