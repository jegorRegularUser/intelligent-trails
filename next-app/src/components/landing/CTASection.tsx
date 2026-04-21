'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface CTASectionProps {
  locale: string;
}

export function CTASection({ locale }: CTASectionProps) {
  const t = useTranslations('Landing.cta');

  return (
    <section className="py-20 bg-gradient-to-br from-brand-500 via-brand-600 to-blue-600 relative overflow-hidden">
      {/* Декоративные элементы */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-10 left-20 w-64 h-64 bg-white rounded-full mix-blend-overlay filter blur-3xl opacity-20 animate-blob"></div>
        <div className="absolute bottom-10 right-20 w-64 h-64 bg-blue-300 rounded-full mix-blend-overlay filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
      </div>

      <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/20 backdrop-blur-sm text-white rounded-full text-sm font-medium mb-6">
          <Sparkles size={16} />
          <span>{t('badge')}</span>
        </div>

        <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
          {t('title')}
        </h2>

        <p className="text-xl text-white/90 mb-10 max-w-2xl mx-auto">
          {t('subtitle')}
        </p>

        <Link href={`/${locale}/map`}>
          <Button
            variant="outline"
            size="lg"
            className="bg-white text-brand-600 hover:bg-slate-50 border-0 text-lg px-8 py-4 shadow-xl"
          >
            {t('button')}
            <ArrowRight size={20} className="ml-2" />
          </Button>
        </Link>
      </div>
    </section>
  );
}
