"use server";

// Смена локали: cookie ставится на сервере (обход react-hooks/immutability
// на document.cookie в клиентском коде), локаль в URL не живёт.
import { cookies } from 'next/headers';
import { LOCALE_COOKIE, isLocale } from '@/lib/locale';

export async function setLocaleAction(next: string): Promise<{ success: boolean }> {
  if (!isLocale(next)) return { success: false };
  const store = await cookies();
  store.set(LOCALE_COOKIE, next, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
  return { success: true };
}
