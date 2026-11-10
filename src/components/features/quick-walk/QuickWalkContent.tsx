"use client";

// Контент режима «Быстрая прогулка» — вся логика прежнего QuickWalkContainer,
// но без плавающей оболочки: рендерится ВНУТРИ единой панели «План прогулки»
// (RoutePanel) рядом со свитчером режимов. Геолокация/адрес → server action →
// движок → карточка + петля на карте.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CloudRain, Crosshair, MapPin, Save, ThermometerSun } from "lucide-react";
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
import {
  buildQuickWalk,
  type QuickVibe,
  type WalkContextInfo,
} from "@/actions/quickWalk";
import { replaceQuickStop } from "@/actions/quickWalkReplace";
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

/** Остановки плана → пины карты: reason и часы едут в бейдж карточки пина. */
function pinsFromPlan(plan: WalkPlan, fallbackStart: [number, number]) {
  return plan.stops.map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.kind,
    coords: s.coordinates ?? fallbackStart,
    reason: s.reason,
    openingHours: s.openingHours,
  }));
}

export function QuickWalkContent({ mode = "quick" }: { mode?: "quick" | "sightseeing" }) {
  const t = useTranslations("WalkUI");
  const locale = useLocale();
  const { showToast } = useToast();
  const mapStore = useQuickWalkMapStore();
  const [machine, dispatch] = useReducer(walkMachine, INITIAL_WALK_STATE);
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
      // Запоминаем параметры сразу: Retry после отказа геолокации должен работать
      setLastInput((prev) => ({ minutes, vibe: vibeId, start: opts?.manualStart ?? prev?.start ?? [0, 0] }));
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
          mapStore.setWalk(
            planPolyline(result.plans[0], start),
            "Старт прогулки",
            pinsFromPlan(result.plans[0], start),
          );
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
    // Обзорный режим (вход №2): архетип фиксирован, юзер выбирает город и время.
    const vibeValue: QuickVibe | null = mode === "sightseeing" ? "sightseeing" : vibe;
    if (selectedMinutes == null || vibeValue == null) return;
    const minutes = isCustomActive
      ? normalizeCustomMinutes(customMinutes ?? DEFAULT_CUSTOM_MINUTES)
      : selectedMinutes;
    excludedRef.current = new Set();
    // lastInput (включая фактический старт) запишет runBuild при успехе
    void runBuild(minutes, vibeValue, addressStart ? { manualStart: addressStart } : undefined);
  }, [addressStart, customMinutes, isCustomActive, mode, runBuild, selectedMinutes, vibe]);

  const handleRetry = useCallback(() => {
    if (!lastInput) return;
    const hasStart = addressStart != null || (lastInput.start[0] !== 0 || lastInput.start[1] !== 0);
    if (!hasStart) {
      // Старт ещё не решён (отказ геолокации без адреса) — открываем фолбэк
      setNeedsAddress(true);
      return;
    }
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
        mapStore.setWalk(
          planPolyline(plans[next], lastInput.start),
          "Старт прогулки",
          pinsFromPlan(plans[next], lastInput.start),
        );
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

  /** Старое поведение «Заменить»: полная пересборка с чёрным списком.
   *  Осталось фолбэком — локальная замена зовёт его из тоста, когда
   *  достойной замены сегмента не нашлось. */
  const runLegacyRebuild = useCallback(
    (stopId: string) => {
      if (!lastInput) return;
      setSwappingIds((prev) => (prev.includes(stopId) ? prev : [...prev, stopId]));
      excludedRef.current.add(stopId);
      void (async () => {
        try {
          // Старт именно той прогулки (не новая геолокация): план перестраивается
          // вокруг той же точки, иначе карты и ноги разъедутся.
          const start = lastInput.start;
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
            mapStore.setWalk(
              planPolyline(result.plans[0], start),
              "Старт прогулки",
              pinsFromPlan(result.plans[0], start),
            );
            dispatch({ type: "BUILD_SUCCESS" });
          } else {
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
    [lastInput, locale, mapStore, showToast, t],
  );

  const handleSwapRequest = useCallback(
    (stopId: string) => {
      // Локальная замена (PRODUCT, принцип 3): подмена одного сегмента петли
      // вместо пересборки. Текущий план уезжает на сервер как есть — ноги и
      // причины сохранившихся остановок переиспользуются, busy-флаг один и
      // тот же (swappingIds крутит спиннер строки, машина фаз не трогается).
      if (!plan || !lastInput) return;
      setSwappingIds((prev) => (prev.includes(stopId) ? prev : [...prev, stopId]));
      void (async () => {
        try {
          const result = await replaceQuickStop({
            start: lastInput.start,
            budgetMinutes: lastInput.minutes,
            vibe: lastInput.vibe,
            timezone: browserTimezone(),
            locale: locale === "en" ? "en" : "ru",
            currentStops: plan.stops.map((s) => ({
              id: s.id,
              name: s.name,
              reason: s.reason,
              category: s.category ?? "",
              stayMin: s.stayMin,
              coordinates: s.coordinates ?? lastInput.start,
              ...(s.rating !== undefined ? { rating: s.rating } : {}),
              ...(s.tags ? { tags: s.tags } : {}),
              ...(s.openingHours ? { openingHours: s.openingHours } : {}),
              // Причины едут туда и обратно: у выживших остановок это факты
              // прошлого скоринга, сервер возвращает их как есть.
              ...(s.scoreReasons ? { scoreReasons: s.scoreReasons } : {}),
            })),
            replaceStopId: stopId,
            excludeStopIds: [...excludedRef.current],
            currentLegs: plan.legs.map((l) =>
              l.geometry && l.geometry.length > 0
                ? { walkMin: l.walkMin, geometry: l.geometry }
                : { walkMin: l.walkMin },
            ),
            // Петля живёт на 4 гейтах (бюджет, якоря, ноги, улицы):
            // флаг есть — база фолбэка движка полная.
            ...(plan.gatesPass ? { currentGatesPassed: 4 } : {}),
          });
          if (result.ok) {
            const next = result.plan;
            // Заменённая уходит в чёрный список, как и в старом флоу:
            // без этого место может вернуться кандидатом при следующей замене.
            excludedRef.current.add(stopId);
            setPlans([next]);
            setPlanIndex(0);
            mapStore.setWalk(
              planPolyline(next, lastInput.start),
              "Старт прогулки",
              pinsFromPlan(next, lastInput.start),
            );
            // Из ready — но-оп: машина не покидала фазу, карточка просто обновилась
            dispatch({ type: "BUILD_SUCCESS" });
          } else {
            // Заменить не получилось — старый план остаётся. Предлагаем фолбэк:
            // пересборку с чёрным списком одной кнопкой в тосте.
            dispatch({ type: "BUILD_SUCCESS" });
            showToast(result.error, "error", {
              label: t("swapFallbackRebuild"),
              onClick: () => runLegacyRebuild(stopId),
            });
          }
        } catch {
          dispatch({ type: "BUILD_SUCCESS" });
          showToast(t("errorGeneric"), "error");
        } finally {
          setSwappingIds((prev) => prev.filter((id) => id !== stopId));
        }
      })();
    },
    [lastInput, locale, mapStore, plan, runLegacyRebuild, showToast, t],
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
    if (!plan) return;
    // Старт для внешней навигации: geometry[0] стора карты — всегда актуален
    const start = mapStore.geometry[0];
    if (!start) return;
    const url = quickWalkToYandexMapsUrl(plan, start);
    window.open(url, "_blank", "noopener");
  }, [mapStore.geometry, plan]);

  const phase = machine.phase;
  const cardPhase = phase === "offline" ? (machine.resumePhase ?? "idle") : phase;
  const showPanel = cardPhase === "idle" || cardPhase === "params";
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

  return (
    <>
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
            hideVibes={mode === "sightseeing"}
            headerKey={mode === "sightseeing" ? "sightseeingTitle" : "screenTitle"}
            subtitleKey={mode === "sightseeing" ? "sightseeingSubtitle" : "screenSubtitle"}
          />

          {/* Тот же AddressInput, что и в эксперт-маршруте: необязательный старт.
              Геолокация по умолчанию; поле — чтобы стартовать не отсюда */}
          <div className="mt-4">
            <AddressInput
              placeholder={needsAddress ? t("startFromAddress") : t("startFromAddressOptional")}
              onSelect={(coords) => {
                setAddressStart(coords);
                setNeedsAddress(false);
              }}
            />
            {addressStart ? (
              <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-brand-600">
                <MapPin size={12} />
                {addressStart[0].toFixed(4)}, {addressStart[1].toFixed(4)}
              </p>
            ) : needsAddress ? (
              <p className="mt-2 text-xs text-slate-500">{t("addressHint")}</p>
            ) : null}
          </div>
        </>
      ) : null}

      {/* После неудачной сборки адрес тоже нужен — показываем в фазе error */}
      {needsAddress && cardPhase === "error" && (
        <div className="mt-4">
          <AddressInput
            placeholder={t("startFromAddress")}
            onSelect={(coords) => {
              setAddressStart(coords);
              setNeedsAddress(false);
            }}
          />
        </div>
      )}

      {showCard ? (
        <>
          {/* Индикатор цикла альтернатив: «Пересобрать» листает планы мгновенно */}
          {cardPhase === "ready" && alternativesCount > 1 && (
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
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

      {/* Модалка логина — контентная часть; скетч-обёртку добавляет QuickWalkPanel */}
      <LoginRequiredModal isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} />
    </>
  );
}
