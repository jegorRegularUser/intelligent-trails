"use client";

import type { ComponentType } from "react";
import { useId } from "react";
import { useTranslations } from "next-intl";
import {
  CloudRain,
  Coffee,
  Footprints,
  Minus,
  MoonStar,
  Plus,
  Sparkles,
  Trees,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/utils/cn";
import {
  CUSTOM_STEP,
  DEFAULT_CUSTOM_MINUTES,
  MAX_CUSTOM_MINUTES,
  MIN_CUSTOM_MINUTES,
  TIME_PRESETS,
  VIBE_IDS,
  SURPRISE_VIBE,
  canStartWalk,
  normalizeCustomMinutes,
  toggleVibe,
  type TimePreset,
  type VibeId,
} from "./logic";

type IconType = ComponentType<{ size?: number | string; className?: string }>;

const VIBE_ICONS: Record<VibeId, IconType> = {
  green: Trees,
  coffee: Coffee,
  evening: MoonStar,
  rain: CloudRain,
  surprise: Sparkles,
};

const VIBE_I18N: Record<VibeId, string> = {
  green: "vibeGreen",
  coffee: "vibeCoffee",
  evening: "vibeEvening",
  rain: "vibeRain",
  surprise: "vibeSurprise",
};

const PRESET_I18N: Record<TimePreset, string> = {
  30: "time30",
  60: "time60",
  90: "time90",
};

export interface QuickStartPanelProps {
  /** Выбранный бюджет в минутах (пресет или «Точно…») */
  selectedMinutes: number | null;
  isCustomActive: boolean;
  /** Текущее значение степпера «Точно…» */
  customMinutes: number | null;
  onSelectPreset: (minutes: number) => void;
  onCustomActivate: () => void;
  onCustomChange: (minutes: number) => void;
  selectedVibe: VibeId | null;
  onSelectVibe: (vibe: VibeId | null) => void;
  onStart: () => void;
  /** Сборка идёт — CTA в busy-состоянии */
  isBuilding?: boolean;
  /** Оффлайн и прочие случаи, когда стартовать нельзя */
  disabled?: boolean;
  /** Прогноз под CTA — считается по бюджету (estimateBuildRange) */
  forecast?: { from: number; to: number } | null;
  className?: string;
}

const chipClassName = (selected: boolean) =>
  cn(
    "inline-flex h-11 items-center gap-1.5 rounded-full border-2 px-4 text-sm font-semibold transition-all duration-200 active:scale-95",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
    selected
      ? "border-brand-500 bg-brand-500 text-white shadow-sm"
      : "border-slate-200 bg-white text-slate-600 hover:border-brand-500 hover:text-brand-600"
  );

const stepButtonClassName =
  "flex h-10 w-10 items-center justify-center rounded-full border-2 border-slate-200 bg-white text-slate-600 transition-colors hover:border-brand-500 hover:text-brand-600 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500";

/**
 * Быстрый старт: два вопроса (время → вайб) и одна кнопка.
 * Чипы времени — радиогруппа (бюджет один), вайбы — группа с aria-pressed.
 * Обоснование чипов — docs/ux-main-screen.md, раздел 6.1–6.2.
 */
export function QuickStartPanel({
  selectedMinutes,
  isCustomActive,
  customMinutes,
  onSelectPreset,
  onCustomActivate,
  onCustomChange,
  selectedVibe,
  onSelectVibe,
  onStart,
  isBuilding = false,
  disabled = false,
  forecast,
  className,
}: QuickStartPanelProps) {
  const t = useTranslations("WalkUI");
  const timeLegendId = useId();
  const vibeLegendId = useId();
  const canStart = canStartWalk(selectedMinutes);
  const effectiveCustom = customMinutes ?? DEFAULT_CUSTOM_MINUTES;

  return (
    <div className={cn("flex flex-col gap-5", className)}>
      <header>
        <h2 className="text-xl font-bold text-slate-800">{t("screenTitle")}</h2>
        <p className="mt-0.5 text-sm text-slate-500">{t("screenSubtitle")}</p>
      </header>

      {/* Вопрос 1: время (бюджет генератора) */}
      <section>
        <p id={timeLegendId} className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
          {t("timeLegend")}
        </p>
        <div role="radiogroup" aria-labelledby={timeLegendId} className="flex flex-wrap gap-2">
          {TIME_PRESETS.map((preset) => {
            const selected = !isCustomActive && selectedMinutes === preset;
            return (
              <button
                key={preset}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                onClick={() => onSelectPreset(preset)}
                className={chipClassName(selected)}
              >
                {t(PRESET_I18N[preset])}
              </button>
            );
          })}
          <button
            type="button"
            role="radio"
            aria-checked={isCustomActive}
            disabled={disabled}
            onClick={onCustomActivate}
            className={chipClassName(isCustomActive)}
          >
            {t("timeCustom")}
          </button>
        </div>

        {isCustomActive && (
          <div className="mt-3 flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              {t("timeCustomLabel")}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                aria-label={t("decreaseTime")}
                disabled={disabled || effectiveCustom <= MIN_CUSTOM_MINUTES}
                onClick={() => onCustomChange(normalizeCustomMinutes(effectiveCustom - CUSTOM_STEP))}
                className={stepButtonClassName}
              >
                <Minus size={16} />
              </button>
              <span className="w-16 text-center text-sm font-bold text-slate-800">
                {effectiveCustom} {t("minutesUnit")}
              </span>
              <button
                type="button"
                aria-label={t("increaseTime")}
                disabled={disabled || effectiveCustom >= MAX_CUSTOM_MINUTES}
                onClick={() => onCustomChange(normalizeCustomMinutes(effectiveCustom + CUSTOM_STEP))}
                className={stepButtonClassName}
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Вопрос 2: вайб (окраска, не обязательна) */}
      <section>
        <p id={vibeLegendId} className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
          {t("vibeLegend")}
        </p>
        <div role="group" aria-labelledby={vibeLegendId} className="flex flex-wrap gap-2">
          {VIBE_IDS.map((vibe) => {
            const selected = selectedVibe === vibe && vibe !== SURPRISE_VIBE;
            const Icon = VIBE_ICONS[vibe];
            return (
              <button
                key={vibe}
                type="button"
                aria-pressed={selected}
                disabled={disabled}
                onClick={() => onSelectVibe(toggleVibe(selectedVibe, vibe))}
                className={chipClassName(selected)}
              >
                <Icon size={16} />
                {t(VIBE_I18N[vibe])}
              </button>
            );
          })}
        </div>
      </section>

      {/* CTA: одна первичная кнопка, подсказка объясняет, чего не хватает */}
      <div className="flex flex-col gap-2">
        <Button
          size="lg"
          className="w-full"
          isLoading={isBuilding}
          disabled={disabled || (!canStart && !isBuilding)}
          onClick={onStart}
          leftIcon={<Footprints size={20} />}
        >
          {isBuilding ? t("buildingCta") : t("startCta")}
        </Button>
        <p className="text-center text-xs text-slate-400" aria-live="polite">
          {!canStart
            ? t("startCtaHint")
            : forecast
              ? t("forecast", { from: forecast.from, to: forecast.to })
              : ""}
        </p>
      </div>
    </div>
  );
}
