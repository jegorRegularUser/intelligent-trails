"use client";

import { RoutingMode } from "@/types/map";
import { formatDistance, formatDuration } from "@/utils/format";
import { Car, Footprints, Bike, Bus } from "lucide-react";
import { usePreferences } from "@/contexts/PreferencesContext";
import { useTranslations } from "next-intl";

interface TransportMetricsProps {
  byTransport: {
    pedestrian?: { distance: number; duration: number };
    bicycle?: { distance: number; duration: number };
    auto?: { distance: number; duration: number };
    masstransit?: { distance: number; duration: number };
  };
}

export function TransportMetrics({ byTransport }: TransportMetricsProps) {
  const { distanceUnit, locale } = usePreferences();
  const t = useTranslations("History");
  const modes = Object.entries(byTransport).filter(([_, metrics]) => metrics.distance > 0 || metrics.duration > 0);

  if (modes.length === 0) {
    return null;
  }

  const TRANSPORT_CONFIG: Record<RoutingMode, { icon: any; labelKey: string; color: string }> = {
    pedestrian: { icon: Footprints, labelKey: "transportPedestrian", color: "text-green-600" },
    bicycle: { icon: Bike, labelKey: "transportBicycle", color: "text-blue-600" },
    auto: { icon: Car, labelKey: "transportAuto", color: "text-orange-600" },
    masstransit: { icon: Bus, labelKey: "transportMasstransit", color: "text-purple-600" },
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-slate-600">{t("byTransport")}</p>
      <div className="space-y-1.5">
        {modes.map(([mode, metrics]) => {
          const config = TRANSPORT_CONFIG[mode as RoutingMode];
          if (!config) return null;

          const Icon = config.icon;

          return (
            <div key={mode} className="flex items-center gap-2 text-xs">
              <Icon size={14} className={config.color} />
              <span className="text-slate-600 min-w-[60px]">{t(config.labelKey)}:</span>
              <span className="font-medium text-slate-700">
                {formatDistance(metrics.distance, locale, distanceUnit)}
              </span>
              <span className="text-slate-400">•</span>
              <span className="font-medium text-slate-700">
                {formatDuration(metrics.duration)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
