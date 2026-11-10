// src/lib/walk/__tests__/quickPipeline.test.ts
// Оффлайн-тесты на чистые части скоринг-пайплайна «Быстрой прогулки»:
// карта причин с клиентскими оверрайдами и эскалация радиуса поиска
// (collectCandidates) на фейк-провайдере.

import { describe, expect, it } from 'vitest';
import { collectCandidates, mergeScoreReasons, scoreCandidatePool, searchRadiusMeters } from '../quickPipeline';
import type { GeoPlace, GeoProvider } from '@/lib/geo';
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
