"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  AlertTriangle,
  Check,
  Compass,
  Footprints,
  Info,
  RotateCcw,
  WifiOff,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/utils/cn";
import { budgetOverrunPercent, isWithinBudget, type WalkPhase } from "./logic";
import type { WalkDegradedLevel, WalkPlan } from "./types";
import { StopRow, WalkLegRow } from "./StopRow";

/**
 * Фазы, которые карточка рисует сама. `offline` — не фаза карточки:
 * сверху рендерится OfflineBanner, а контент остаётся замороженным.
 */
export type WalkCardPhase = Exclude<WalkPhase, "offline" | "params">;

/** Доля ходьбы в полосе бюджета, 0–100; нулевая прогулка — 0. */
function budgetSharePct(walkMin: number, totalMin: number): number {
  if (totalMin <= 0) return 0;
  const pct = Math.round((walkMin / totalMin) * 100);
  return Math.min(100, Math.max(0, pct));
}

export interface WalkSummaryCardProps {
  phase: WalkCardPhase;
  plan: WalkPlan | null;
  /** Текст от движка; без него — общий текст ошибки */
  errorMessage?: string | null;
  /** Остановки, для которых ищется замена */
  swappingStopIds?: string[];
  /** Оффлайн: кнопки видны, но инертны — контент заморожен */
  interactionsDisabled?: boolean;
  onSwapRequest?: (stopId: string) => void;
  onRetry?: () => void;
  onEditParams?: () => void;
  onStartWalk?: () => void;
  className?: string;
}

/**
 * Живая карточка «твоя прогулка»: одна карточка, которая морфится
 * скелетон → сводка → (иногда) ошибка. Иерархия — docs/ux-main-screen.md, раздел 5.
 */
