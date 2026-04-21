"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter, usePathname } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Dropdown, DropdownOption } from "@/components/ui/Dropdown";
import { Button } from "@/components/ui/Button";
import { cn } from "@/utils/cn";
import { updateDistanceUnitAction, updateMapLocaleAction } from "@/actions/profile";
import { useToast } from "@/contexts/ToastContext";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

interface PreferencesSettingsProps {
  currentLocale: "ru" | "en";
  distanceUnit?: "km" | "mi";
  useCustomMapLocale?: boolean;
  mapLocale?: "ru" | "en";
}

export const PreferencesSettings = ({
  currentLocale,
  distanceUnit = "km",
  useCustomMapLocale = false,
  mapLocale
}: PreferencesSettingsProps) => {
  const t = useTranslations("Profile");
  const router = useRouter();
  const pathname = usePathname();
  const { showToast } = useToast();

  const [selectedUnit, setSelectedUnit] = useState<"km" | "mi">(distanceUnit);
  const [isUpdatingUnit, setIsUpdatingUnit] = useState(false);

  const [useCustomMap, setUseCustomMap] = useState(useCustomMapLocale);
  const [selectedMapLocale, setSelectedMapLocale] = useState<"ru" | "en">(mapLocale || currentLocale);
  const [isUpdatingMapLocale, setIsUpdatingMapLocale] = useState(false);

  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleLocaleChange = (newLocale: string) => {
    const newPathname = pathname.replace(`/${currentLocale}`, `/${newLocale}`);
    router.push(newPathname);
  };

  const handleUnitChange = async (newUnit: "km" | "mi") => {
    setSelectedUnit(newUnit);
    setIsUpdatingUnit(true);

    try {
      const result = await updateDistanceUnitAction(newUnit);
      if (result.success) {
        showToast(t("preferencesUpdated"), "success");
      } else {
        showToast(t("updateError"), "error");
      }
    } catch (error) {
      console.error("Error updating distance unit:", error);
      showToast(t("updateError"), "error");
    } finally {
      setIsUpdatingUnit(false);
    }
  };

  const handleCustomMapToggle = async (enabled: boolean) => {
    setUseCustomMap(enabled);
    setIsUpdatingMapLocale(true);

    try {
      const result = await updateMapLocaleAction(enabled, enabled ? selectedMapLocale : undefined);
      if (result.success) {
        showToast(t("preferencesUpdated"), "success");
      } else {
        showToast(t("updateError"), "error");
      }
    } catch (error) {
      console.error("Error updating map locale:", error);
      showToast(t("updateError"), "error");
    } finally {
      setIsUpdatingMapLocale(false);
    }
  };

  const handleMapLocaleChange = async (newLocale: "ru" | "en") => {
    setSelectedMapLocale(newLocale);
    setIsUpdatingMapLocale(true);

    try {
      const result = await updateMapLocaleAction(true, newLocale);
      if (result.success) {
        showToast(t("preferencesUpdated"), "success");
      } else {
        showToast(t("updateError"), "error");
      }
    } catch (error) {
      console.error("Error updating map locale:", error);
      showToast(t("updateError"), "error");
    } finally {
      setIsUpdatingMapLocale(false);
    }
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut({ callbackUrl: `/${currentLocale}/signin` });
    } catch (error) {
      console.error("Error signing out:", error);
      showToast(t("signOutError"), "error");
      setIsSigningOut(false);
    }
  };

  const localeOptions: DropdownOption<"ru" | "en">[] = [
    { value: "ru", label: "Русский" },
    { value: "en", label: "English" },
  ];

  const unitOptions: DropdownOption<"km" | "mi">[] = [
    { value: "km", label: t("unitKm"), description: t("unitKmDesc") },
    { value: "mi", label: t("unitMi"), description: t("unitMiDesc") },
  ];

  return (
    <Card className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">{t("preferences")}</h2>
      </div>

      <div className="flex flex-col">
        {/* Настройка: Язык интерфейса */}
        <div className="flex items-center justify-between py-4 border-b border-slate-100 first:pt-0 last:border-0 last:pb-0">
          <div className="flex flex-col pr-4">
            <span className="text-sm font-medium text-slate-900">{t("language")}</span>
            <span className="text-xs text-slate-500 mt-0.5">{t("languageDesc")}</span>
          </div>
          <Dropdown
            options={localeOptions}
            value={currentLocale}
            onChange={handleLocaleChange}
            triggerClassName="min-w-[140px]"
          />
        </div>

        {/* Настройка: Язык карты */}
        <div className="flex flex-col py-4 border-b border-slate-100 first:pt-0 last:border-0 last:pb-0 gap-3">
          <div className="flex items-center justify-between">
            <div className="flex flex-col pr-4 flex-1">
              <span className="text-sm font-medium text-slate-900">{t("mapLanguage")}</span>
              <span className="text-xs text-slate-500 mt-0.5">{t("mapLanguageDesc")}</span>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useCustomMap}
                onChange={(e) => handleCustomMapToggle(e.target.checked)}
                disabled={isUpdatingMapLocale}
                className="w-4 h-4 text-brand-500 border-slate-300 rounded focus:ring-brand-500"
              />
              <span className="text-sm text-slate-700">{t("customMapLanguage")}</span>
            </label>
          </div>
          {useCustomMap && (
            <div className="flex justify-end">
              <Dropdown
                options={localeOptions}
                value={selectedMapLocale}
                onChange={handleMapLocaleChange}
                triggerClassName="min-w-[140px]"
              />
            </div>
          )}
        </div>

        {/* Настройка: Единицы измерения */}
        <div className="flex items-center justify-between py-4 border-b border-slate-100 first:pt-0 last:border-0 last:pb-0">
          <div className="flex flex-col pr-4">
            <span className="text-sm font-medium text-slate-900">{t("distanceUnit")}</span>
            <span className="text-xs text-slate-500 mt-0.5">{t("distanceUnitDesc")}</span>
          </div>
          <Dropdown
            options={unitOptions}
            value={selectedUnit}
            onChange={handleUnitChange}
            triggerClassName="min-w-[140px]"
          />
        </div>

        {/* Кнопка выхода */}
        <div className="pt-4">
          <Button
            variant="outline"
            size="md"
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="w-full flex items-center justify-center gap-2"
          >
            <LogOut size={18} />
            {isSigningOut ? t("signingOut") : t("signOut")}
          </Button>
        </div>
      </div>
    </Card>
  );
};