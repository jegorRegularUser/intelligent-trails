'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { FolderGit2, Mail, MapPin } from 'lucide-react';

interface FooterProps {
  locale: string;
}

export function Footer({ locale }: FooterProps) {
  const t = useTranslations('Footer');
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-slate-900 text-slate-300">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Логотип и описание */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-3 mb-4">
              <Image src="/logo.png" alt="Intelligent Trails" width={32} height={32} className="w-8 h-8" />
              <span className="text-xl font-bold text-white">Intelligent Trails</span>
            </div>
            <p className="text-slate-400 mb-4 max-w-md">
              {t('description')}
            </p>
            <div className="flex items-center gap-4">
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
                aria-label="GitHub"
              >
                <FolderGit2  size={20} />
              </a>
              <a
                href="mailto:contact@intelligenttrails.com"
                className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
                aria-label="Email"
              >
                <Mail size={20} />
              </a>
            </div>
          </div>

          {/* Навигация */}
          <div>
            <h3 className="text-white font-bold mb-4">{t('navigation')}</h3>
            <ul className="space-y-2">
              <li>
                <Link href={`/${locale}/map`} className="hover:text-brand-400 transition-colors">
                  {t('map')}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/history`} className="hover:text-brand-400 transition-colors">
                  {t('history')}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/profile`} className="hover:text-brand-400 transition-colors">
                  {t('profile')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Ресурсы */}
          <div>
            <h3 className="text-white font-bold mb-4">{t('resources')}</h3>
            <ul className="space-y-2">
              <li>
                <a href="#tutorial" className="hover:text-brand-400 transition-colors">
                  {t('tutorial')}
                </a>
              </li>
              <li>
                <Link href={`/${locale}/signin`} className="hover:text-brand-400 transition-colors">
                  {t('signIn')}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/signup`} className="hover:text-brand-400 transition-colors">
                  {t('signUp')}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Нижняя часть */}
        <div className="pt-8 border-t border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-slate-400">
            © {currentYear} Intelligent Trails. {t('rights')}
          </p>
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <MapPin size={16} className="text-brand-400" />
            <span>{t('madeWith')}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
