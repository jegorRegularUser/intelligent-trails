// Чистые утилиты локали без серверных импортов:
// используются и в proxy.ts (edge), и в i18n.ts (RSC), и на клиенте.
export const locales = ['ru', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'ru';
export const LOCALE_COOKIE = 'it_locale';

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}

/** Разбор Accept-Language: первый поддерживаемый код языка по убыванию q. */
export function pickLocaleFromAcceptLanguage(acceptLanguage: string): Locale {
  const entries = acceptLanguage
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.find((p) => p.trim().startsWith('q='));
      return { tag: tag.trim().toLowerCase(), q: q ? parseFloat(q.split('=')[1]) || 0 : 1 };
    })
    .sort((a, b) => b.q - a.q);

  for (const { tag } of entries) {
    const base = tag.split('-')[0];
    if (isLocale(base)) return base;
  }
  return defaultLocale;
}
