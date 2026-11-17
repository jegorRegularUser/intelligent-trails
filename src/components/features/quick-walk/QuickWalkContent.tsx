"use client";

// Контент режима «Быстрая прогулка» — вся логика прежнего QuickWalkContainer,
// но без плавающей оболочки: рендерится ВНУТРИ единой панели «План прогулки»
// (RoutePanel) рядом со свитчером режимов. Геолокация/адрес → server action →
// движок → карточка + петля на карте.
//
// Волна human design (docs/ux-human-wave.md):
//   M1 — building-петля: setBuilding до await сборки, радиус из shared-формулы;
//   F1 — диф-апдейт карты: листание вариантов и замена остановки идут с
//        {fit:false}, камера не дёргается (полный рефит — только новая прогулка);
//   M4 — шаринг ?w= v3 + гидрация чужой прогулки без сети (HYDRATE);
//   M6 — честные состояния: geoDenied, погода неизвестна, пикер города.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { CloudRain, Crosshair, MapPin, Save, Share2, ThermometerSun } from "lucide-react";
import {
  DEFAULT_CUSTOM_MINUTES,
  SURPRISE_VIBE,
  estimateBuildRange,
  normalizeCustomMinutes,
  type WalkMachineState,
  type WalkEvent,
  type VibeId,
} from "@/components/walk/logic";
import { QuickStartPanel } from "@/components/walk/QuickStartPanel";
import { OfflineBanner, WalkSummaryCard } from "@/components/walk/WalkSummaryCard";
import { VariantNav } from "@/components/walk/VariantNav";
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
import {
  decodeQuickWalkShare,
  quickWalkShareUrl,
  quickWalkToYandexMapsUrl,
} from "@/lib/walk/shareCodec";
import { searchRadiusMetersForBudget } from "@/lib/walk/shared/geometry";

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

/** Остановки плана → пины карты: reason, стоянка и часы едут в карточку пина. */
function pinsFromPlan(plan: WalkPlan, fallbackStart: [number, number]) {
  return plan.stops.map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.kind,
    coords: s.coordinates ?? fallbackStart,
    reason: s.reason,
    stayMin: s.stayMin,
    openingHours: s.openingHours,
  }));
}

export interface QuickWalkContentProps {
  /** Машина фаз живёт в QuickWalkPanel (M3): shell знает высоту шторки. */
  machine: WalkMachineState;
  dispatch: (event: WalkEvent) => void;
}

