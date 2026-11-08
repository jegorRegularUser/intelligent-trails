"use client";

// Переключатель языка: локаль живёт в cookie (не в URL), смена через server
// action + router.refresh(). Стиль — часть навигации: текстовые RU/EN без
// плашки, высота строки совпадает со ссылками меню.
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
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
      className={cn("flex items-center gap-1", className)}
    >
      {(["ru", "en"] as const).map((code, index) => (
        <span key={code} className="flex items-center">
          {index > 0 && <span className="mx-1 text-slate-300 select-none" aria-hidden>/</span>}
          <button
            type="button"
            aria-pressed={locale === code}
            onClick={() => switchTo(code)}
            className={cn(
              "px-0.5 py-1 text-sm font-medium uppercase tracking-wide transition-colors",
              locale === code
                ? "text-brand-600 font-bold"
                : "text-slate-500 hover:text-slate-800",
            )}
          >
            {code}
          </button>
        </span>
      ))}
    </div>
  );
}
