"use client";

import { SavedRoute } from "@/types/history";
import { RouteCard } from "./RouteCard";
import { useTranslations } from "next-intl";

interface RecentRoutesCarouselProps {
  routes: SavedRoute[];
  onToggleFavorite: (id: string) => void;
  onRename: (id: string, newName: string) => void;
  onDelete: (id: string) => void;
  onShare: (id: string) => void;
}

export function RecentRoutesCarousel({
  routes,
  onToggleFavorite,
  onRename,
  onDelete,
  onShare,
}: RecentRoutesCarouselProps) {
  const t = useTranslations("History");

  if (routes.length === 0) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-slate-800">{t("recentRoutes")}</h2>
      <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide">
        {routes.map((route) => (
          <div key={route.id} className="min-w-[280px] snap-start">
            <RouteCard
              route={route}
              onToggleFavorite={onToggleFavorite}
              onRename={onRename}
              onDelete={onDelete}
              onShare={onShare}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
