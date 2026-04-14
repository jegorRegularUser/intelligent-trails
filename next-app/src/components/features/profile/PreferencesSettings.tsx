import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/Card";
import { cn } from "@/utils/cn";

interface PreferencesSettingsProps {
  currentLocale: "ru" | "en";
}

export const PreferencesSettings = ({ currentLocale }: PreferencesSettingsProps) => {
  const t = useTranslations("Profile");

  return (
    <Card className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">{t("preferences")}</h2>
      </div>

      <div className="flex flex-col">
        {/* Настройка: Язык */}
        <div className="flex items-center justify-between py-4 border-b border-slate-100 first:pt-0 last:border-0 last:pb-0">
          <div className="flex flex-col pr-4">
            <span className="text-sm font-medium text-slate-900">{t("language")}</span>
            <span className="text-xs text-slate-500 mt-0.5">{t("languageDesc")}</span>
          </div>
          <select 
            defaultValue={currentLocale}
            className={cn(
              "h-10 px-3 pr-8 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 outline-none transition-colors",
              "focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 cursor-pointer appearance-none"
            )}
            // Иконку стрелочки можно добавить через фоновое изображение или кастомный враппер, 
            // но пока нативный select отлично справится с задачей-заглушкой
          >
            <option value="ru">Русский</option>
            <option value="en">English</option>
          </select>
        </div>

        {/* Настройка: Единицы измерения (заглушка на будущее) */}
        <div className="flex items-center justify-between py-4 border-b border-slate-100 first:pt-0 last:border-0 last:pb-0">
          <div className="flex flex-col pr-4">
            <span className="text-sm font-medium text-slate-900">{t("distanceUnit")}</span>
            <span className="text-xs text-slate-500 mt-0.5">{t("distanceUnitDesc")}</span>
          </div>
          <select 
            disabled
            className={cn(
              "h-10 px-3 pr-8 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none",
              "opacity-50 cursor-not-allowed appearance-none"
            )}
          >
            <option>Км</option>
            <option>Ми</option>
          </select>
        </div>
        
      </div>
    </Card>
  );
};