'use client';

// src/app/dev/cards/CardsDemo.tsx
// Демо карточек мест: все фикстуры полными карточками + интерактивная
// якорная мини-карточка над «фальшивой картой» (клик = новый пиксельный якорь).
// Бейджи часов пересчитываются от выбранного смещения времени.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale } from 'next-intl';
import { MapPin } from 'lucide-react';

import {
  buildPlaceCard,
  type PlaceCard as PlaceCardData,
  type PlaceLocale,
} from '@/lib/places';

import { PlaceCard } from '@/components/places/PlaceCard';
import { PlaceMiniCard } from '@/components/places/PlaceMiniCard';
import { MINI_FIXTURE_IDS, PLACE_CARD_FIXTURES, type PlaceCardFixture } from './fixtures';

const DEMO_TIME_ZONE = 'Europe/Moscow';

const TIME_OFFSETS: Array<{ hours: number; label: { ru: string; en: string } }> = [
  { hours: 0, label: { ru: 'Сейчас', en: 'Now' } },
  { hours: 2, label: { ru: '+2 ч', en: '+2 h' } },
  { hours: 10, label: { ru: '+10 ч', en: '+10 h' } },
  { hours: 20, label: { ru: '+20 ч', en: '+20 h' } },
];

function toPlaceLocale(value: string): PlaceLocale {
  return value === 'en' ? 'en' : 'ru';
}

function buildFixtureCard(fixture: PlaceCardFixture, locale: PlaceLocale, at: Date): PlaceCardData {
  return buildPlaceCard(fixture.reversed, fixture.nearby, fixture.nearestRoad, {
    locale,
    timeZone: DEMO_TIME_ZONE,
    at,
  });
}

export function CardsDemo() {
  const rawLocale = useLocale();
  const locale = toPlaceLocale(rawLocale);
  const pick = useCallback((text: { ru: string; en: string }) => text[locale], [locale]);

  // Время читаем вне render-фазы (Date.now() нечист) и не синхронно в эффекте
  // (react-compiler ругается на каскадные рендеры) — поэтому отложенный таймер.
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    const id = window.setTimeout(() => setNowMs(Date.now()), 0);
    return () => window.clearTimeout(id);
  }, []);

  const [offsetHours, setOffsetHours] = useState(0);
  const at = useMemo(() => new Date((nowMs ?? 0) + offsetHours * 3600_000), [nowMs, offsetHours]);
  const ready = nowMs !== null;

  const built = useMemo(
    () => PLACE_CARD_FIXTURES.map((fixture) => ({ fixture, card: buildFixtureCard(fixture, locale, at) })),
    [locale, at],
  );

  // Интерактив: якорная мини-карточка над «фальшивой картой».
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [anchor, setAnchor] = useState({ x: 260, y: 150 });
  const [miniFixtureId, setMiniFixtureId] = useState<string>(MINI_FIXTURE_IDS[0]);

  const miniCard = useMemo(() => {
    const fixture = PLACE_CARD_FIXTURES.find((f) => f.id === miniFixtureId) ?? PLACE_CARD_FIXTURES[0];
    return buildFixtureCard(fixture, locale, at);
  }, [miniFixtureId, locale, at]);

  const handleMapClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setAnchor({
      x: Math.round(event.clientX - rect.left),
      y: Math.round(event.clientY - rect.top),
    });
  }, []);

  if (!ready) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 text-sm text-slate-500">
        {locale === 'ru' ? 'Готовим демо…' : 'Preparing the demo…'}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">dev only · noindex</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">
          {locale === 'ru' ? 'Карточки мест — демо' : 'Place cards — demo'}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {locale === 'ru'
            ? `Часы оцениваются в таймзоне ${DEMO_TIME_ZONE}. Правила — docs/place-cards.md.`
            : `Hours are evaluated in the ${DEMO_TIME_ZONE} time zone. Rules — docs/place-cards.md.`}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {TIME_OFFSETS.map(({ hours, label }) => (
            <button
              key={hours}
              type="button"
              onClick={() => setOffsetHours(hours)}
              className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                offsetHours === hours
                  ? 'border-brand-500 bg-brand-500 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-brand-200'
              }`}
            >
              {pick(label)}
            </button>
          ))}
        </div>
      </header>

      {/* Интерактив: якорная мини-карточка */}
      <section className="mb-10">
        <h2 className="mb-2 text-lg font-semibold text-slate-900">
          {locale === 'ru' ? 'Якорная мини-карточка' : 'Anchored mini card'}
        </h2>
        <p className="mb-3 text-sm text-slate-500">
          {locale === 'ru'
            ? 'Клик по «карте» переносит якорь. На десктопе — карточка у якоря, на мобильном — bottom sheet.'
            : 'Click the "map" to move the anchor. Desktop shows a floating card, mobile a bottom sheet.'}
        </p>

        <div className="mb-3 flex flex-wrap gap-2">
          {MINI_FIXTURE_IDS.map((id) => {
            const fixture = PLACE_CARD_FIXTURES.find((f) => f.id === id);
            if (!fixture) return null;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setMiniFixtureId(id)}
                className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                  miniFixtureId === id
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400'
                }`}
              >
                {fixture.id}
              </button>
            );
          })}
        </div>

        <div
          ref={mapRef}
          onClick={handleMapClick}
          className="relative h-[420px] w-full cursor-crosshair overflow-hidden rounded-2xl border border-slate-200 bg-[linear-gradient(rgba(148,163,184,0.15)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.15)_1px,transparent_1px)] bg-[size:40px_40px] bg-slate-50"
        >
          {/* Маркер якоря — то место, куда проецируется точка на карте. */}
          <span
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 text-brand-600"
            style={{ left: `${anchor.x}px`, top: `${anchor.y}px` }}
          >
            <MapPin className="h-6 w-6" aria-hidden />
          </span>
          <PlaceMiniCard card={miniCard} anchor={anchor} containerRef={mapRef} />
        </div>
      </section>

      {/* Все фикстуры полными карточками */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">
          {locale === 'ru' ? 'Фикстуры приоритетов' : 'Priority fixtures'}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {built.map(({ fixture, card }) => (
            <div key={fixture.id}>
              <p className="mb-1.5 text-xs text-slate-400">{pick(fixture.caption)}</p>
              <PlaceCard card={card} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
