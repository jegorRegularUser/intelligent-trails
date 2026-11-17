'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { ArrowRight, Footprints } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function HeroSection() {
  const t = useTranslations('Landing.hero');

  const scrollToTutorial = () => {
    document.getElementById('tutorial')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-brand-50/80 via-white to-white">
      {/* Мотив продукта: пунктирная петля, «набросанная» по бумаге (как петля на карте при сборке) */}
      <svg
        aria-hidden
        className="pointer-events-none absolute -right-20 top-14 hidden w-[520px] text-brand-300 lg:block"
        viewBox="0 0 520 420"
        fill="none"
      >
        <path
          d="M80 300 C 140 180, 260 120, 340 170 S 470 320, 380 350 S 160 380, 80 300 Z"
          stroke="currentColor"
          strokeWidth="3"
          strokeDasharray="10 12"
          strokeLinecap="round"
          className="animate-dash"
        />
        <circle cx="80" cy="300" r="7" fill="currentColor" />
      </svg>

      <div className="relative max-w-7xl mx-auto px-6 py-16 lg:py-24 grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        {/* Копия: один экран = значение + два действия */}
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3.5 py-1.5 text-sm font-medium text-brand-700">
            <Footprints size={15} aria-hidden />
            {t('badge')}
          </p>

          <h1 className="mt-6 font-display text-3xl md:text-4xl xl:text-[2.75rem] leading-[1.15] tracking-tight text-slate-900">
            {t('title')}
          </h1>

          <p className="mt-6 max-w-xl text-lg md:text-xl leading-relaxed text-slate-600">
            {t('subtitle')}
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
            <Link href={`/map`} className="contents">
              <Button variant="primary" size="lg" className="w-full sm:w-auto" rightIcon={<ArrowRight size={20} />}>
                {t('cta')}
              </Button>
            </Link>
            <Button variant="outline" size="lg" className="w-full sm:w-auto" onClick={scrollToTutorial}>
              {t('ctaSecondary')}
            </Button>
          </div>
        </div>

        {/* Живой скрин продукта: карточка честного тайминга поверх карты */}
        <div className="relative">
          <div className="rounded-3xl border border-brand-100 bg-white p-2 shadow-float">
            <Image
              src="/hero/walk-panel.png"
              alt={t('visualAlt')}
              width={1280}
              height={719}
              priority
              sizes="(max-width: 1024px) 100vw, 560px"
              className="h-auto w-full rounded-2xl object-cover"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
