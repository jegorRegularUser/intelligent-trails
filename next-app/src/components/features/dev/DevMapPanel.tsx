"use client";

// Dev-панель на карте: демо WalkDemo + SketchCard в реальном контексте /map
// (запрос владельца — «не отдельная страница, а блок на карте»).
// Открывается ?dev=1 на /map и только вне production (гейт в app/map/page.tsx).
import { useState } from "react";
import { useTranslations } from "next-intl";
import { WalkDemo } from "@/components/walk/WalkDemo";
import { SketchCard } from "@/components/ui/SketchCard";
import { cn } from "@/utils/cn";

export function DevMapPanel() {
  const t = useTranslations("WalkUI");
  const [sketchOn, setSketchOn] = useState(false);

  return (
    <section
      aria-label="Dev panel"
      className={cn(
        "fixed z-30 overflow-y-auto rounded-3xl border border-slate-200 bg-white p-4 shadow-float",
        "bottom-0 left-0 right-0 max-h-[70dvh] rounded-t-3xl",
        "md:bottom-auto md:right-6 md:top-24 md:left-auto md:w-[420px] md:max-h-[calc(100vh-140px)] md:rounded-3xl",
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">dev · demo on map</p>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-slate-600">
          <input
            type="checkbox"
            checked={sketchOn}
            onChange={(e) => setSketchOn(e.target.checked)}
            className="h-3.5 w-3.5 accent-brand-500"
          />
          sketch
        </label>
      </div>
      <SketchCard sketch={sketchOn} className="p-4">
        <WalkDemo />
      </SketchCard>
      <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
        {t("demoHint")}
      </p>
    </section>
  );
}
