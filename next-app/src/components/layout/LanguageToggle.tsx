"use client";

// Переключатель языка: локаль живёт в cookie (не в URL, ADR интеграции локали),
// смена = cookie + router.refresh(). Подписи RU/EN самоназванные — i18n не нужен.
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { setLocaleAction } from "@/actions/locale";
import { cn } from "@/utils/cn";

export function LanguageToggle({ className }: { className?: string }) {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations("Navigation");

  const switchTo = (next: "ru" | "en") => {
    if (next === locale) return;
    void setLocaleAction(next).then(() => router.refresh());
  };

  return (
    <div
      role="group"
      aria-label={t("language")}
      className={cn("flex items-center gap-0.5 rounded-full border border-slate-200 p-0.5", className)}
    >
      <Languages size={13} className="ml-1.5 text-slate-400" aria-hidden />
      {(["ru", "en"] as const).map((code) => (
        <button
          key={code}
          type="button"
          aria-pressed={locale === code}
          onClick={() => switchTo(code)}
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-bold uppercase transition-colors",
            locale === code ? "bg-brand-500 text-white" : "text-slate-500 hover:text-slate-700",
          )}
        >
          {code}
        </button>
      ))}
    </div>
  );
}
