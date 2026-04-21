"use client";

import { useTranslations } from "next-intl";
import { X, MapPin } from "lucide-react";
import { useRouteStore } from "@/store/useRouteStore";
import { Button } from "@/components/ui/Button";
import { useState, useEffect } from "react";

export function MapPickerOverlay() {
  const t = useTranslations("BuilderSidebar");
  const { isMapPickerActive, setMapPickerActive } = useRouteStore();
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!isMapPickerActive) return;

    const handleMouseMove = (e: MouseEvent) => {
      setCursorPos({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [isMapPickerActive]);

  if (!isMapPickerActive) return null;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      {/* Инструкция сверху */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 pointer-events-auto">
        <div className="bg-white rounded-2xl shadow-2xl px-6 py-4 flex items-center gap-3 border-2 border-brand-500 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="p-2 bg-brand-100 rounded-xl text-brand-600">
            <MapPin size={24} />
          </div>
          <div>
            <h3 className="font-bold text-slate-800">{t("mapPickerTitle")}</h3>
            <p className="text-sm text-slate-500">{t("mapPickerInstruction")}</p>
          </div>
        </div>
      </div>

      {/* Кнопка отмены */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-auto">
        <Button
          variant="outline"
          size="lg"
          onClick={() => setMapPickerActive(false)}
          leftIcon={<X size={20} />}
          className="bg-white shadow-2xl border-2"
        >
          {t("mapPickerCancel")}
        </Button>
      </div>

      {/* Маркер, следующий за курсором */}
      <div
        className="absolute pointer-events-none transition-opacity duration-200"
        style={{
          left: cursorPos.x,
          top: cursorPos.y,
          transform: 'translate(-50%, -100%)'
        }}
      >
        <div className="relative">
          {/* Тень маркера */}
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3 h-1 bg-black/20 rounded-full blur-sm" />
          {/* Сам маркер */}
          <div className="relative">
            <MapPin size={32} className="text-brand-500 opacity-70 drop-shadow-lg" fill="currentColor" />
          </div>
        </div>
      </div>
    </div>
  );
}
