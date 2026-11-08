"use client";

// Режим «Быстрая прогулка» единой панели «План прогулки»:
// тот же RoutePanel-шелл, что и у эксперт-маршрута, свитчер режимов в шапке,
// внутри — реальная логика QuickWalkContent. sketch=true оборачивает контент
// в SketchCard (dev-переключатель ?sketch=1 на /map).
import { useTranslations } from "next-intl";
import { RoutePanel } from "@/components/ui/RoutePanel";
import { SketchCard } from "@/components/ui/SketchCard";
import { WalkModeSwitcher } from "@/components/features/walk-mode/WalkModeSwitcher";
import { QuickWalkContent } from "./QuickWalkContent";

export function QuickWalkPanel({ isNavigationOpen = false, sketch = false }: { isNavigationOpen?: boolean; sketch?: boolean }) {
  const t = useTranslations("WalkUI");

  const body = (
    <div className="flex flex-col gap-4">
      <WalkModeSwitcher />
      <QuickWalkContent />
    </div>
  );

  return (
    <RoutePanel
      isNavigationOpen={isNavigationOpen}
      header={<h2 className="text-lg font-bold text-slate-900">{t("screenTitle")}</h2>}
    >
      {sketch ? <SketchCard sketch className="p-4">{body}</SketchCard> : body}
    </RoutePanel>
  );
}
