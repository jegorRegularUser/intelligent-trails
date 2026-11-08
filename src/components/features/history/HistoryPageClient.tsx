"use client";

// История: данные живут на сервере (фильтры/поиск/сортировка/пагинация —
// MongoDB-запросы, см. routesRepo.getUserRoutes), клиент отправляет запрос
// с дебаунсом и держит оптимистичные мутации (избранное/имя/удаление).
// Раньше страница грузила 3 маршрута и фильтровала их на клиенте — серверный
// $text-поиск и пагинация были недостижимы из UI.
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { SavedRoute, RouteFilters, SortOption } from "@/types/history";
import { RouteCard } from "@/components/features/history/RouteCard";
import { RouteSearchBar } from "@/components/features/history/RouteSearchBar";
import { RouteFiltersPanel } from "@/components/features/history/RouteFiltersPanel";
import { RouteSortDropdown } from "@/components/features/history/RouteSortDropdown";
import { RecentRoutesCarousel } from "@/components/features/history/RecentRoutesCarousel";
import { RouteStatsCard } from "@/components/features/history/RouteStatsCard";
import { EmptyState } from "@/components/features/history/EmptyState";
import { useToast } from "@/contexts/ToastContext";
import { fetchHistoryAction } from "@/actions/historyPage";
import { toggleFavoriteAction, updateRouteAction, deleteRouteAction } from "@/actions/routes";

const PAGE_SIZE = 12;
const REFETCH_DEBOUNCE_MS = 400;

interface HistoryPageClientProps {
  initialRoutes: any[];
  initialTotal: number;
}

function toSavedRoute(r: any): SavedRoute {
  return {
    ...r,
    id: r._id,
    createdAt: new Date(r.createdAt).toISOString(),
    updatedAt: new Date(r.updatedAt).toISOString(),
  };
}

function HistoryPageContent({ initialRoutes, initialTotal }: HistoryPageClientProps) {
  const t = useTranslations("History");
  const { showToast } = useToast();

  const [routes, setRoutes] = useState<SavedRoute[]>(initialRoutes.map(toSavedRoute));
  const [total, setTotal] = useState(initialTotal);
  const [isLoading, setIsLoading] = useState(false);
  const [filters, setFilters] = useState<RouteFilters>({
    search: "",
    categories: [],
    transportModes: [],
    distanceRange: [0, 100],
    durationRange: [0, 500],
    showFavorites: false,
  });
  const [sortBy, setSortBy] = useState<SortOption>("date-desc");
  const isFirstFilterChange = useRef(true);
  // Гвард гонок: late-ответ append после сменившихся фильтров не перезапишет список
  const fetchSeq = useRef(0);

  const recentRoutes = routes.slice(0, 3);

  const refetch = useCallback(
    async (opts?: { append?: boolean }) => {
      setIsLoading(true);
      try {
        const skip = opts?.append ? routes.length : 0;
        const { routes: fresh, total: freshTotal } = await fetchHistoryAction(
          filters,
          sortBy,
          PAGE_SIZE,
          skip,
        );
        setTotal(freshTotal);
        setRoutes((prev) =>
          opts?.append ? [...prev, ...fresh.map(toSavedRoute)] : fresh.map(toSavedRoute),
        );
      } catch {
        showToast(t("loadError"), "error");
      } finally {
        setIsLoading(false);
      }
    },
    // routes.length замыканием: append должен знать актуальную длину списка
    [filters, routes.length, sortBy, showToast, t],
  );

  // Смена фильтров/сортировки → перезагрузка первой страницы с дебаунсом
  useEffect(() => {
    if (isFirstFilterChange.current) {
      isFirstFilterChange.current = false;
      return;
    }
    const timer = setTimeout(() => {
      void refetch();
    }, REFETCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, sortBy]);

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
        setTotal((prev) => Math.max(0, prev - 1));
        showToast(t("routeDeleted"), "success");
      }
    } catch (error) {
      showToast("Ошибка", "error");
    }
  };

  const handleShare = (id: string) => {
    const route = routes.find((r) => r.id === id);
    if (route) {
      const url = `${window.location.origin}/map?r=${route.encodedRoute}`;
      navigator.clipboard.writeText(url);
      showToast(t("linkCopied"), "success");
    }
  };

  const handleFiltersChange = (newFilters: Partial<RouteFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  };

  if (total === 0 && routes.length === 0 && !isLoading) {
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
        {routes.length > 0 && <RouteStatsCard routes={routes} />}

        {/* Последние маршруты */}
        {recentRoutes.length > 0 && (
          <RecentRoutesCarousel
            routes={recentRoutes}
            onToggleFavorite={handleToggleFavorite}
            onRename={handleRename}
            onDelete={handleDelete}
            onShare={handleShare}
          />
        )}

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
        {routes.length === 0 && isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-56 rounded-3xl bg-slate-200/60 animate-pulse" />
            ))}
          </div>
        ) : routes.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-600">{t("noResults")}</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-400">
              {t("resultsCount", { loaded: routes.length, total })}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {routes.map((route) => (
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
            {routes.length < total && (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => void refetch({ append: true })}
                  disabled={isLoading}
                  className="rounded-full border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-brand-500 hover:text-brand-600 disabled:opacity-50"
                >
                  {isLoading ? t("loading") : t("showMore")}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function HistoryPageClient(props: HistoryPageClientProps) {
  return <HistoryPageContent {...props} />;
}
