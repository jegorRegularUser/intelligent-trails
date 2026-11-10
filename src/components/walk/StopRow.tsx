"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useLocale, useTranslations } from "next-intl";
import { evaluateOpeningHoursDetailed } from "@/lib/places/hours";
import { OpenBadge } from "@/components/places/PlaceCard";
import {
  Camera,
  Coffee,
  Landmark,
  MapPin,
  Repeat2,
  Store,
  Trees,
  Utensils,
  Waves,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/utils/cn";
import type { WalkStop, WalkStopKind } from "./types";

type IconType = ComponentType<{ size?: number | string; className?: string }>;

const KIND_ICONS: Record<WalkStopKind, IconType> = {
  park: Trees,
  cafe: Coffee,
  food: Utensils,
  museum: Landmark,
  viewpoint: Camera,
  shop: Store,
  waterfront: Waves,
  market: Store,
  other: MapPin,
};

const KIND_I18N: Record<WalkStopKind, string> = {
  park: "stopKindPark",
  cafe: "stopKindCafe",
  food: "stopKindFood",
  museum: "stopKindMuseum",
  viewpoint: "stopKindViewpoint",
  shop: "stopKindShop",
  waterfront: "stopKindWaterfront",
  market: "stopKindMarket",
  other: "stopKindOther",
};

export interface StopRowProps {
  stop: WalkStop;
  isSwapping?: boolean;
  /** Оффлайн и прочие случаи, когда кнопка видна, но инертна */
  swapDisabled?: boolean;
  onSwapRequest?: (stopId: string) => void;
  className?: string;
}

/**
 * Строка таймлайна: «куда → надолго → зачем → а если не понравится?».
 * Порядок полей и rationale — docs/ux-main-screen.md, раздел 6.4.
 */
export function StopRow({
  stop,
  isSwapping = false,
  swapDisabled = false,
  onSwapRequest,
  className,
}: StopRowProps) {
  const t = useTranslations("WalkUI");
  const locale = useLocale();
  const Icon = KIND_ICONS[stop.kind];

  // Бейдж часов — только после монтирования: на SSR серверные часы и таймзона
  // дали бы текст, расходящийся с браузером (hydration-мисматч). Часы есть —
  // «Открыто · до 22:00» / «Закрыто»; часов нет — никакого бейджа (честно).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const hours = useMemo(() => {
    if (!stop.openingHours) return null;
    try {
      return evaluateOpeningHoursDetailed(
        stop.openingHours,
        new Date(),
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      );
    } catch {
      return null;
    }
  }, [stop.openingHours]);

  // Скоринговые причины — вторичная строка к якорной причине движка.
  // Приходят позитивными первыми (негатив — только когда позитива нет),
  // поэтому просто берём первые две — они и есть самое весомое объяснение.
  // Нет scoreReasons (старые планы из истории) — рендер деградирует в прежний вид.
  const reasonChips = stop.scoreReasons
    ? (locale === "en" ? stop.scoreReasons.en : stop.scoreReasons.ru).slice(0, 2)
    : [];

  return (
    <div className={cn("relative flex gap-3", className)} aria-busy={isSwapping || undefined}>
      {/* Круг как в эксперт-модели (w-10, border-white, z-10): непрерывная
          линия таймлайна рисуется родителем позади этих кругов */}
      <div
        className={cn(
          "relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-white shadow-sm",
          isSwapping ? "animate-pulse bg-slate-200 text-slate-400" : "bg-brand-100 text-brand-600"
        )}
      >
        <Icon size={18} />
      </div>

      <div className="min-w-0 flex-1">
        {isSwapping ? (
          // Локальная перестройка: мигает только строка, не вся карточка
          <div className="flex flex-col gap-1.5 py-0.5">
            <span className="text-xs font-semibold text-slate-500">{t("swapping")}</span>
            <div className="h-4 w-3/4 animate-pulse rounded-full bg-slate-200" />
            <div className="h-3 w-1/2 animate-pulse rounded-full bg-slate-200" />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-semibold text-slate-800">{stop.name}</span>
              <Badge size="sm">{t("stayChip", { minutes: stop.stayMin })}</Badge>
              {mounted && hours && hours.state !== "unknown" && (
                <OpenBadge state={hours.state} until={hours.closesAtText} />
              )}
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
              {t(KIND_I18N[stop.kind])} · {stop.reason}
            </p>
            {reasonChips.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {reasonChips.map((chip, i) => (
                  <span
                    key={`${chip}-${i}`}
                    className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] leading-4 text-slate-400"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            )}
            {onSwapRequest && (
              <button
                type="button"
                onClick={() => onSwapRequest(stop.id)}
                disabled={isSwapping || swapDisabled}
                aria-label={t("swapStopAria", { name: stop.name })}
                className="-ml-2 mt-1 inline-flex h-8 items-center gap-1.5 rounded-full px-2 text-xs font-semibold text-brand-600 transition-colors hover:bg-brand-50 hover:text-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:pointer-events-none disabled:opacity-40"
              >
                <Repeat2 size={14} />
                {t("swapStop")}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export interface WalkLegRowProps {
  walkMin: number;
  /** Свой текст перегона — например, «до старта» для замыкания петли */
  label?: string;
  className?: string;
}

/** Перегон между остановками: «N мин пешком» — текст на линии таймлайна
 *  (линию рисует родитель сплошной, как в эксперт-модели; отступ = круг 40px + gap 12px) */
export function WalkLegRow({ walkMin, label, className }: WalkLegRowProps) {
  const t = useTranslations("WalkUI");
  return (
    <div className={cn("py-1.5 pl-[52px] text-xs text-slate-400", className)}>
      {label ?? t("legWalk", { minutes: walkMin })}
    </div>
  );
}
