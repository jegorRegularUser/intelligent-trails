"use client";

// Режим «Быстрая прогулка» единой панели «План прогулки»:
// тот же RoutePanel-шелл, что и у эксперт-маршрута. Свитчер живёт в шапке
// панели — один заголовок вместо двух, а на мобилке сворачиваемая шторка
// сохраняет переключатель режимов даже в свёрнутом виде.
// sketch=true оборачивает контент в SketchCard (dev-переключатель ?sketch=1 на /map).
import { RoutePanel } from "@/components/ui/RoutePanel";
import { SketchCard } from "@/components/ui/SketchCard";
import { WalkModeSwitcher } from "@/components/features/walk-mode/WalkModeSwitcher";
import { QuickWalkContent } from "./QuickWalkContent";

export function QuickWalkPanel({
  isNavigationOpen = false,
  sketch = false,
  mode = "quick",
}: {
  isNavigationOpen?: boolean;
  sketch?: boolean;
  mode?: "quick" | "sightseeing";
}) {
  const body = <QuickWalkContent mode={mode} />;

  return (
    <RoutePanel
      isNavigationOpen={isNavigationOpen}
      header={<WalkModeSwitcher className="w-full" />}
    >
      {sketch ? <SketchCard sketch className="p-4">{body}</SketchCard> : body}
    </RoutePanel>
  );
}
