"use client";

// Режим «Быстрая прогулка» единой панели «План прогулки»:
// тот же RoutePanel-шелл, что и у эксперт-маршрута. Свитчер живёт в шапке
// панели — один заголовок вместо двух, а на мобилке сворачиваемая шторка
// сохраняет переключатель режимов даже в свёрнутом виде.
// sketch=true оборачивает контент в SketchCard (dev-переключатель ?sketch=1 на /map).
//
// Машина фаз живёт здесь (docs/ux-human-wave.md M3): shell обязан знать высоту
// шторки на фазу (45/60/85dvh), а контент получает [machine, dispatch] без
// изменений своей логики.
import { useReducer } from "react";
import { RoutePanel } from "@/components/ui/RoutePanel";
import { SketchCard } from "@/components/ui/SketchCard";
import { WalkModeSwitcher } from "@/components/features/walk-mode/WalkModeSwitcher";
import { QuickWalkContent } from "./QuickWalkContent";
import { walkMachine, INITIAL_WALK_STATE } from "@/components/walk/logic";

export function QuickWalkPanel({
  isNavigationOpen = false,
  sketch = false,
  mode = "quick",
}: {
  isNavigationOpen?: boolean;
  sketch?: boolean;
  mode?: "quick" | "sightseeing";
}) {
  const [machine, dispatch] = useReducer(walkMachine, INITIAL_WALK_STATE);
  const body = <QuickWalkContent mode={mode} machine={machine} dispatch={dispatch} />;
  // offline не входит в таблицу высот: шторка живёт высотой resume-фазы
  // (замороженный контент остаётся читаемым — docs/ux-main-screen.md §4.6).
  const panelPhase = machine.phase === "offline" ? (machine.resumePhase ?? "idle") : machine.phase;

  return (
    <RoutePanel
      isNavigationOpen={isNavigationOpen}
      phase={panelPhase}
      header={<WalkModeSwitcher className="w-full" />}
    >
      {sketch ? <SketchCard sketch className="p-4">{body}</SketchCard> : body}
    </RoutePanel>
  );
}