export function WalkSummaryCard({
  phase,
  plan,
  errorMessage,
  swappingStopIds = [],
  interactionsDisabled = false,
  onSwapRequest,
  onRetry,
  onEditParams,
  onStartWalk,
  className,
}: WalkSummaryCardProps) {
  const t = useTranslations("WalkUI");

  return (
    <div className={cn("flex flex-col gap-5", className)}>
      {phase === "idle" && <EmptyState />}

      {phase === "building" && <BuildingState />}

      {phase === "error" && (
        <ErrorState message={errorMessage} onRetry={onRetry} onEditParams={onEditParams} />
      )}

      {/* Defensive: ready без плана — показываем заглушку, а не пустой div */}
      {phase === "ready" && !plan && <EmptyState />}

      {phase === "ready" && plan && (
        <>
          {/* Шапка: тип прогулки */}
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-lg font-bold text-slate-800">{t("summaryTitle")}</h3>
            <Badge variant="primary">
              {plan.type === "loop" ? t("typeLoop") : t("typeAtoB")}
            </Badge>
          </div>

          {/* Сводка честного времени + бейдж бюджета + полоса пропорции:
              «путь 20 минут, а пишет 60» видно до чтения цифр.
              Итог — единственная дисплейная цифра экрана (ux-main-screen §5). */}
          <div className="rounded-2xl border border-brand-100 bg-brand-50 p-4">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-display text-3xl font-bold text-pine-800 tabular-nums">
                {plan.totals.totalMin}
                <span className="ml-1.5 font-sans text-lg font-bold text-slate-600">{t("minutesUnit")}</span>
              </span>
              <BudgetBadge totalMin={plan.totals.totalMin} budgetMin={plan.budgetMin} />
            </div>
            <div className="mt-2.5 flex h-1.5 overflow-hidden rounded-full bg-white/80" aria-hidden>
              <div
                className="bg-brand-600"
                style={{ width: `${budgetSharePct(plan.totals.walkMin, plan.totals.totalMin)}%` }}
              />
              <div className="flex-1 bg-amber-400" />
            </div>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-brand-600" aria-hidden />
                {t("walkPart", { minutes: plan.totals.walkMin })}
              </span>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden />
                {t("stayPart", { minutes: plan.totals.stayMin })}
              </span>
            </p>
          </div>

          {/* Деградация: честная заметка — заметно, но не пугающе (принцип 5 PRODUCT.md) */}
          {plan.degraded && (
            <DegradationNote
              level={plan.degraded.level}
              note={plan.degradedNote}
            />
          )}

          {/* Таймлайн остановок */}
          <div className="flex flex-col">
            <h4 className="relative z-10 mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">
              {t("timelineTitle")}
            </h4>
            <div className="relative">
              {plan.stops.length > 0 && (
                <>
                  {/* Сплошная линия таймлайна позади кругов — модель эксперт-билдера:
                      круги w-10 с border-white перекрывают линию, leg-тексты по
                      выравниванию кругов (pl-52px) */}
                  <div
                    aria-hidden
                    className="absolute left-[19px] top-5 bottom-8 w-0.5 bg-slate-200"
                  />
                  {plan.stops.map((stop, index) => (
                    <div key={stop.id} className="relative">
                      {index > 0 && (
                        <WalkLegRow walkMin={plan.legs[index]?.walkMin ?? 0} />
                      )}
                      <StopRow
                        stop={stop}
                        isSwapping={swappingStopIds.includes(stop.id)}
                        swapDisabled={interactionsDisabled}
                        onSwapRequest={plan.stops.length > 0 ? onSwapRequest : undefined}
                        className="pb-4"
                      />
                    </div>
                  ))}
                  {plan.type === "loop" && plan.legs.length > 0 && (
                    <WalkLegRow
                      walkMin={plan.legs[plan.legs.length - 1].walkMin}
                      label={t("legWalkBack", { minutes: plan.legs[plan.legs.length - 1].walkMin })}
                      className="pb-6"
                    />
                  )}
                </>
              )}
              {/* Чистая петля без якорей: таймлайн «Старт → петля → Старт» —
                  одна строка с суммой перегонов; замены нечего предлагать. */}
              {plan.stops.length === 0 && plan.legs.length > 0 && (
                <WalkLegRow
                  walkMin={plan.totals.walkMin}
                  label={t("loopOnlyLeg", { minutes: plan.totals.walkMin })}
                  className="pb-6"
                />
              )}
            </div>
          </div>

          {/* Действия: одна первичная кнопка, всегда в зоне большого пальца.
              «Пересобрать всё» здесь нет: варианты листает VariantNav над
              таймлайном, а смена параметров — честная «Изменить параметры». */}
          <div className="flex flex-col gap-2">
            {onStartWalk && (
              <Button
                size="lg"
                className="w-full"
                disabled={interactionsDisabled}
                onClick={onStartWalk}
                leftIcon={<Footprints size={20} />}
              >
                {t("startWalkCta")}
              </Button>
            )}
            {onEditParams && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                disabled={interactionsDisabled}
                onClick={onEditParams}
                leftIcon={<RotateCcw size={16} />}
              >
                {t("editParamsCta")}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function BudgetBadge({ totalMin, budgetMin }: { totalMin: number; budgetMin: number }) {
  const t = useTranslations("WalkUI");
  if (isWithinBudget(totalMin, budgetMin)) {
    return (
      <Badge variant="success">
        <Check size={12} />
        {t("budgetWithin")}
      </Badge>
    );
  }
  return (
    <Badge variant="warning">
      <AlertTriangle size={12} />
      {t("budgetOver", { percent: budgetOverrunPercent(totalMin, budgetMin) })}
    </Badge>
  );
}

interface DegradationNoteProps {
  level: WalkDegradedLevel;
  /** Параллельная заметка из данных — фолбэк, если словарный ключ недоступен. */
  note?: { ru: string; en: string };
}

/**
 * Заметка о деградации: тёплая (amber), не красная — прогулка состоялась,
 * просто честно объясняем, почему она проще обычной. Рендер из словаря
 * WalkUI по уровню; данные-заметка — фолбэк для планов без i18n-контекста.
 */
function DegradationNote({ level, note }: DegradationNoteProps) {
  const t = useTranslations("WalkUI");
  const locale = useLocale();
  const dictText = level === "partial" ? t("degradedPartial") : t("degradedLoopOnly");
  const text = dictText || (note ? (locale === "en" ? note.en : note.ru) : "");
  return (
    <p
      role="status"
      className="flex items-start gap-1.5 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800"
    >
      <Info size={13} className="mt-0.5 shrink-0 text-amber-600" />
      <span>{text}</span>
    </p>
  );
}

function EmptyState() {
  const t = useTranslations("WalkUI");
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-brand-600">
        <Compass size={24} />
      </div>
      <p className="font-semibold text-slate-700">{t("emptyTitle")}</p>
      <p className="text-sm text-slate-500">{t("emptyHint")}</p>
    </div>
  );
}

/** Скелетон повторяет структуру будущей карточки — глаз не прыгает на ready */
function BuildingState() {
  const t = useTranslations("WalkUI");
  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-lg font-bold text-slate-800">{t("buildingTitle")}</p>
        <p className="mt-0.5 text-sm text-slate-500">{t("buildingHint")}</p>
      </div>
      <div aria-hidden className="flex flex-col gap-4">
        <div className="h-5 w-1/3 animate-pulse rounded-full bg-slate-200" />
        <div className="h-20 animate-pulse rounded-2xl bg-slate-200" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-9 w-9 animate-pulse rounded-full bg-slate-200" />
            <div className="flex flex-1 flex-col gap-1.5">
              <div className="h-4 w-2/3 animate-pulse rounded-full bg-slate-200" />
              <div className="h-3 w-1/2 animate-pulse rounded-full bg-slate-200" />
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">{t("buildingA11y")}</span>
    </div>
  );
}

interface ErrorStateProps {
  message?: string | null;
  onRetry?: () => void;
  onEditParams?: () => void;
}

/** Ошибка — состояние карточки, не модалка: главный экран не рвём */
function ErrorState({ message, onRetry, onEditParams }: ErrorStateProps) {
  const t = useTranslations("WalkUI");
  return (
    <div role="alert" className="flex flex-col gap-4 py-2">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <AlertTriangle size={20} />
        </div>
        <div>
          <p className="font-bold text-slate-800">{t("errorTitle")}</p>
          <p className="mt-1 text-sm text-slate-500">{message || t("errorGeneric")}</p>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {onRetry && (
          <Button onClick={onRetry} className="w-full" leftIcon={<RotateCcw size={16} />}>
            {t("retryCta")}
          </Button>
        )}
        {onEditParams && (
          <Button variant="ghost" onClick={onEditParams} className="w-full">
            {t("editParamsCta")}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * «Нет сети» — полоса поверх замороженного контента, не тупик:
 * готовая прогулка остаётся читаемой (принцип честной деградации).
 */
export function OfflineBanner({ className }: { className?: string }) {
  const t = useTranslations("WalkUI");
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4",
        className
      )}
    >
      <WifiOff size={18} className="mt-0.5 shrink-0 text-slate-500" />
      <div>
        <p className="text-sm font-bold text-slate-700">{t("offlineTitle")}</p>
        <p className="mt-0.5 text-xs text-slate-500">{t("offlineHint")}</p>
      </div>
    </div>
  );
}
