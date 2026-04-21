'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface HeroSectionProps {
  locale: string;
}

export function HeroSection({ locale }: HeroSectionProps) {
  const t = useTranslations('Landing.hero');

  const scrollToTutorial = () => {
    document.getElementById('tutorial')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="relative min-h-[90vh] flex items-center justify-center bg-gradient-to-br from-brand-50 via-white to-blue-50 overflow-hidden">
      {/* Декоративные элементы */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-brand-200 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob"></div>
        <div className="absolute top-40 right-10 w-72 h-72 bg-blue-200 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-1/2 w-72 h-72 bg-purple-200 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob animation-delay-4000"></div>
      </div>

      <div className="relative max-w-7xl mx-auto px-6 py-20 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-brand-100 text-brand-700 rounded-full text-sm font-medium mb-8">
          <Sparkles size={16} />
          <span>Умное планирование маршрутов</span>
        </div>

        <h1 className="text-5xl md:text-7xl font-bold text-slate-900 mb-6 leading-tight">
          {t('title')}
        </h1>

        <p className="text-xl md:text-2xl text-slate-600 mb-12 max-w-3xl mx-auto">
          {t('subtitle')}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href={`/${locale}/map`}>
            <Button variant="primary" size="lg" className="text-lg px-8 py-4">
              {t('cta')}
              <ArrowRight size={20} className="ml-2" />
            </Button>
          </Link>
          <Button variant="outline" size="lg" className="text-lg px-8 py-4" onClick={scrollToTutorial}>
            {t('ctaSecondary')}
          </Button>
        </div>
      </div>
    </section>
  );
}
