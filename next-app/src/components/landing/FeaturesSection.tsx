'use client';

import { useTranslations } from 'next-intl';
import { Route, MapPin, Bike, Share2, History, Shuffle } from 'lucide-react';

const features = [
  { key: 'smartRouting', icon: Route },
  { key: 'categories', icon: MapPin },
  { key: 'transport', icon: Bike },
  { key: 'sharing', icon: Share2 },
  { key: 'history', icon: History },
  { key: 'alternatives', icon: Shuffle },
];

export function FeaturesSection() {
  const t = useTranslations('Landing.features');

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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map(({ key, icon: Icon }) => (
            <div
              key={key}
              className="p-6 rounded-2xl border border-slate-200 hover:border-brand-300 hover:shadow-lg transition-all duration-300 bg-white"
            >
              <div className="w-12 h-12 bg-brand-100 rounded-xl flex items-center justify-center text-brand-600 mb-4">
                <Icon size={24} />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">
                {t(`${key}.title`)}
              </h3>
              <p className="text-slate-600">
                {t(`${key}.description`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
