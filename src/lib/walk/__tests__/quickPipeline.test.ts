// src/lib/walk/__tests__/quickPipeline.test.ts
// Оффлайн-тесты на чистые части скоринг-пайплайна «Быстрой прогулки»:
// карта причин с клиентскими оверрайдами и эскалация радиуса поиска
// (collectCandidates) на фейк-провайдере.

import { describe, expect, it } from 'vitest';
import {
  collectCandidates,
  diversifyByAzimuth,
  fetchStreetInterest,
  mergeScoreReasons,
  scoreCandidatePool,
  searchRadiusMeters,
  SECTOR_CAP,
} from '../quickPipeline';
import { candidateScore, PROXIMITY_WEIGHT } from '../selection';
import { minimalLoopZoneMeters } from '../createWalkPlan';
import { SURPRISE } from '@/lib/vibes/archetypes';
import type { GeoPlace, GeoProvider, StreetFeature } from '@/lib/geo';
import type { AdjustedProfile } from '@/lib/vibes/combine';
import type { WalkScoreReasons } from '@/components/walk/types';

describe('quickPipeline: мерж карты скоринговых причин', () => {
  it('клиентские причины выживших остановок перекрывают пересчёт, шорт-лист сохраняется', () => {
    const base = new Map<string, WalkScoreReasons>([
      ['candidate', { ru: ['работает сейчас'], en: ['open right now'] }],
      ['kept', { ru: ['пересчитанный факт'], en: ['recomputed fact'] }],
    ]);
    const overrides = new Map<string, WalkScoreReasons>([
      ['kept', { ru: ['рейтинг 4.8 из 5'], en: ['rated 4.8 out of 5'] }],
      ['kept2', { ru: ['ядро вайба «Зелёная прогулка»'], en: ['core of the "green" vibe'] }],
    ]);

    const merged = mergeScoreReasons(base, overrides);

    // Пересчитанного факта для выжившей остановки быть не должно — только прошлый скоринг.
    expect(merged.get('kept')).toEqual({ ru: ['рейтинг 4.8 из 5'], en: ['rated 4.8 out of 5'] });
    expect(merged.get('kept2')).toEqual({
      ru: ['ядро вайба «Зелёная прогулка»'],
      en: ['core of the "green" vibe'],
    });
    // Кандидат новой остановки не задет оверрайдами.
    expect(merged.get('candidate')).toEqual({ ru: ['работает сейчас'], en: ['open right now'] });
    expect(merged.size).toBe(3);
  });

  it('вход не мутируется: мерж возвращает новый объект', () => {
    const base = new Map<string, WalkScoreReasons>([['a', { ru: ['x'], en: ['x'] }]]);
    const overrides = new Map<string, WalkScoreReasons>([['b', { ru: ['y'], en: ['y'] }]]);

    const merged = mergeScoreReasons(base, overrides);

    expect(merged.size).toBe(2);
    expect(merged).not.toBe(base);
    expect(base.size).toBe(1);
  });
});

