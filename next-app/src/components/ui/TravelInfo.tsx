// src/components/ui/TravelInfo.tsx
import { Footprints, Car, Bus, Bike } from "lucide-react";
import { RoutingMode } from "@/types/map";
import { formatDistance, formatDuration } from "@/utils/format";

interface TravelInfoProps {
  mode: RoutingMode;
  distance?: number;
  duration?: number;
}

export function TravelInfo({ mode, distance, duration }: TravelInfoProps) {
  if (!distance && !duration) return null;

  const icons = {
    pedestrian: <Footprints size={14} />,
    auto: <Car size={14} />,
    masstransit: <Bus size={14} />,
    bicycle: <Bike size={14} />,
  };

  return (
    <div className="flex items-center gap-3 text-xs font-bold text-slate-400 my-3 ml-10">
      <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-100 px-2 py-1 rounded-lg">
        <span className="text-slate-400">{icons[mode]}</span>
        {distance ? <span>{formatDistance(distance)}</span> : null}
      </div>
      {duration ? (
        <span className="text-slate-500 bg-white px-2 py-1">
          {formatDuration(duration)}
        </span>
      ) : null}
    </div>
  );
}