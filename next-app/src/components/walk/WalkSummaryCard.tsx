"use client";

import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  Check,
  Compass,
  Footprints,
  RotateCcw,
  WifiOff,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/utils/cn";
import { budgetOverrunPercent, isWithinBudget, type WalkPhase } from "./logic";
import type { WalkPlan } from "./types";
import { StopRow, WalkLegRow } from "./StopRow";

/**
 * Фазы, которые карточка рисует сама. `offline` — не фаза карточки:
 * сверху рендерится OfflineBanner, а контент остаётся замороженным.
 */
export type WalkCardPhase = Exclude<WalkPhase, "offline" | "params">;

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
  onRebuild?: () => void;
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
  onRebuild,
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

          {/* Сводка честного времени + бейдж бюджета */}
          <div className="rounded-2xl border border-brand-100 bg-brand-50 p-4">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-3xl font-bold text-slate-800">
                {plan.totals.totalMin} {t("minutesUnit")}
              </span>
              <BudgetBadge totalMin={plan.totals.totalMin} budgetMin={plan.budgetMin} />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {t("walkPart", { minutes: plan.totals.walkMin })} ·{" "}
              {t("stayPart", { minutes: plan.totals.stayMin })}
            </p>
          </div>

          {/* Таймлайн остановок */}
          <div className="flex flex-col">
            <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">
              {t("timelineTitle")}
            </h4>
            {plan.stops.map((stop, index) => (
              <div key={stop.id}>
                {index > 0 && (
                  <WalkLegRow walkMin={plan.legs[index]?.walkMin ?? 0} className="mb-1" />
                )}
                <StopRow
                  stop={stop}
                  isSwapping={swappingStopIds.includes(stop.id)}
                  swapDisabled={interactionsDisabled}
                  onSwapRequest={onSwapRequest}
                  className="pb-1"
                />
              </div>
            ))}
            {plan.type === "loop" && plan.legs.length > 0 && (
              <WalkLegRow
                walkMin={plan.legs[plan.legs.length - 1].walkMin}
                label={t("legWalkBack", { minutes: plan.legs[plan.legs.length - 1].walkMin })}
                className="mt-1"
              />
            )}
          </div>

          {/* Действия: одна первичная кнопка, всегда в зоне большого пальца */}
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
            {onRebuild && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                disabled={interactionsDisabled}
                onClick={onRebuild}
                leftIcon={<RotateCcw size={16} />}
              >
                {t("rebuildCta")}
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
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-yellow-100 text-yellow-700">
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
