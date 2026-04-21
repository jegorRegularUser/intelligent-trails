"use client";

import { RouteFilters } from "@/types/history";
import { PLACE_CATEGORIES } from "@/constants/categories";
import { RoutingMode } from "@/types/map";
import { Footprints, Car, Bus } from "lucide-react";
import { useTranslations } from "next-intl";

interface RouteFiltersPanelProps {
  filters: RouteFilters;
  onChange: (filters: Partial<RouteFilters>) => void;
}

export function RouteFiltersPanel({ filters, onChange }: RouteFiltersPanelProps) {
  const t = useTranslations("History");

  const categoryOptions = Object.entries(PLACE_CATEGORIES).map(([key, cat]) => ({
    label: key,
    value: key,
    Icon: cat.icon,
  }));

  const transportOptions = [
    { label: "pedestrian", value: "pedestrian" as RoutingMode, Icon: Footprints },
    { label: "auto", value: "auto" as RoutingMode, Icon: Car },
    { label: "masstransit", value: "masstransit" as RoutingMode, Icon: Bus },
  ];

  const handleCategoryToggle = (category: string) => {
    const newCategories = filters.categories.includes(category)
      ? filters.categories.filter((c) => c !== category)
      : [...filters.categories, category];
    onChange({ categories: newCategories });
  };

  const handleTransportToggle = (mode: RoutingMode) => {
    const newModes = filters.transportModes.includes(mode)
      ? filters.transportModes.filter((m) => m !== mode)
      : [...filters.transportModes, mode];
    onChange({ transportModes: newModes });
  };

  return (
    <div className="space-y-4">
      {/* Категории */}
      <div>
        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">
          {t("filterCategories")}
        </label>
        <div className="flex flex-wrap gap-2">
          {categoryOptions.map((opt) => {
            const Icon = opt.Icon;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleCategoryToggle(opt.value)}
                className={`px-3 py-2 rounded-full text-sm font-medium transition-all border-2 flex items-center gap-2 ${
                  filters.categories.includes(opt.value)
                    ? "bg-brand-500 border-brand-500 text-white shadow-md"
                    : "bg-white border-slate-200 text-slate-600 hover:border-brand-300"
                }`}
              >
                <Icon size={16} />
              </button>
            );
          })}
        </div>
      </div>

      {/* Транспорт */}
      <div>
        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">
          {t("filterTransport")}
        </label>
        <div className="flex flex-wrap gap-2">
          {transportOptions.map((opt) => {
            const Icon = opt.Icon;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleTransportToggle(opt.value)}
                className={`px-3 py-2 rounded-full text-sm font-medium transition-all border-2 flex items-center gap-2 ${
                  filters.transportModes.includes(opt.value)
                    ? "bg-slate-800 border-slate-800 text-white shadow-md"
                    : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                <Icon size={16} />
              </button>
            );
          })}
        </div>
      </div>

      {/* Избранное */}
      <div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.showFavorites}
            onChange={(e) => onChange({ showFavorites: e.target.checked })}
            className="w-4 h-4 rounded border-slate-300 text-brand-500 focus:ring-brand-500"
          />
          <span className="text-sm font-medium text-slate-700">
            {t("filterFavorites")}
          </span>
        </label>
      </div>
    </div>
  );
}
