// src/i18n.ts
import { notFound } from 'next/navigation';
import { getRequestConfig } from 'next-intl/server';

export const locales = ['ru', 'en'];

// Теперь next-intl передает requestLocale, который является Promise!
export default getRequestConfig(async ({ requestLocale }) => {
  // 1. Обязательно "распаковываем" Promise
  const locale = await requestLocale;

  // 2. Проверяем валидность языка
  if (!locale || !locales.includes(locale as any)) {
    notFound();
  }

  // 3. Возвращаем правильный объект
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default
  };
});