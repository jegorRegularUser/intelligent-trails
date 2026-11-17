'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function CTASection() {
  const t = useTranslations('Landing.cta');

  return (
    <section className="py-20 lg:py-24 bg-pine-900 relative overflow-hidden">
      {/* Та же пунктирная петля, что и в hero — теперь по тёмной «полярной» бумаге */}
      <svg
        aria-hidden
        data-full-bleed
        className="pointer-events-none absolute -left-16 -bottom-16 w-[420px] text-brand-500 opacity-30"
        viewBox="0 0 420 360"
        fill="none"
      >
        <path
          d="M60 260 C 110 150, 220 100, 290 150 S 380 280, 300 310 S 130 330, 60 260 Z"
          stroke="currentColor"
          strokeWidth="3"
          strokeDasharray="10 12"
          strokeLinecap="round"
          className="animate-dash"
        />
        <circle cx="60" cy="260" r="6" fill="currentColor" />
      </svg>

      <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
        <p className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/25 text-sm font-medium text-white/90">
          {t('badge')}
        </p>

        <h2 className="mt-6 font-display text-3xl md:text-4xl tracking-tight text-white">
          {t('title')}
        </h2>

        <p className="mt-5 text-lg text-white/80 max-w-2xl mx-auto">
          {t('subtitle')}
        </p>

        <div className="mt-10">
          <Link href={`/map`}>
            <Button
              size="lg"
              className="bg-white text-brand-700 hover:bg-brand-50 border-0 px-8 shadow-lg"
              rightIcon={<ArrowRight size={20} />}
            >
              {t('button')}
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
