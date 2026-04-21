"use client";

import { useState, useMemo } from "react";
import { SavedRoute, RouteFilters, SortOption } from "@/types/history";
import { RouteCard } from "@/components/features/history/RouteCard";
import { RouteSearchBar } from "@/components/features/history/RouteSearchBar";
import { RouteFiltersPanel } from "@/components/features/history/RouteFiltersPanel";
import { RouteSortDropdown } from "@/components/features/history/RouteSortDropdown";
import { RecentRoutesCarousel } from "@/components/features/history/RecentRoutesCarousel";
import { RouteStatsCard } from "@/components/features/history/RouteStatsCard";
import { EmptyState } from "@/components/features/history/EmptyState";
import { ToastProvider, useToast } from "@/contexts/ToastContext";
import { useTranslations } from "next-intl";
import { toggleFavoriteAction, updateRouteAction, deleteRouteAction } from "@/actions/routes";

interface HistoryPageClientProps {
  initialRoutes: any[];
}

function HistoryPageContent({ initialRoutes }: HistoryPageClientProps) {
  const t = useTranslations("History");
  const { showToast } = useToast();

  const [routes, setRoutes] = useState<SavedRoute[]>(
    initialRoutes.map((r) => ({
      ...r,
      id: r._id,
      createdAt: new Date(r.createdAt).toISOString(),
      updatedAt: new Date(r.updatedAt).toISOString(),
    }))
  );

  const [filters, setFilters] = useState<RouteFilters>({
    search: "",
    categories: [],
    transportModes: [],
    distanceRange: [0, 100],
    durationRange: [0, 500],
    showFavorites: false,
  });
  const [sortBy, setSortBy] = useState<SortOption>("date-desc");

  // Фильтрация и сортировка
  const filteredAndSortedRoutes = useMemo(() => {
    let result = [...routes];

    // Поиск
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      result = result.filter((r) =>
        r.name.toLowerCase().includes(searchLower) ||
        r.tags.some((tag) => tag.toLowerCase().includes(searchLower))
      );
    }

    // Категории
    if (filters.categories.length > 0) {
      result = result.filter((r) =>
        filters.categories.some((cat) => r.categories.includes(cat))
      );
    }

    // Транспорт
    if (filters.transportModes.length > 0) {
      result = result.filter((r) =>
        filters.transportModes.some((mode) => r.transportModes.includes(mode))
      );
    }

    // Избранное
    if (filters.showFavorites) {
      result = result.filter((r) => r.isFavorite);
    }

    // Сортировка
    result.sort((a, b) => {
      switch (sortBy) {
        case "date-desc":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "date-asc":
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "name-asc":
          return a.name.localeCompare(b.name);
        case "name-desc":
          return b.name.localeCompare(a.name);
        case "distance-asc":
          return a.metrics.totalDistance - b.metrics.totalDistance;
        case "distance-desc":
          return b.metrics.totalDistance - a.metrics.totalDistance;
        case "duration-asc":
          return a.metrics.totalDuration - b.metrics.totalDuration;
        case "duration-desc":
          return b.metrics.totalDuration - a.metrics.totalDuration;
        default:
          return 0;
      }
    });

    return result;
  }, [routes, filters, sortBy]);

  const recentRoutes = useMemo(() => {
    return [...routes]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 3);
  }, [routes]);

  const handleToggleFavorite = async (id: string) => {
    try {
      const result = await toggleFavoriteAction(id);
      if (result.success) {
        setRoutes((prev) =>
          prev.map((r) => (r.id === id ? { ...r, isFavorite: result.isFavorite } : r))
        );
        showToast(t("favoriteToggled"), "success");
      }
    } catch (error) {
      showToast("Ошибка", "error");
    }
  };

  const handleRename = async (id: string, newName: string) => {
    try {
      const result = await updateRouteAction(id, { name: newName });
      if (result.success) {
        setRoutes((prev) =>
          prev.map((r) => (r.id === id ? { ...r, name: newName, updatedAt: new Date().toISOString() } : r))
        );
        showToast(t("routeRenamed"), "success");
      }
    } catch (error) {
      showToast("Ошибка", "error");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const result = await deleteRouteAction(id);
      if (result.success) {
        setRoutes((prev) => prev.filter((r) => r.id !== id));
        showToast(t("routeDeleted"), "success");
      }
    } catch (error) {
      showToast("Ошибка", "error");
    }
  };

  const handleShare = (id: string) => {
    const route = routes.find((r) => r.id === id);
    if (route) {
      const url = `${window.location.origin}/?r=${route.encodedRoute}`;
      navigator.clipboard.writeText(url);
      showToast(t("linkCopied"), "success");
    }
  };

  const handleFiltersChange = (newFilters: Partial<RouteFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  };

  if (routes.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 sm:p-8">
        <div className="max-w-7xl mx-auto">
          <EmptyState />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Заголовок */}
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">{t("title")}</h1>
          <p className="text-slate-600">{t("subtitle")}</p>
        </div>

        {/* Статистика */}
        <RouteStatsCard routes={routes} />

        {/* Последние маршруты */}
        <RecentRoutesCarousel
          routes={recentRoutes}
          onToggleFavorite={handleToggleFavorite}
          onRename={handleRename}
          onDelete={handleDelete}
          onShare={handleShare}
        />

        {/* Поиск и сортировка */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex-1 w-full sm:max-w-md">
            <RouteSearchBar
              value={filters.search}
              onChange={(value) => handleFiltersChange({ search: value })}
            />
          </div>
          <RouteSortDropdown value={sortBy} onChange={setSortBy} />
        </div>

        {/* Фильтры */}
        <RouteFiltersPanel filters={filters} onChange={handleFiltersChange} />

        {/* Список маршрутов */}
        {filteredAndSortedRoutes.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-600">{t("noResults")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredAndSortedRoutes.map((route) => (
              <RouteCard
                key={route.id}
                route={route}
                onToggleFavorite={handleToggleFavorite}
                onRename={handleRename}
                onDelete={handleDelete}
                onShare={handleShare}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function HistoryPageClient({ initialRoutes }: HistoryPageClientProps) {
  return (
    <ToastProvider>
      <HistoryPageContent initialRoutes={initialRoutes} />
    </ToastProvider>
  );
}
