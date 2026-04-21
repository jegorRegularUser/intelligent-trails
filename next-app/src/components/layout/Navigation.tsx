'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Menu, X, Map, History, User, LogIn, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useNavigation } from '@/contexts/NavigationContext';

interface NavigationProps {
  locale: string;
  isAuthenticated?: boolean;
}

export function Navigation({ locale, isAuthenticated = false }: NavigationProps) {
  const t = useTranslations('Navigation');
  const { isMobileMenuOpen, setIsMobileMenuOpen } = useNavigation();

  const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);

  return (
    <>
      {/* Desktop Navigation - не sticky, не перекрывает контент */}
      <nav className="hidden md:block bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <Link
              href={`/${locale}`}
              className="flex items-center gap-3 text-2xl font-bold text-slate-900 hover:text-brand-600 transition-colors"
            >
              <Image src="/logo.png" alt="Intelligent Trails" width={32} height={32} className="w-8 h-8" />
              {t('logo')}
            </Link>

            <div className="flex items-center gap-6">
              <Link
                href={`/${locale}/map`}
                className="text-slate-700 hover:text-brand-600 font-medium transition-colors"
              >
                {t('map')}
              </Link>

              {isAuthenticated ? (
                <>
                  <Link
                    href={`/${locale}/history`}
                    className="text-slate-700 hover:text-brand-600 font-medium transition-colors"
                  >
                    {t('history')}
                  </Link>
                  <Link
                    href={`/${locale}/profile`}
                    className="text-slate-700 hover:text-brand-600 font-medium transition-colors"
                  >
                    {t('profile')}
                  </Link>
                </>
              ) : (
                <>
                  <Link href={`/${locale}/signin`}>
                    <Button variant="ghost" size="sm">
                      {t('signIn')}
                    </Button>
                  </Link>
                  <Link href={`/${locale}/signup`}>
                    <Button variant="primary" size="sm">
                      {t('signUp')}
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile - компактная кнопка бургера */}
      <button
        onClick={toggleMobileMenu}
        className="md:hidden fixed top-4 right-4 z-50 w-12 h-12 bg-brand-500 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-brand-600 transition-all active:scale-95"
        aria-label="Toggle menu"
      >
        {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Mobile Menu - полноэкранное с явными кнопками */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-white flex flex-col">
          {/* Хедер */}
          <div className="px-6 pt-20 pb-8 border-b border-slate-200">
            <div className="flex items-center gap-3">
              <Image src="/logo.png" alt="Intelligent Trails" width={32} height={32} className="w-8 h-8" />
              <h2 className="text-2xl font-bold text-slate-900">{t('logo')}</h2>
            </div>
          </div>

          {/* Навигационные ссылки */}
          <div className="flex-1 px-6 py-8 space-y-2 overflow-y-auto">
            <Link
              href={`/${locale}/map`}
              onClick={toggleMobileMenu}
              className="flex items-center justify-between px-4 py-4 rounded-2xl hover:bg-slate-50 active:bg-slate-100 transition-colors group"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center text-brand-600">
                  <Map size={20} />
                </div>
                <span className="text-lg font-medium text-slate-900">{t('map')}</span>
              </div>
              <ArrowRight size={20} className="text-slate-400 group-hover:text-brand-500 transition-colors" />
            </Link>

            {isAuthenticated ? (
              <>
                <Link
                  href={`/${locale}/history`}
                  onClick={toggleMobileMenu}
                  className="flex items-center justify-between px-4 py-4 rounded-2xl hover:bg-slate-50 active:bg-slate-100 transition-colors group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center text-brand-600">
                      <History size={20} />
                    </div>
                    <span className="text-lg font-medium text-slate-900">{t('history')}</span>
                  </div>
                  <ArrowRight size={20} className="text-slate-400 group-hover:text-brand-500 transition-colors" />
                </Link>
                <Link
                  href={`/${locale}/profile`}
                  onClick={toggleMobileMenu}
                  className="flex items-center justify-between px-4 py-4 rounded-2xl hover:bg-slate-50 active:bg-slate-100 transition-colors group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center text-brand-600">
                      <User size={20} />
                    </div>
                    <span className="text-lg font-medium text-slate-900">{t('profile')}</span>
                  </div>
                  <ArrowRight size={20} className="text-slate-400 group-hover:text-brand-500 transition-colors" />
                </Link>
              </>
            ) : null}
          </div>

          {/* Кнопки авторизации внизу */}
          {!isAuthenticated && (
            <div className="px-6 py-6 border-t border-slate-200 space-y-3">
              <Link href={`/${locale}/signin`} onClick={toggleMobileMenu}>
                <Button variant="outline" size="lg" className="w-full" leftIcon={<LogIn size={20} />}>
                  {t('signIn')}
                </Button>
              </Link>
              <Link href={`/${locale}/signup`} onClick={toggleMobileMenu}>
                <Button variant="primary" size="lg" className="w-full">
                  {t('signUp')}
                </Button>
              </Link>
            </div>
          )}
        </div>
      )}
    </>
  );
}
