"use client";

import { TransportAlternative } from "@/types/map";
import { Bus, Train, TramFront, Footprints } from "lucide-react";
import { cn } from "@/utils/cn";
import { useTranslations } from "next-intl";

interface TransportAlternativesSelectProps {
  alternatives: TransportAlternative[];
}

export function TransportAlternativesSelect({
  alternatives,
}: TransportAlternativesSelectProps) {
  const t = useTranslations("TransportAlternatives");

  if (!alternatives || alternatives.length <= 1) return null;

  const getTransportIcon = (type: string) => {
    switch (type) {
      case "bus":
        return <Bus size={14} />;
      case "tram":
      case "tramway":
        return <TramFront size={14} />;
      case "metro":
      case "subway":
        return <Train size={14} />;
      default:
        return <Bus size={14} />;
    }
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.round(seconds / 60);
    return t("minutes", { count: minutes });
  };

  const getAlternativeLabel = (alt: TransportAlternative) => {
    const hasTransport = alt.transports && alt.transports.length > 0;

    if (!hasTransport) {
      return {
        icon: <Footprints size={14} />,
        text: t("walk"),
        detail: formatDuration(alt.duration),
      };
    }

    // Группируем транспорт по типам
    const transportsByType = alt.transports.reduce((acc, t) => {
      if (!acc[t.type]) acc[t.type] = [];
      acc[t.type].push(t.name);
      return acc;
    }, {} as Record<string, string[]>);

    const types = Object.keys(transportsByType);

    // Если несколько типов транспорта, показываем все
    if (types.length > 1) {
      const parts: string[] = [];

      types.forEach(type => {
        const uniqueNames = [...new Set(transportsByType[type])];
        const typeLabel =
          type === "bus" ? t("bus") :
          type === "tram" || type === "tramway" ? t("tram") :
          type === "metro" || type === "subway" ? t("metro") :
          type === "trolleybus" ? "Троллейбус" :
          t("transport");

        if (uniqueNames.length <= 2) {
          parts.push(`${typeLabel} ${uniqueNames.join(", ")}`);
        } else {
          parts.push(`${typeLabel} ${uniqueNames.slice(0, 2).join(", ")}...`);
        }
      });

      return {
        icon: getTransportIcon(types[0]),
        text: parts.join(" + "),
        detail: formatDuration(alt.duration),
      };
    }

    // Если один тип транспорта
    const firstType = types[0];
    const icon = getTransportIcon(firstType);
    const uniqueNames = [...new Set(transportsByType[firstType])];

    const typeLabel =
      firstType === "bus" ? t("bus") :
      firstType === "tram" || firstType === "tramway" ? t("tram") :
      firstType === "metro" || firstType === "subway" ? t("metro") :
      firstType === "trolleybus" ? "Троллейбус" :
      t("transport");

    if (uniqueNames.length <= 3) {
      return {
        icon,
        text: `${typeLabel} ${uniqueNames.join(", ")}`,
        detail: formatDuration(alt.duration),
      };
    } else {
      return {
        icon,
        text: `${typeLabel} ${uniqueNames.slice(0, 2).join(", ")}...`,
        detail: formatDuration(alt.duration),
      };
    }
  };

  return (
    <div className="flex flex-col gap-2 mt-2">
      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
        {t("routeOptions")} · {t("infoOnly")}
      </span>
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
        {alternatives.map((alt, index) => {
          const label = getAlternativeLabel(alt);

          return (
            <div
              key={index}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-slate-200 bg-white text-slate-600 shrink-0"
            >
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-slate-500">
                {label.icon}
              </div>
              <div className="flex flex-col items-start">
                <span className="text-xs font-semibold whitespace-nowrap">
                  {label.text}
                </span>
                <span className="text-[10px] text-slate-400 font-medium">
                  {label.detail}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
