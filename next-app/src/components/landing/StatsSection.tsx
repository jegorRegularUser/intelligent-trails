'use client';

import { useTranslations } from 'next-intl';
import { MapPin, Route, Users, TrendingUp } from 'lucide-react';

const stats = [
  { key: 'routes', icon: Route, value: '10K+' },
  { key: 'places', icon: MapPin, value: '50K+' },
  { key: 'users', icon: Users, value: '5K+' },
  { key: 'growth', icon: TrendingUp, value: '200%' },
];

export function StatsSection() {
  const t = useTranslations('Landing.stats');

  return (
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
            {t('title')}
          </h2>
          <p className="text-xl text-slate-600">
            {t('subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
          {stats.map(({ key, icon: Icon, value }) => (
            <div
              key={key}
              className="text-center p-8 rounded-2xl bg-gradient-to-br from-slate-50 to-white border border-slate-200 hover:shadow-lg transition-all duration-300"
            >
              <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-100 rounded-2xl text-brand-600 mb-4">
                <Icon size={32} />
              </div>
              <div className="text-4xl font-bold text-slate-900 mb-2">
                {value}
              </div>
              <div className="text-slate-600 font-medium">
                {t(`${key}.label`)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
