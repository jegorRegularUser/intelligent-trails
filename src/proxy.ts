// src/proxy.ts (middleware в Next 16)
// Раньше здесь жил next-intl-роутер с редиректами /ru, /en.
// Теперь локаль не в URL: единственная задача прокси — при первом визите
// запомнить язык браузера в cookie. Никаких редиректов, URL всегда каноничен.
import { NextRequest, NextResponse } from 'next/server';
import { LOCALE_COOKIE, pickLocaleFromAcceptLanguage } from '@/lib/locale';

export default function proxy(request: NextRequest) {
  const response = NextResponse.next();

  if (!request.cookies.get(LOCALE_COOKIE)?.value) {
    const acceptLanguage = request.headers.get('accept-language') ?? '';
    const locale = pickLocaleFromAcceptLanguage(acceptLanguage);
    // Не httpOnly: PreferencesSettings обновляет cookie на клиенте без захода на сервер
    response.cookies.set(LOCALE_COOKIE, locale, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    });
  }

  return response;
}

export const config = {
  matcher: ['/', '/((?!api|_next|_vercel|.*\\..*).*)']
};
