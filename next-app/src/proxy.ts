import createMiddleware from 'next-intl/middleware';
import { locales } from './i18n';

const intlProxy = createMiddleware({
  locales,
  defaultLocale: 'ru',
});

export { intlProxy as proxy };

export const config = {
  matcher: ['/', '/(ru|en)/:path*', '/((?!api|_next|_vercel|.*\\..*).*)']
};