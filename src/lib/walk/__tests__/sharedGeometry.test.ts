import { describe, expect, it } from 'vitest';
import { searchRadiusMetersForBudget } from '../shared/geometry';
import { searchRadiusMeters } from '../quickPipeline';

describe('shared/geometry: searchRadiusMetersForBudget (клиентский твин R6)', () => {
  it('та же арифметика, что у серверного searchRadiusMeters (parity)', () => {
    for (const budget of [15, 30, 45, 60, 90, 120, 240]) {
      expect(searchRadiusMetersForBudget(budget)).toBe(searchRadiusMeters(budget));
    }
  });

  it('знакомые числа: 30 мин → 900 м, 60 мин → 1800 м (75 м/мин × 0.4 × бюджет)', () => {
    expect(searchRadiusMetersForBudget(30)).toBe(900);
    expect(searchRadiusMetersForBudget(60)).toBe(1800);
    expect(searchRadiusMetersForBudget(240)).toBe(7200);
  });

  it('нулевой/дробный бюджет не даёт мусора', () => {
    expect(searchRadiusMetersForBudget(0)).toBe(0);
    expect(searchRadiusMetersForBudget(12.5)).toBe(375);
  });
});
