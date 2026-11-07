// src/i18n.ts
// Локаль НЕ живёт в URL: URL маршрута должен быть каноничным для шеринга
// ("/map?r=..."), а язык читается из cookie + Accept-Language при первом визите.
// Cookie ставит proxy.ts (сервер, первый визит) и PreferencesSettings (свитчер).
import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { LOCALE_COOKIE, defaultLocale, isLocale, pickLocaleFromAcceptLanguage, type Locale } from '@/lib/locale';

export { locales, defaultLocale, LOCALE_COOKIE, isLocale, pickLocaleFromAcceptLanguage } from '@/lib/locale';
export type { Locale } from '@/lib/locale';

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;

  let locale: Locale;
  if (isLocale(cookieLocale)) {
    locale = cookieLocale;
  } else {
    // Первый визит без cookie — смотрим на язык браузера (без редиректов)
    const headerStore = await headers();
    locale = pickLocaleFromAcceptLanguage(headerStore.get('accept-language') ?? '');
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default
  };
});
