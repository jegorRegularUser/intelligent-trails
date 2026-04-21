// src/components/ui/TravelInfo.tsx
"use client";

import { Footprints, Car, Bus, Bike } from "lucide-react";
import { RoutingMode, TransportAlternative } from "@/types/map";
import { formatDistance, formatDuration } from "@/utils/format";
import { TransportAlternativesSelect } from "./TransportAlternativesSelect";
import { usePreferences } from "@/contexts/PreferencesContext";

interface TravelInfoProps {
  mode: RoutingMode;
  distance?: number;
  duration?: number;
  transportAlternatives?: TransportAlternative[];
}

export function TravelInfo({
  mode,
  distance,
  duration,
  transportAlternatives,
}: TravelInfoProps) {
  const { distanceUnit, locale } = usePreferences();

  if (!distance && !duration) return null;

  const icons = {
    pedestrian: <Footprints size={14} />,
    auto: <Car size={14} />,
    masstransit: <Bus size={14} />,
    bicycle: <Bike size={14} />,
  };

  const showAlternatives = mode === 'masstransit' &&
    transportAlternatives &&
    transportAlternatives.length > 1;

  return (
    <div className="flex flex-col gap-1.5 my-3 ml-4">
      <div className="flex items-center gap-3 text-xs font-bold text-slate-400">
        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-100 px-2 py-1 rounded-lg">
          <span className="text-slate-400">{icons[mode]}</span>
          {distance ? <span>{formatDistance(distance, locale, distanceUnit)}</span> : null}
        </div>
        {duration ? (
          <span className="text-slate-500 bg-white px-2 py-1">
            {formatDuration(duration)}
          </span>
        ) : null}
      </div>

      {/* Показываем селектор альтернатив только для общественного транспорта */}
      {showAlternatives && (
        <TransportAlternativesSelect alternatives={transportAlternatives} />
      )}
    </div>
  );
}