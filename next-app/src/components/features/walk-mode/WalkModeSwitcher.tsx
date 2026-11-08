"use client";

// Свитчер режимов единой панели «План прогулки»: быстрый старт ↔ эксперт-маршрут.
// Один shell, общие компоненты — переключается только контент (useRouteStore.walkMode).
import { useTranslations } from "next-intl";
import { Footprints, Navigation } from "lucide-react";
import { useRouteStore } from "@/store/useRouteStore";
import { cn } from "@/utils/cn";

export function WalkModeSwitcher({ className }: { className?: string }) {
  const t = useTranslations("WalkUI");
  const { walkMode, setWalkMode } = useRouteStore();

  const tabs = [
    { id: "quick" as const, label: t("modeQuick"), icon: Footprints },
    { id: "route" as const, label: t("modeRoute"), icon: Navigation },
  ];

  return (
    <div
      role="tablist"
      aria-label={t("screenTitle")}
      className={cn("grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1", className)}
    >
      {tabs.map(({ id, label, icon: Icon }) => {
        const active = walkMode === id;
        return (
          <button
            key={id}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => setWalkMode(id)}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition-all",
              active
                ? "bg-white text-brand-600 shadow-sm"
                : "text-slate-500 hover:text-slate-700",
            )}
          >
            <Icon size={15} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
