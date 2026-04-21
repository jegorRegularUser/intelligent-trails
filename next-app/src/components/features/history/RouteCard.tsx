"use client";

import { useState } from "react";
import { SavedRoute } from "@/types/history";
import { Card } from "@/components/ui/Card";
import { IconButton } from "@/components/ui/IconButton";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { RouteCardThumbnail } from "./RouteCardThumbnail";
import { TransportMetrics } from "./TransportMetrics";
import { PLACE_CATEGORIES } from "@/constants/categories";
import { Star, Pencil, Trash2, Share2, MapPin, Clock, Check, X } from "lucide-react";
import { cn } from "@/utils/cn";
import { formatDistance, formatDuration } from "@/utils/format";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useToast } from "@/contexts/ToastContext";
import { usePreferences } from "@/contexts/PreferencesContext";

interface RouteCardProps {
  route: SavedRoute;
  onToggleFavorite: (id: string) => void;
  onRename: (id: string, newName: string) => void;
  onDelete: (id: string) => void;
  onShare: (id: string) => void;
}

export function RouteCard({ route, onToggleFavorite, onRename, onDelete, onShare }: RouteCardProps) {
  const router = useRouter();
  const t = useTranslations("History");
  const { showToast } = useToast();
  const { distanceUnit, locale } = usePreferences();
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(route.name);

  const handleOpen = () => {
    router.push(`/?r=${route.encodedRoute}`);
  };

  const handleStartEdit = () => {
    setEditedName(route.name);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    if (editedName.trim()) {
      onRename(route.id, editedName.trim());
      setIsEditing(false);
    }
  };

  const handleCancelEdit = () => {
    setEditedName(route.name);
    setIsEditing(false);
  };

  const handleDelete = () => {
    onDelete(route.id);
  };

  const handleShare = () => {
    onShare(route.id);
  };

  return (
    <Card className="overflow-hidden p-0 hover:shadow-md transition-shadow">
      {/* Миниатюра */}
      <div className="relative">
        <RouteCardThumbnail route={route} className="h-32" />
        <IconButton
          icon={<Star size={18} className={route.isFavorite ? "fill-yellow-400 text-yellow-400" : ""} />}
          variant="ghost"
          size="sm"
          className="absolute top-2 right-2 bg-white/80 backdrop-blur-sm hover:bg-white"
          onClick={() => onToggleFavorite(route.id)}
        />
      </div>

      {/* Контент */}
      <div className="p-4 space-y-3">
        {/* Название и действия */}
        <div className="flex items-start justify-between gap-2">
          {isEditing ? (
            <div className="flex-1 flex items-center gap-2">
              <Input
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveEdit();
                  if (e.key === "Escape") handleCancelEdit();
                }}
                autoFocus
                className="flex-1"
              />
              <IconButton
                icon={<Check size={16} />}
                variant="primary"
                size="sm"
                onClick={handleSaveEdit}
              />
              <IconButton
                icon={<X size={16} />}
                variant="ghost"
                size="sm"
                onClick={handleCancelEdit}
              />
            </div>
          ) : (
            <>
              <h3 className="font-bold text-slate-800 leading-tight flex-1 line-clamp-2">
                {route.name}
              </h3>
              <div className="flex gap-1 shrink-0">
                <IconButton
                  icon={<Pencil size={16} />}
                  variant="ghost"
                  size="sm"
                  onClick={handleStartEdit}
                  title={t("rename")}
                />
                <IconButton
                  icon={<Share2 size={16} />}
                  variant="ghost"
                  size="sm"
                  onClick={handleShare}
                  title={t("share")}
                />
                <IconButton
                  icon={<Trash2 size={16} />}
                  variant="danger"
                  size="sm"
                  onClick={handleDelete}
                  title={t("delete")}
                />
              </div>
            </>
          )}
        </div>

        {/* Дата */}
        <p className="text-xs text-slate-500 flex items-center gap-1">
          <Clock size={12} />
          {new Date(route.createdAt).toLocaleDateString("ru-RU", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>

        {/* Начальная и конечная точки */}
        <div className="space-y-1.5">
          <div className="flex items-start gap-2">
            <div className="w-5 h-5 rounded-full bg-slate-500 flex items-center justify-center shrink-0 mt-0.5 border-2 border-white">
              <div className="w-1.5 h-1.5 rounded-full bg-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-700 truncate">
                {route.startPoint.type === "category" && route.startPoint.category && PLACE_CATEGORIES[route.startPoint.category as keyof typeof PLACE_CATEGORIES]
                  ? (() => {
                      const Icon = PLACE_CATEGORIES[route.startPoint.category as keyof typeof PLACE_CATEGORIES].icon;
                      return (
                        <span className="inline-flex items-center gap-1">
                          <Icon size={12} className="inline" />
                          {route.startPoint.value}
                        </span>
                      );
                    })()
                  : route.startPoint.value}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center shrink-0 mt-0.5 border-2 border-white">
              <div className="w-1.5 h-1.5 rounded-full bg-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-700 truncate">
                {route.endPoint.type === "category" && route.endPoint.category && PLACE_CATEGORIES[route.endPoint.category as keyof typeof PLACE_CATEGORIES]
                  ? (() => {
                      const Icon = PLACE_CATEGORIES[route.endPoint.category as keyof typeof PLACE_CATEGORIES].icon;
                      return (
                        <span className="inline-flex items-center gap-1">
                          <Icon size={12} className="inline" />
                          {route.endPoint.value}
                        </span>
                      );
                    })()
                  : route.endPoint.value}
              </p>
            </div>
          </div>
        </div>

        {/* Метрики */}
        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col items-center p-2 bg-slate-50 rounded-lg">
            <span className="text-xs text-slate-500 mb-1">{t("distance")}</span>
            <span className="text-sm font-bold text-slate-700">
              {formatDistance(route.metrics.totalDistance, locale, distanceUnit)}
            </span>
          </div>
          <div className="flex flex-col items-center p-2 bg-slate-50 rounded-lg">
            <span className="text-xs text-slate-500 mb-1">{t("duration")}</span>
            <span className="text-sm font-bold text-slate-700">
              {formatDuration(route.metrics.totalDuration)}
            </span>
          </div>
          <div className="flex flex-col items-center p-2 bg-slate-50 rounded-lg">
            <span className="text-xs text-slate-500 mb-1">{t("placesCount")}</span>
            <span className="text-sm font-bold text-slate-700">
              {route.metrics.placesCount}
            </span>
          </div>
        </div>

        {/* Метрики по транспорту */}
        {route.metrics.byTransport && Object.keys(route.metrics.byTransport).length > 0 && (
          <TransportMetrics byTransport={route.metrics.byTransport} />
        )}

        {/* Категории */}
        <div className="flex flex-wrap gap-2">
          {route.categories.map((cat) => {
            const category = PLACE_CATEGORIES[cat as keyof typeof PLACE_CATEGORIES];
            const Icon = category?.icon;
            return category && Icon ? (
              <div
                key={cat}
                className="flex items-center justify-center w-10 h-10 bg-brand-100 rounded-full text-brand-600"
              >
                <Icon size={18} />
              </div>
            ) : null;
          })}
        </div>

        {/* Кнопка открытия */}
        <Button
          variant="primary"
          size="md"
          className="w-full"
          onClick={handleOpen}
        >
          {t("openOnMap")}
        </Button>
      </div>
    </Card>
  );
}
