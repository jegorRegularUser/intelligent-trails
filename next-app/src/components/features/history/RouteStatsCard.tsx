"use client";

import { SavedRoute } from "@/types/history";
import { PLACE_CATEGORIES } from "@/constants/categories";
import { MapPin, Clock, Route } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatDistance } from "@/utils/format";
import { usePreferences } from "@/contexts/PreferencesContext";

interface RouteStatsCardProps {
  routes: SavedRoute[];
}

export function RouteStatsCard({ routes }: RouteStatsCardProps) {
  const t = useTranslations("History");
  const { distanceUnit, locale } = usePreferences();

  const totalRoutes = routes.length;
  const totalDistance = routes.reduce((sum, r) => sum + r.metrics.totalDistance, 0);
  const totalDuration = routes.reduce((sum, r) => sum + r.metrics.totalDuration, 0);

  // Подсчет самых популярных категорий
  const categoryCounts: Record<string, number> = {};
  routes.forEach((route) => {
    route.categories.forEach((cat) => {
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });
  });

  const topCategories = Object.entries(categoryCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([cat]) => cat);

  return (
    <div className="bg-gradient-to-br from-brand-50 to-blue-50 rounded-3xl p-4 sm:p-6 border border-slate-200">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        {/* Статистика */}
        <div className="flex flex-wrap gap-4 sm:gap-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 bg-white rounded-xl shrink-0">
              <Route size={20} className="text-brand-500" />
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-bold text-slate-800">{totalRoutes}</div>
              <div className="text-xs text-slate-600">{t("totalRoutes")}</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 bg-white rounded-xl shrink-0">
              <MapPin size={20} className="text-blue-500" />
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-bold text-slate-800">{formatDistance(totalDistance, locale, distanceUnit)}</div>
              <div className="text-xs text-slate-600">{t("totalDistance")}</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 bg-white rounded-xl shrink-0">
              <Clock size={20} className="text-purple-500" />
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-bold text-slate-800">{Math.round(totalDuration / 60)}ч</div>
              <div className="text-xs text-slate-600">{t("totalTime")}</div>
            </div>
          </div>
        </div>

        {/* Любимые категории */}
        {topCategories.length > 0 && (
          <div className="flex items-center gap-2">
            {topCategories.map((cat) => {
              const category = PLACE_CATEGORIES[cat as keyof typeof PLACE_CATEGORIES];
              const Icon = category?.icon;
              return category && Icon ? (
                <div
                  key={cat}
                  className="flex items-center gap-2 px-3 py-2 bg-white rounded-xl"
                >
                  <Icon size={16} className="text-brand-500" />
                  <span className="text-sm font-bold text-slate-700">
                    {categoryCounts[cat]}
                  </span>
                </div>
              ) : null;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
