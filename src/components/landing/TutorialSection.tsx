'use client';

import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

interface TutorialStep {
  key: string;
  gifPath: string;
}

const tutorialSteps: TutorialStep[] = [
  { key: 'step1', gifPath: '/tutorial/step1.gif' },
  { key: 'step2', gifPath: '/tutorial/step2.gif' },
  { key: 'step3', gifPath: '/tutorial/step3.gif' },
  { key: 'step4', gifPath: '/tutorial/step4.gif' },
  { key: 'step5', gifPath: '/tutorial/step5.gif' },
  { key: 'step6', gifPath: '/tutorial/step6.gif' },
];

export function TutorialSection() {
  const t = useTranslations('Landing.tutorial');
  const gifRefs = useRef<(HTMLDivElement | null)[]>([]);
  const badgeRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [pathD, setPathD] = useState('');

  useEffect(() => {
    const calculatePath = () => {
      const positions = gifRefs.current
        .filter(ref => ref !== null)
        .map(ref => {
          const rect = ref!.getBoundingClientRect();
          const container = ref!.closest('section')?.getBoundingClientRect();
          if (!container) return null;

          // Берем центр GIF-блока
          return {
            x: rect.left + rect.width / 2 - container.left,
            y: rect.top + rect.height / 2 - container.top
          };
        })
        .filter(pos => pos !== null);

      if (positions.length < 2) return;

      // Строим плавный путь через центры GIF
      let path = `M ${positions[0]!.x} ${positions[0]!.y}`;

      for (let i = 1; i < positions.length; i++) {
        const prev = positions[i - 1]!;
        const curr = positions[i]!;

        const dx = curr.x - prev.x;
        const dy = curr.y - prev.y;

        // Простые контрольные точки для плавной кривой
        const cp1x = prev.x + dx * 0.5;
        const cp1y = prev.y + dy * 0.25;
        const cp2x = prev.x + dx * 0.5;
        const cp2y = prev.y + dy * 0.75;

        path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${curr.x} ${curr.y}`;
      }

      setPathD(path);
    };

    calculatePath();
    window.addEventListener('resize', calculatePath);

    const timer1 = setTimeout(calculatePath, 100);
    const timer2 = setTimeout(calculatePath, 500);

    return () => {
      window.removeEventListener('resize', calculatePath);
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, []);

  return (
    <section id="tutorial" className="py-20 bg-gradient-to-b from-slate-50 to-white relative overflow-hidden">
      {/* SVG путь через цифры: один брендовый зелёный, пунктир как на карте */}
      {pathD && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }} data-full-bleed>
          <path
            d={pathD}
            stroke="#10b981"
            strokeOpacity="0.5"
            strokeWidth="4"
            strokeDasharray="20 14"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="animate-dash"
          />
        </svg>
      )}

      <div className="max-w-7xl mx-auto px-6 relative" style={{ zIndex: 1 }}>
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
            {t('title')}
          </h2>
          <p className="text-xl text-slate-600">
            {t('subtitle')}
          </p>
        </div>

        <div className="space-y-24">
          {tutorialSteps.map((step, index) => (
            <div
              key={step.key}
              className={`flex flex-col ${
                index % 2 === 0 ? 'lg:flex-row' : 'lg:flex-row-reverse'
              } items-center gap-12 relative`}
            >
              {/* GIF блок */}
              <div className="flex-1 w-full relative z-10" ref={el => { gifRefs.current[index] = el; }}>
                <div className="relative aspect-video rounded-2xl overflow-hidden shadow-float border border-slate-200 bg-slate-100">
                  <Image
                    src={step.gifPath}
                    alt={t(`${step.key}.title`)}
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                    className="object-cover"
                  />
                </div>
              </div>

              {/* Текстовый блок */}
              <div className="flex-1 w-full relative z-10">
                <div
                  ref={el => { badgeRefs.current[index] = el; }}
                  className="inline-flex items-center justify-center w-14 h-14 bg-brand-600 text-white rounded-full font-display text-lg mb-6 shadow-sm"
                >
                  {index + 1}
                </div>
                <h3 className="text-2xl md:text-3xl font-bold text-slate-900 mb-4">
                  {t(`${step.key}.title`)}
                </h3>
                <p className="text-lg text-slate-600 leading-relaxed">
                  {t(`${step.key}.description`)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
