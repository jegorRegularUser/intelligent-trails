"use client";

// Переключатель вариантов прогулки: стрелки + кликабельные точки.
// Варианты уже построены движком — листание мгновенное и без сети,
// карта и пины обновляются тем же сетом, что и карточка.
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/utils/cn";

interface VariantNavProps {
  /** Индекс показанного варианта (0-based). */
  index: number;
  count: number;
  /** Готовый текст «Вариант N из M» из словаря. */
  label: string;
  /** aria-подписи стрелок. */
  prevLabel: string;
  nextLabel: string;
  onSelect: (index: number) => void;
  disabled?: boolean;
  className?: string;
}

export function VariantNav({
  index,
  count,
  label,
  prevLabel,
  nextLabel,
  onSelect,
  disabled = false,
  className,
}: VariantNavProps) {
  if (count < 2) return null;
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("flex items-center justify-between gap-2", className)}
    >
      <button
        type="button"
        aria-label={prevLabel}
        disabled={disabled || index === 0}
        onClick={() => onSelect(index - 1)}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition-colors hover:border-brand-600 hover:text-brand-600 disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-600"
      >
        <ChevronLeft size={18} />
      </button>

      <div className="flex flex-1 flex-col items-center gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </span>
        <div className="flex items-center gap-1.5">
          {Array.from({ length: count }, (_, i) => (
            <button
              key={i}
              type="button"
              aria-label={String(i + 1)}
              aria-current={i === index}
              disabled={disabled || i === index}
              onClick={() => onSelect(i)}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === index ? "w-5 bg-brand-600" : "w-1.5 bg-slate-300 hover:bg-brand-400",
              )}
            />
          ))}
        </div>
      </div>

      <button
        type="button"
        aria-label={nextLabel}
        disabled={disabled || index === count - 1}
        onClick={() => onSelect(index + 1)}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition-colors hover:border-brand-600 hover:text-brand-600 disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-600"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}