export function QuickWalkContent({
  machine,
  dispatch,
}: QuickWalkContentProps) {
  const t = useTranslations("WalkUI");
  const locale = useLocale();
  const { showToast } = useToast();
  const mapStore = useQuickWalkMapStore();
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

  const [lastInput, setLastInput] = useState<{ minutes: number; vibe: QuickVibe; start: [number, number] } | null>(null);

  /** Старт: геолокация или адрес (фолбэк, когда геолокацию не дали). */
  const [addressStart, setAddressStart] = useState<[number, number] | null>(null);
  const [needsAddress, setNeedsAddress] = useState(false);
  /** M6: отказ геолокации — не «поломка», а просьба сказать, откуда пойдём. */
  const [geoDenied, setGeoDenied] = useState(false);
  const addressInputRef = useRef<HTMLDivElement | null>(null);
  const focusAddressInput = useCallback(() => {
    addressInputRef.current?.querySelector("input")?.focus();
  }, []);

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
  }, [dispatch]);

  const touchParams = useCallback(() => dispatch({ type: "PARAMS_TOUCHED" }), [dispatch]);

  const runBuild = useCallback(
    async (minutes: number, vibeId: QuickVibe, opts?: { manualStart?: [number, number] }) => {
      dispatch({ type: "START_BUILD" });
      setErrorMessage(null);
      setGeoDenied(false);
      // Запоминаем параметры сразу: Retry после отказа геолокации должен работать
      setLastInput((prev) => ({ minutes, vibe: vibeId, start: opts?.manualStart ?? prev?.start ?? [0, 0] }));
      let start: [number, number];
      try {
        start = opts?.manualStart ?? (await getCurrentStart());
      } catch (error) {
        // Честный фолбэк (M6): отказ геолокации ≠ общая поломка — просим адрес.
        // Машину выводим из building через BUILD_FAILED (PARAMS_TOUCHED из
        // building — но-оп, экран залип бы в спиннере); блок ввода адреса
        // рендерим в фазе error рядом с кнопкой Retry.
        const denied = error instanceof Error && error.message === "geolocation-denied";
        setGeoDenied(denied);
        setNeedsAddress(true);
        dispatch({ type: "BUILD_FAILED" });
        if (denied) focusAddressInput();
        return;
      }
      // Building-петля (M1/S1): ставим ЗОНЫ ДО await сборки — старт уже решён
      // (геолокация/адрес), радиус считает клиентская shared-формула, та же
      // арифметика, что у серверного поиска POI. Снимает setWalk (успех) и
      // finally (отказ/ошибка).
      mapStore.setBuilding({ start, radiusMeters: searchRadiusMetersForBudget(minutes) });
      try {
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
          setLastInput({ minutes, vibe: vibeId, start });
          mapStore.setWalk(
            planPolyline(result.plans[0], start),
            t("startPinLabel"),
            pinsFromPlan(result.plans[0], start),
          );
          dispatch({ type: "BUILD_SUCCESS" });
        } else {
          setErrorMessage(result.error);
          dispatch({ type: "BUILD_FAILED" });
        }
      } catch {
        setErrorMessage(t("errorGeneric"));
        dispatch({ type: "BUILD_FAILED" });
      } finally {
        mapStore.setBuilding(null);
      }
    },
    [dispatch, focusAddressInput, locale, mapStore, t],
  );

  const handleStart = useCallback(() => {
    // Вайб необязателен (ux-main-screen §6.2): CTA активна от одного времени,
    // поэтому пустой вайб — это «Удиви меня» (микс без ядра), а не молчаливый но-оп.
    const vibeValue: QuickVibe = vibe ?? SURPRISE_VIBE;
    if (selectedMinutes == null) return;
    const minutes = isCustomActive
      ? normalizeCustomMinutes(customMinutes ?? DEFAULT_CUSTOM_MINUTES)
      : selectedMinutes;
    excludedRef.current = new Set();
    // lastInput (включая фактический старт) запишет runBuild при успехе
    void runBuild(minutes, vibeValue, addressStart ? { manualStart: addressStart } : undefined);
  }, [addressStart, customMinutes, isCustomActive, runBuild, selectedMinutes, vibe]);

  const handleRetry = useCallback(() => {
    if (!lastInput) return;
    const hasStart = addressStart != null || (lastInput.start[0] !== 0 || lastInput.start[1] !== 0);
    if (!hasStart) {
      // Старт ещё не решён (отказ геолокации без адреса) — открываем фолбэк
      setNeedsAddress(true);
      focusAddressInput();
      return;
    }
    dispatch({ type: "RETRY" });
    void runBuild(lastInput.minutes, lastInput.vibe, addressStart ? { manualStart: addressStart } : undefined);
  }, [addressStart, dispatch, focusAddressInput, lastInput, runBuild]);

  // --- Гидрация ?w= (M4/B4): чужая прогулка открывается без сети. ---
  const searchParams = useSearchParams();
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    const shared = searchParams.get("w");
    if (!shared) return;
    hydratedRef.current = true;
    const decoded = decodeQuickWalkShare(shared);
    if (!decoded) return;
    const { plan: sharedPlan, geoDropped } = decoded;
    const sharedStart = sharedPlan.legs[0]?.geometry?.[0] ?? sharedPlan.stops[0]?.coordinates ?? null;
    setPlans([sharedPlan]);
    setPlanIndex(0);
    setContext(null); // контекст погоды из ссылки не живёт — бейдж weatherUnknown
    setLastInput(null); // rebuild/замены недоступны без параметров сборки
    if (sharedStart) {
      mapStore.setWalk(
        planPolyline(sharedPlan, sharedStart),
        t("startPinLabel"),
        pinsFromPlan(sharedPlan, sharedStart),
      );
    }
    dispatch({ type: "HYDRATE" });
    if (geoDropped) showToast(t("routeRestored"), "info");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  /** Слайдер вариантов: листает построенные планы мгновенно, без сети.
   *  Старт — из стора карты (F1): гидрация ?w= заполняет его без lastInput. */
  const handleSelectVariant = useCallback(
    (index: number) => {
      if (!plans || index < 0 || index >= plans.length || index === planIndex) return;
      setPlanIndex(index);
      const start = mapStore.start ?? lastInput?.start;
      if (!start) return;
      mapStore.setWalk(
        planPolyline(plans[index], start),
        t("startPinLabel"),
        pinsFromPlan(plans[index], start),
        { fit: false },
      );
    },
    [lastInput, mapStore, planIndex, plans, t],
  );

  /** «Изменить параметры»: честный сброс к экрану ввода (новый сетап чистит
   *  и чёрный список замен). Пересборка ради других вариантов — не здесь:
   *  их листает слайдер. */
  const handleResetParams = useCallback(() => {
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
  }, [dispatch, mapStore]);

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
              t("startPinLabel"),
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
    [dispatch, lastInput, locale, mapStore, showToast, t],
  );

  const handleSwapRequest = useCallback(
    (stopId: string) => {
      // Локальная замена (PRODUCT, принцип 3): подмена одного сегмента петли
      // вместо пересборки. Текущий план уезжает на сервер как есть — ноги и
      // причины сохранившихся остановок переиспользуются, busy-флаг один и
      // тот же (swappingIds крутит спиннер строки, машина фаз не трогается).
      // Один свап за раз: параллельные «Заменить» по разным строкам гоняют
      // два replaceQuickStop поверх одного плана — второй затирает первый.
      if (!plan || !lastInput) return;
      if (swappingIds.length > 0) return;
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
            // Честная база фолбэка: сколько гейтов реально прошло у плана
            // (движок знает их состав; у деградированных планов база ниже).
            ...(plan.gatesPassedCount !== undefined
              ? { currentGatesPassed: plan.gatesPassedCount }
              : {}),
            // Уличный план (§19.6): замена гарниша без пересборки петли; факт
            // снапа (гейт street_interest) переносится в заменённый план.
            ...(plan.kind === "street" ? { planKind: "street" as const } : {}),
            ...(plan.gatesSummary?.some((g) => g.name === "street_interest" && g.pass)
              ? { streetInterestPass: true }
              : {}),
          });
          if (result.ok) {
            const next = result.plan;
            // Заменённая уходит в чёрный список, как и в старом флоу:
            // без этого место может вернуться кандидатом при следующей замене.
            excludedRef.current.add(stopId);
            // Текущий вариант обновляется, соседние остаются листаться:
            // замена сегмента не должна уничтожать остальные построенные планы.
            setPlans((prev) => (prev ? prev.map((p, i) => (i === planIndex ? next : p)) : [next]));
            // Диф-апдейт карты (F1): та же прогулка после замены — камера не дёргается.
            mapStore.setWalk(
              planPolyline(next, lastInput.start),
              t("startPinLabel"),
              pinsFromPlan(next, lastInput.start),
              { fit: false },
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
    [dispatch, lastInput, locale, mapStore, plan, planIndex, runLegacyRebuild, showToast, t],
  );

  const handleSave = useCallback(async () => {
    if (!plan) return;
    const saveStart = mapStore.start ?? lastInput?.start ?? plan.stops[0]?.coordinates;
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
  }, [lastInput, mapStore.start, plan, showToast, t]);

  const handleStartWalk = useCallback(() => {
    if (!plan) return;
    // Старт для внешней навигации: start стора карты — всегда актуален
    const start = mapStore.start ?? mapStore.geometry[0];
    if (!start) return;
    const url = quickWalkToYandexMapsUrl(plan, start);
    window.open(url, "_blank", "noopener");
  }, [mapStore.geometry, mapStore.start, plan]);

  /** M4: кнопка «Поделиться» — Web Share API → clipboard → тост. Без логина. */
  const handleShare = useCallback(async () => {
    if (!plan) return;
    const start = mapStore.start ?? mapStore.geometry[0] ?? plan.stops[0]?.coordinates;
    if (!start) return;
    const path = quickWalkShareUrl(plan, start, planIndex);
    const url = `${window.location.origin}${path}`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: t("walkName", { minutes: plan.budgetMin }), url });
        // Успешный системный шеринг тоста не требует — результат виден в ОС.
        return;
      }
      await navigator.clipboard.writeText(url);
      showToast(t("shareCopied"), "success");
    } catch (error) {
      // Отказ от системного шаринга — не ошибка, тост не пугает.
      if ((error as { name?: string })?.name === "AbortError") return;
      showToast(t("shareFailed"), "error");
    }
  }, [mapStore.geometry, mapStore.start, plan, planIndex, showToast, t]);

  const phase = machine.phase;
  const cardPhase = phase === "offline" ? (machine.resumePhase ?? "idle") : phase;
  const showPanel = cardPhase === "idle" || cardPhase === "params";
  const showCard = cardPhase === "ready" || cardPhase === "error" || cardPhase === "building";
  const forecast = useMemo(
    () => (selectedMinutes != null ? estimateBuildRange(selectedMinutes) : null),
    [selectedMinutes],
  );

  const weatherBadge = useMemo(() => {
    if (cardPhase !== "ready") return null;
    // M6, принцип 5 (честная деградация): погода неизвестна — нейтральный факт
    // вместо ложного «Погода располагает к прогулке». Контекста нет вовсе
    // (гидрация ?w=) или сервис погоды не приехал (tempC null, сигналов нет).
    const weatherUnknown =
      !context ||
      (context.tempC === null && !context.isRaining && !context.isDark && context.adjustments.length === 0);
    if (weatherUnknown) return { icon: null, text: t("weatherUnknown") };
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
          />

          {/* Тот же AddressInput, что и в эксперт-маршруте: необязательный старт.
              Геолокация по умолчанию; поле — чтобы стартовать не отсюда
              (чужой город/район решается им же — PRODUCT.md, «Два сценария входа»). */}
          <div className="mt-4" ref={addressInputRef}>
            <AddressInput
              placeholder={needsAddress ? t("startFromAddress") : t("startFromAddressOptional")}
              onSelect={(coords) => {
                setAddressStart(coords);
                setNeedsAddress(false);
                setGeoDenied(false);
              }}
            />
            {addressStart ? (
              <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-brand-600">
                <MapPin size={12} />
                {addressStart[0].toFixed(4)}, {addressStart[1].toFixed(4)}
              </p>
            ) : geoDenied ? (
              <p className="mt-2 text-xs text-amber-700">{t("geoDenied")}</p>
            ) : needsAddress ? (
              <p className="mt-2 text-xs text-slate-500">{t("addressHint")}</p>
            ) : null}
          </div>
        </>
      ) : null}

      {/* После неудачной сборки адрес тоже нужен — показываем в фазе error */}
      {needsAddress && cardPhase === "error" && (
        <div className="mt-4" ref={addressInputRef}>
          <AddressInput
            placeholder={t("startFromAddress")}
            onSelect={(coords) => {
              setAddressStart(coords);
              setNeedsAddress(false);
              setGeoDenied(false);
            }}
          />
          {geoDenied && <p className="mt-2 text-xs text-amber-700">{t("geoDenied")}</p>}
        </div>
      )}

      {showCard ? (
        <>
          {/* Слайдер вариантов: листает построенные планы мгновенно, без сети */}
          {cardPhase === "ready" && (
            <VariantNav
              index={planIndex}
              count={alternativesCount}
              label={t("variantOf", { index: planIndex + 1, count: alternativesCount })}
              prevLabel={t("variantPrev")}
              nextLabel={t("variantNext")}
              onSelect={handleSelectVariant}
              disabled={phase === "offline"}
            />
          )}
          <WalkSummaryCard
            phase={cardPhase === "ready" || cardPhase === "error" ? cardPhase : "building"}
            plan={plan}
            errorMessage={errorMessage}
            swappingStopIds={swappingIds}
            interactionsDisabled={phase === "offline"}
            onSwapRequest={lastInput ? handleSwapRequest : undefined}
            onRetry={handleRetry}
            onEditParams={handleResetParams}
            onStartWalk={handleStartWalk}
          />

          {/* Погодный контекст: почему движок выбрал такие места (M6: unknown — факт) */}
          {weatherBadge && cardPhase === "ready" && (
            <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {weatherBadge.icon && <weatherBadge.icon size={13} className="text-brand-600" />}
              {weatherBadge.text}
            </p>
          )}

          {/* Сохранение и шеринг: под карточкой, не мешают таймлайну.
              Шеринг без логина (принцип 4: ссылка = маршрут). */}
          {cardPhase === "ready" && plan && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving || phase === "offline"}
                className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-brand-500 hover:text-brand-600 disabled:opacity-50"
              >
                <Save size={16} />
                {isSaving ? t("saving") : t("saveCta")}
              </button>
              <button
                type="button"
                onClick={handleShare}
                disabled={phase === "offline"}
                className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-brand-500 hover:text-brand-600 disabled:opacity-50"
              >
                <Share2 size={16} />
                {t("shareCta")}
              </button>
            </div>
          )}

          {/* Геолокация подсказывает, что старт берётся отсюда; fast mode — бейдж тира провайдера */}
          {phase === "building" && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
              <Crosshair size={12} />
              {t("buildingHint")}
            </p>
          )}
          {plan?.gatesPass && cardPhase === "ready" && (
            <p className="mt-1 text-xs text-slate-500">{t("qualityOk")}</p>
          )}
        </>
      ) : null}

      {/* Модалка логина — контентная часть; скетч-обёртку добавляет QuickWalkPanel */}
      <LoginRequiredModal isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} />
    </>
  );
}
