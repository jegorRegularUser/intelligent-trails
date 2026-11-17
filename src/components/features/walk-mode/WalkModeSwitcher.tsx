"use client";

// Свитчер режимов единой панели «План прогулки»: быстрый старт ↔ эксперт-маршрут.
// Один shell, общие компоненты — переключается только контент (useRouteStore.walkMode).
// Ревизия 2026-11-18: вкладка «Новый город» убрана — её маршрут не отличался от
// быстрой прогулки; чужой район решается полем адреса старта (PRODUCT.md,
// «Два сценария входа»).
// Рядом — ссылка «Как это работает» (M2): главный экран отвечает на «что делать»,
// механику объясняет /about, который открылся после переезда лендинга.
import { useTranslations } from "next-intl";
import { BookOpen, Footprints, Navigation } from "lucide-react";
import Link from "next/link";
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
    <div className={cn("flex items-center gap-2", className)}>
      <div
        role="tablist"
        aria-label={t("screenTitle")}
        className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1 flex-1"
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

      <Link
        href="/about"
        aria-label={t("howItWorks")}
        title={t("howItWorks")}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-brand-50 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
      >
        <BookOpen size={17} />
      </Link>
    </div>
  );
}
