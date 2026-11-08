// src/lib/walk/__tests__/selection.test.ts
// Отбор кандидатов: радиус петли, коридор А→Б, cap 60, веса, факты для reason.

import { describe, it, expect } from 'vitest';
import { selectCandidates } from '@/lib/walk/selection';
import { makeNode } from './gridCity';
import type { WalkPlace } from '@/lib/walk/types';

function place(
  id: string,
  category: string,
  east: number,
  north: number,
  rating?: number,
): WalkPlace {
  return {
    id,
    name: id,
    category,
    coordinates: makeNode(east, north),
    ...(rating !== undefined ? { rating } : {}),
  };
}

describe('selectCandidates: зона', () => {
  it('петля: радиус отсекает дальних', () => {
    const res = selectCandidates({
      start: makeNode(0, 0),
      isLoop: true,
      zoneMeters: 600,
      weightOf: (c) => (c === 'cafe' ? 1 : 0),
      candidates: [place('near', 'cafe', 500, 0), place('far', 'cafe', 1500, 0)],
      maxCount: 60,
    });
    expect(res.picked.map((p) => p.place.id)).toEqual(['near']);
    expect(res.picked[0].proximityMeters).toBeCloseTo(500, 0);
  });

  it('А→Б: коридор отсекает боковых и тех, кто за финишем', () => {
    const res = selectCandidates({
      start: makeNode(0, 0),
      end: makeNode(3000, 0),
      isLoop: false,
      zoneMeters: 900,
      weightOf: () => 1,
      candidates: [
        place('inline', 'cafe', 1000, 500),
        place('sideways', 'park', 2000, 2000),
        place('beyond', 'viewpoint', 4000, 500),
      ],
      maxCount: 60,
    });
    expect(res.picked.map((p) => p.place.id)).toEqual(['inline']);
  });

  it('нулевой вес категории исключает кандидатов', () => {
    const res = selectCandidates({
      start: makeNode(0, 0),
      isLoop: true,
      zoneMeters: 1000,
      weightOf: () => 0,
      candidates: [place('a', 'cafe', 500, 0)],
      maxCount: 60,
    });
    expect(res.picked).toHaveLength(0);
  });
});

describe('selectCandidates: скоринг и cap', () => {
  it('рейтинг поднимает место в шорт-листе', () => {
    const res = selectCandidates({
      start: makeNode(0, 0),
      isLoop: true,
      zoneMeters: 1000,
      weightOf: () => 1,
      candidates: [
        place('plain', 'cafe', 500, 0),
        place('rated', 'cafe', 500, 500, 5),
      ],
      maxCount: 60,
    });
    // plain ближе (500 против 707), но rated вытягивает рейтинг.
    expect(res.picked[0].place.id).toBe('rated');
  });

  it('cap 60: из сотни кандидатов остаётся ровно 60 лучших', () => {
    const candidates = Array.from({ length: 100 }, (_, i) =>
      place(`p${i}`, 'cafe', i * 500, 0, i < 10 ? 5 : undefined),
    );
    const res = selectCandidates({
      start: makeNode(0, 0),
      isLoop: true,
      zoneMeters: 1e6,
      weightOf: () => 1,
      candidates,
      maxCount: 60,
    });
    expect(res.picked).toHaveLength(60);
    // Десятка рейтинговых — внутри, хвост отсечён.
    const ids = res.picked.map((p) => p.place.id);
    expect(ids).toContain('p0');
    expect(ids).not.toContain('p90');
  });

  it('bestByCategory — лучший по скору в каждой категории', () => {
    const res = selectCandidates({
      start: makeNode(0, 0),
      isLoop: true,
      zoneMeters: 1000,
      weightOf: () => 1,
      candidates: [
        place('cafe-weak', 'cafe', 500, 0),
        place('cafe-strong', 'cafe', 500, 0, 5),
        place('park-only', 'park', 500, 0),
      ],
      maxCount: 60,
    });
    expect(res.bestByCategory.get('cafe')?.id ?? res.bestByCategory.get('cafe')).toBe('cafe-strong');
    expect(res.bestByCategory.get('park')).toBeTruthy();
  });

  it('близость сохранена для reason', () => {
    const res = selectCandidates({
      start: makeNode(0, 0),
      isLoop: true,
      zoneMeters: 1000,
      weightOf: () => 1,
      candidates: [place('a', 'cafe', 500, 0)],
      maxCount: 60,
    });
    const chosen = res.picked[0];
    expect(res.proximity.get(chosen.place)).toBe(chosen.proximityMeters);
  });
});
