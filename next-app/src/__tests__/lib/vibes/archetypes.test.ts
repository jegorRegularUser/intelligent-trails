import { describe, it, expect } from 'vitest';
import { PLACE_CATEGORIES } from '@/constants/categories';
import {
  ARCHETYPES,
  DEFAULT_INDOOR,
  GREEN,
  EVENING,
  COFFEE,
  getArchetype,
} from '@/lib/vibes/archetypes';

const CATEGORIES = Object.keys(PLACE_CATEGORIES) as Array<keyof typeof PLACE_CATEGORIES>;

describe('archetypes', () => {
  it('реестр содержит ровно 5 архетипов с уникальными id', () => {
    expect(ARCHETYPES).toHaveLength(5);
    const ids = ARCHETYPES.map((a) => a.id);
    expect(new Set(ids).size).toBe(5);
    expect(ids).toEqual(['green', 'coffee', 'evening', 'rainy', 'surprise']);
  });

  it('каждая из 9 категорий покрыта весом и stayMinutes у каждого архетипа', () => {
    for (const a of ARCHETYPES) {
      for (const c of CATEGORIES) {
        expect(a.categoryWeights[c], `${a.id}.categoryWeights.${c}`).toBeDefined();
        expect(a.stayMinutes[c], `${a.id}.stayMinutes.${c}`).toBeDefined();
      }
      expect(Object.keys(a.categoryWeights)).toHaveLength(CATEGORIES.length);
      expect(Object.keys(a.stayMinutes)).toHaveLength(CATEGORIES.length);
    }
  });

  it('все веса конечные и в [0,1], stayMinutes — положительные конечные', () => {
    for (const a of ARCHETYPES) {
      for (const c of CATEGORIES) {
        const w = a.categoryWeights[c];
        expect(Number.isFinite(w), `${a.id}.categoryWeights.${c}`).toBe(true);
        expect(w).toBeGreaterThanOrEqual(0);
        expect(w).toBeLessThanOrEqual(1);

        const m = a.stayMinutes[c];
        expect(Number.isFinite(m), `${a.id}.stayMinutes.${c}`).toBe(true);
        expect(m).toBeGreaterThan(0);
      }
      expect(Number.isFinite(a.indoorBias)).toBe(true);
      expect(a.indoorBias).toBeGreaterThanOrEqual(0);
      expect(a.indoorBias).toBeLessThanOrEqual(1);
      expect(Number.isFinite(a.shadePriority)).toBe(true);
      expect(a.shadePriority).toBeGreaterThanOrEqual(0);
      expect(a.shadePriority).toBeLessThanOrEqual(1);
    }
  });

  it('hourAffinity на всех часах 0-23 выдаёт конечное значение из [0,1]', () => {
    for (const a of ARCHETYPES) {
      for (let h = 0; h <= 23; h++) {
        const v = a.hourAffinity(h);
        expect(Number.isFinite(v), `${a.id}@${h}`).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('hourAffinity — кусочно-линейная с опорными точками из docs/vibes.md §3.6', () => {
    expect(EVENING.hourAffinity(12)).toBeCloseTo(0.1);
    expect(EVENING.hourAffinity(20)).toBeCloseTo(1.0);
    expect(EVENING.hourAffinity(19)).toBeCloseTo(0.9);
    expect(GREEN.hourAffinity(11)).toBeCloseTo(1.0);
    expect(GREEN.hourAffinity(9.5)).toBeCloseTo(0.925); // между 8:0.85 и 11:1.0
    expect(GREEN.hourAffinity(22.5)).toBeCloseTo(0.35); // между 21:0.45 и 24:0.25
    expect(COFFEE.hourAffinity(0)).toBeCloseTo(0.1);
  });

  it('тексты заполнены на обоих языках', () => {
    for (const a of ARCHETYPES) {
      expect(a.labelRu.trim()).not.toBe('');
      expect(a.labelEn.trim()).not.toBe('');
      expect(a.descriptionRu.trim()).not.toBe('');
      expect(a.descriptionEn.trim()).not.toBe('');
    }
  });

  it('getArchetype возвращает архетип по id и бросает на неизвестном', () => {
    expect(getArchetype('green')).toBe(GREEN);
    expect(() => getArchetype('nope' as never)).toThrow();
  });

  it('DEFAULT_INDOOR покрывает все 9 категорий булевыми значениями', () => {
    for (const c of CATEGORIES) {
      expect(typeof DEFAULT_INDOOR[c]).toBe('boolean');
    }
    expect(Object.keys(DEFAULT_INDOOR)).toHaveLength(CATEGORIES.length);
  });
});
