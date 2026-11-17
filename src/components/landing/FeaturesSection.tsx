'use client';

import { useTranslations } from 'next-intl';
import { Route, MapPin, Bike, Share2, History, Shuffle } from 'lucide-react';
import { cn } from '@/utils/cn';

/*
 * Бенто вместо ровной сетки 3×2: у каждой ячейки свой ритм —
 * ведущая фича шире, «Ссылка = прогулка» разворачивается в горизонтальную полосу.
 */
const features = [
  { key: 'smartRouting', icon: Route, className: 'md:col-span-4', tinted: true, horizontal: false },
  { key: 'categories', icon: MapPin, className: 'md:col-span-2', tinted: false, horizontal: false },
  { key: 'transport', icon: Bike, className: 'md:col-span-2', tinted: false, horizontal: false },
  { key: 'history', icon: History, className: 'md:col-span-2', tinted: false, horizontal: false },
  { key: 'alternatives', icon: Shuffle, className: 'md:col-span-2', tinted: false, horizontal: false },
  { key: 'sharing', icon: Share2, className: 'md:col-span-6', tinted: false, horizontal: true },
] as const;

export function FeaturesSection() {
  const t = useTranslations('Landing.features');

  return (
    <section className="py-20 lg:py-28 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        <div className="max-w-2xl">
          <h2 className="font-display text-3xl md:text-4xl tracking-tight text-slate-900">
            {t('title')}
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            {t('subtitle')}
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-6 gap-4">
          {features.map(({ key, icon: Icon, className, tinted, horizontal }) => (
            <div
              key={key}
              className={cn(
                'rounded-2xl border p-6 transition-colors',
                tinted ? 'border-brand-100 bg-brand-50' : 'border-slate-200 bg-white hover:border-brand-300',
                horizontal && 'flex flex-col md:flex-row md:items-center gap-4 md:gap-6',
                className
              )}
            >
              <div
                className={cn(
                  'w-11 h-11 shrink-0 rounded-xl flex items-center justify-center text-brand-600',
                  horizontal ? 'bg-white border border-brand-100' : 'bg-brand-100',
                  horizontal ? '' : 'mb-4'
                )}
              >
                <Icon size={22} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">{t(`${key}.title`)}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                  {t(`${key}.description`)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
