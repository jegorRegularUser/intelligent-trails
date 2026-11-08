'use client';

// src/app/dev/cards/CardsDemo.tsx
// Демо карточек мест: все фикстуры полными карточками + якорная мини-карточка
// НА НАСТОЯЩЕЙ Яндекс-карте (запрос владельца: «карточки должны быть на карте»).
// Пины фикстур стоят в Москве; клик по пину = выбрать фикстуру + спроецировать
// точку в пиксели (map.converter.globalToPage); клик по карте = просто якорь.
// Бейджи часов пересчитываются от выбранного смещения времени.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale } from 'next-intl';
import { YMaps, Map as YMap } from '@pbe/react-yandex-maps';

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

/** Координаты пинов демо (Москва, вокруг центра) — фикстуры без гео, маппим тут. */
const MINI_PINS: Record<string, [number, number]> = {
  [MINI_FIXTURE_IDS[0]]: [55.7532, 37.6181],
  [MINI_FIXTURE_IDS[1]]: [55.7513, 37.6168],
  [MINI_FIXTURE_IDS[2]]: [55.7498, 37.6149],
};

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

  // --- Настоящая карта: пины фикстур + якорь в пикселях контейнера ---
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [ymaps, setYmaps] = useState<any>(null);
  const [mapInst, setMapInst] = useState<any>(null);
  const [anchor, setAnchor] = useState({ x: 260, y: 150 });
  const [miniFixtureId, setMiniFixtureId] = useState<string>(MINI_FIXTURE_IDS[0]);
  const selectedCoordsRef = useRef<[number, number] | null>(null);

  const projectCoords = useCallback(
    (coords: [number, number]) => {
      if (!mapInst || !ymaps || !mapRef.current) return;
      try {
        const projection = mapInst.options.get('projection');
        const zoom = mapInst.getZoom();
        const globalPixel = projection.toGlobalPixels(coords, zoom);
        const page = mapInst.converter.globalToPage(globalPixel);
        const rect = mapRef.current.getBoundingClientRect();
        setAnchor({ x: Math.round(page[0] - rect.left), y: Math.round(page[1] - rect.top) });
      } catch {
        // Проекция недоступна (карта ещё не готова) — якорь остаётся на месте
      }
    },
    [mapInst, ymaps],
  );

  // Пины фикстур: клик = выбрать фикстуру + спроецировать якорь
  useEffect(() => {
    if (!ymaps || !mapInst) return;
    const placemarks: any[] = [];
    for (const id of MINI_FIXTURE_IDS) {
      const coords = MINI_PINS[id];
      if (!coords) continue;
      const placemark = new ymaps.Placemark(
        coords,
        { iconCaption: id },
        { preset: 'islands#blueCircleDotIcon', iconCaptionMaxWidth: '120' },
      );
      placemark.events.add('click', () => {
        setMiniFixtureId(id);
        selectedCoordsRef.current = coords;
        projectCoords(coords);
      });
      placemarks.push(placemark);
      mapInst.geoObjects.add(placemark);
    }
    // Движение/зум карты: якорь выбранной точки следует за пином
    const onBoundsChange = () => {
      if (selectedCoordsRef.current) projectCoords(selectedCoordsRef.current);
    };
    mapInst.events.add('boundschange', onBoundsChange);

    return () => {
      mapInst.events.remove('boundschange', onBoundsChange);
      for (const pm of placemarks) mapInst.geoObjects.remove(pm);
    };
  }, [ymaps, mapInst, projectCoords]);

  // Клик по карте (мимо пина) — просто переносим якорь, фикстуру не меняем
  useEffect(() => {
    if (!mapInst) return;
    const onMapClick = (e: any) => {
      const coords: [number, number] = e.get('coords');
      selectedCoordsRef.current = coords;
      projectCoords(coords);
    };
    mapInst.events.add('click', onMapClick);
    return () => mapInst.events.remove('click', onMapClick);
  }, [mapInst, projectCoords]);

  const miniCard = useMemo(() => {
    const fixture = PLACE_CARD_FIXTURES.find((f) => f.id === miniFixtureId) ?? PLACE_CARD_FIXTURES[0];
    return buildFixtureCard(fixture, locale, at);
  }, [miniFixtureId, locale, at]);

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

      {/* Интерактив: якорная мини-карточка на настоящей Яндекс-карте */}
      <section className="mb-10">
        <h2 className="mb-2 text-lg font-semibold text-slate-900">
          {locale === 'ru' ? 'Якорная мини-карточка' : 'Anchored mini card'}
        </h2>
        <p className="mb-3 text-sm text-slate-500">
          {locale === 'ru'
            ? 'Клик по пину выбирает фикстуру и якорит карточку к точке. Движение карты — якорь следует. На мобильном — bottom sheet.'
            : 'Click a pin to pick a fixture and anchor the card. The anchor follows map movement. Mobile shows a bottom sheet.'}
        </p>

        <div className="mb-3 flex flex-wrap gap-2">
          {MINI_FIXTURE_IDS.map((id) => {
            const fixture = PLACE_CARD_FIXTURES.find((f) => f.id === id);
            if (!fixture) return null;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setMiniFixtureId(id);
                  const coords = MINI_PINS[id];
                  if (coords) {
                    selectedCoordsRef.current = coords;
                    projectCoords(coords);
                  }
                }}
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
          className="relative h-[480px] w-full overflow-hidden rounded-2xl border border-slate-200"
        >
          <YMaps
            query={{
              apikey: process.env.NEXT_PUBLIC_YANDEX_API_KEY,
              load: 'package.full',
              lang: locale === 'en' ? 'en_US' : 'ru_RU',
            }}
          >
            <YMap
              defaultState={{ center: [55.7522, 37.6156], zoom: 15, controls: [] }}
              width="100%"
              height="100%"
              onLoad={setYmaps}
              instanceRef={setMapInst}
              modules={['Placemark']}
              options={{ suppressMapOpenBlock: true, suppressObsoleteBrowserNotifier: true }}
            />
          </YMaps>
          {/* Якорная мини-карточка поверх карты */}
          <PlaceMiniCard card={miniCard} anchor={anchor} containerRef={mapRef} variant="full" />
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