describe('quickPipeline: эскалация collectCandidates', () => {
  const START: [number, number] = [55.75, 37.62];
  // collectCandidates читает только categoryWeights — минимальный профиль.
  const PROFILE = { categoryWeights: { park: 1 }, adjustments: [] } as unknown as AdjustedProfile;

  function place(id: string, i: number): GeoPlace {
    return { id, name: `Парк ${id}`, category: 'park', coordinates: [START[0] + i * 0.001, START[1]] };
  }

  function fakeProvider(impl: (radius: number) => Promise<GeoPlace[]>): {
    provider: GeoProvider;
    radiuses: number[];
  } {
    const radiuses: number[] = [];
    const provider = {
      searchPlaces: async (_start: [number, number], _category: string, opts: { radiusMeters?: number }) => {
        radiuses.push(opts.radiusMeters ?? 0);
        return impl(opts.radiusMeters ?? 0);
      },
    } as unknown as GeoProvider;
    return { provider, radiuses };
  }

  it('мало мест в первой волне — вторая волна с радиусом ×1.75, дубль смёржен', async () => {
    const firstRadius = searchRadiusMeters(60); // 1800 м
    const wave1 = [place('p1', 1), place('p2', 2)];
    const wave2 = [place('p1', 1), place('p3', 3), place('p4', 4)]; // p1 — дубль
    const { provider, radiuses } = fakeProvider((radius) =>
      Promise.resolve(radius <= firstRadius ? wave1 : wave2),
    );

    const result = await collectCandidates(provider, START, PROFILE, 60);

    expect(result.searchFailed).toBe(false);
    expect(result.places.map((p) => p.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(radiuses).toHaveLength(2);
    expect(radiuses[0]).toBe(firstRadius);
    expect(radiuses[1]).toBe(Math.round(firstRadius * 1.75));
  });

  it('достаточный пул — второй волны нет', async () => {
    const wave = [place('p1', 1), place('p2', 2), place('p3', 3)];
    const { provider, radiuses } = fakeProvider(() => Promise.resolve(wave));

    const result = await collectCandidates(provider, START, PROFILE, 60);

    expect(result.places).toHaveLength(3);
    expect(result.searchFailed).toBe(false);
    expect(radiuses).toHaveLength(1);
  });

  it('все категории упали в обеих волнах — searchFailed, а не «мало мест»', async () => {
    const { provider, radiuses } = fakeProvider(() => Promise.reject(new Error('overpass down')));

    const result = await collectCandidates(provider, START, PROFILE, 60);

    expect(result.places).toHaveLength(0);
    expect(result.searchFailed).toBe(true);
    expect(radiuses).toHaveLength(2);
  });
});

describe('quickPipeline: гейт «работает сейчас» (отсев закрытых)', () => {
  const NOW = new Date('2024-01-15T20:00:00Z'); // понедельник 20:00 UTC
  const PROFILE = { categoryWeights: { park: 1 }, adjustments: [] } as unknown as AdjustedProfile;

  function place(id: string, i: number, openingHours?: string): GeoPlace {
    return {
      id,
      name: `Парк ${id}`,
      category: 'park',
      coordinates: [55.75 + i * 0.001, 37.62],
      ...(openingHours ? { tags: { opening_hours: openingHours } } : {}),
    };
  }

  it('живых хватает — закрытые не едут в пул', () => {
    const pool = [
      ...Array.from({ length: 13 }, (_, i) => place(`alive${i}`, i)),
      place('closed1', 90, 'Mo-Fr 09:00-18:00'), // 20:00 UTC — уже закрыто
      place('closed2', 91, 'Mo-Fr 09:00-18:00'),
    ];
    const scored = scoreCandidatePool({ pool, profile: PROFILE, weather: null, timezone: 'UTC', now: NOW });
    expect(scored.some((entry) => entry.place.id === 'closed1')).toBe(false);
    expect(scored).toHaveLength(13);
    expect(scored.every((entry) => entry.hoursState !== 'closed')).toBe(true);
  });

  it('живых мало — закрытые остаются (честная деградация, не пустой пул)', () => {
    const pool = [
      ...Array.from({ length: 10 }, (_, i) => place(`alive${i}`, i)),
      ...Array.from({ length: 5 }, (_, i) => place(`closed${i}`, 90 + i, 'Mo-Fr 09:00-18:00')),
    ];
    const scored = scoreCandidatePool({ pool, profile: PROFILE, weather: null, timezone: 'UTC', now: NOW });
    expect(scored).toHaveLength(15);
  });
});

describe('quickPipeline: азимутная диверсификация (R2)', () => {
  const START: [number, number] = [55.75, 37.62];
  const EARTH_M_PER_DEG = 111194.9;
  /** Точка на азимуте от севера (clockwise) на дистанции d метров. */
  function atAzimuth(azimuthDeg: number, d: number): [number, number] {
    const rad = (azimuthDeg * Math.PI) / 180;
    return [
      START[0] + (d * Math.cos(rad)) / EARTH_M_PER_DEG,
      START[1] + (d * Math.sin(rad)) / (EARTH_M_PER_DEG * Math.cos(START[0] * (Math.PI / 180))),
    ];
  }
  const entry = (id: string, coordinates: [number, number]) => ({ id, coordinates });

  it('пул «20 лучших в одном секторе, 8 в других» → шорт-лист содержит ≥2 сектора', () => {
    // 20 кандидатов строго на север (сектор 0), 8 — на другие румбы.
    const entries = [
      ...Array.from({ length: 20 }, (_, i) => entry(`north${i}`, atAzimuth(5, 200 + i * 50))),
      entry('east', atAzimuth(95, 400)),
      entry('south', atAzimuth(185, 400)),
      entry('west', atAzimuth(275, 400)),
      entry('ne', atAzimuth(50, 400)),
      entry('se', atAzimuth(140, 400)),
      entry('sw', atAzimuth(230, 400)),
      entry('nw', atAzimuth(320, 400)),
    ];
    const shortlist = diversifyByAzimuth(entries, START, 24);

    expect(shortlist.length).toBeGreaterThan(0);
    // Сектор 0 не съел весь cap: SECTOR_CAP из севера + остальные румбы.
    const northCount = shortlist.filter((e) => e.id.startsWith('north')).length;
    expect(northCount).toBeLessThanOrEqual(SECTOR_CAP);
    const sectors = new Set(
      shortlist
        .filter((e) => !e.id.startsWith('north'))
        .map((e) => e.id),
    );
    expect(sectors.size).toBeGreaterThanOrEqual(2);
    // Густой сектор сохраняет представительство, но не доминирует.
    expect(northCount).toBeGreaterThanOrEqual(2);
  });

  it('потолок на сектор: 30 кандидатов одного азимута → ровно SECTOR_CAP', () => {
    const entries = Array.from({ length: 30 }, (_, i) => entry(`n${i}`, atAzimuth(10, 100 + i * 20)));
    const shortlist = diversifyByAzimuth(entries, START, 24);
    expect(shortlist).toHaveLength(SECTOR_CAP);
  });

  it('пул меньше cap — возвращается как есть (порядок сохранён)', () => {
    const entries = [entry('a', atAzimuth(10, 100)), entry('b', atAzimuth(100, 100))];
    const shortlist = diversifyByAzimuth(entries, START, 24);
    expect(shortlist.map((e) => e.id)).toEqual(['a', 'b']);
  });
});

describe('selection: вес близости (R2)', () => {
  it('дальний якорь с высоким весом больше не проигрывает ближнему с низким', () => {
    // Зона 900 м: ближний (вес 1) против дальнего (вес 3) — при весе близости
    // 1.0 дальний проигрывал (6 − 0.55 < 2), при 0.25 — выигрывает.
    const near = candidateScore(1, 0, 100, 900);
    const far = candidateScore(3, 0, 800, 900);
    expect(far).toBeGreaterThan(near);
    expect(PROXIMITY_WEIGHT).toBe(0.25);
  });

  it('минимальная зона вариантов — самый узкий радиус ZONE_VARIANTS', () => {
    // 0.6·v·B/делитель: для B=60 делитель 3.8 даёт ≈ 710 м.
    expect(minimalLoopZoneMeters(60)).toBeCloseTo(710.5, 0);
    expect(minimalLoopZoneMeters(60)).toBeLessThan(minimalLoopZoneMeters(60, 6));
  });
});

describe('quickPipeline: fetchStreetInterest (S6)', () => {
  const START: [number, number] = [55.75, 37.62];

  const feature = (kind: 'green' | 'water', lat: number, lng: number, name?: string): StreetFeature => ({
    kind,
    geometry: [[lat, lng]],
    ...(name ? { name } : {}),
    areaMeters: 0,
  });

  function providerWith(method?: (center: [number, number], radius: number) => Promise<StreetFeature[] | null>): {
    provider: GeoProvider;
    calls: { center: [number, number]; radius: number }[];
  } {
    const calls: { center: [number, number]; radius: number }[] = [];
    const provider = {
      ...(method
        ? {
            fetchStreetFeatures: async (center: [number, number], radius: number) => {
              calls.push({ center, radius });
              return method(center, radius);
            },
          }
        : {}),
    } as unknown as GeoProvider;
    return { provider, calls };
  }

  it('провайдер без метода → null без паузы и сети', async () => {
    const { provider, calls } = providerWith();
    expect(await fetchStreetInterest(provider, START, 60, SURPRISE)).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('фичи есть → бандл с hints (8 секторов, hasData=true), радиус = поиск 40% бюджета', async () => {
    const { provider, calls } = providerWith(async () => [feature('green', START[0] + 0.004, START[1], 'Парк')]);

    const bundle = await fetchStreetInterest(provider, START, 60, SURPRISE);

    expect(calls).toHaveLength(1);
    expect(calls[0].center).toEqual(START);
    expect(calls[0].radius).toBe(searchRadiusMeters(60));
    expect(bundle?.features).toHaveLength(1);
    expect(bundle?.hints.hasData).toBe(true);
    expect(bundle?.hints.sectors).toHaveLength(8);
    // Северный парк даёт интерес северному сектору.
    expect(bundle?.hints.sectors[0].interest).toBe(1);
  });

  it('пустой ответ, null и отказ провайдера → null (прогулка без интереса, не ошибка)', async () => {
    expect(await fetchStreetInterest(providerWith(async () => []).provider, START, 60, SURPRISE)).toBeNull();
    expect(await fetchStreetInterest(providerWith(async () => null).provider, START, 60, SURPRISE)).toBeNull();
    const failing = providerWith(async () => {
      throw new Error('overpass down');
    });
    expect(await fetchStreetInterest(failing.provider, START, 60, SURPRISE)).toBeNull();
    expect(failing.calls).toHaveLength(1); // отказ проглатывается: ретрай-волны нет (S6)
  });
});
