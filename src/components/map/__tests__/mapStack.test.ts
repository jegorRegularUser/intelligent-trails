import { describe, expect, it } from 'vitest';
import { shouldRenderMaplibre } from '../mapStack';

describe('mapStack: критерий переключения стеков (docs/ux-human-wave.md, B2)', () => {
  it('quick/sightseeing без эксперт-маршрута — maplibre', () => {
    expect(shouldRenderMaplibre('quick', 0)).toBe(true);
    expect(shouldRenderMaplibre('sightseeing', 0)).toBe(true);
  });

  it('вкладка «Маршрут» — Яндекс, даже если mapPoints ещё пуст', () => {
    expect(shouldRenderMaplibre('route', 0)).toBe(false);
  });

  it('эксперт-линия приоритетна: заполненный mapPoints — Яндекс при любом walkMode', () => {
    // Гидрация ?r= заполняет mapPoints до переключения walkMode — инвариант
    // «на ?r= карта всегда Яндекс» держится на втором аргументе.
    expect(shouldRenderMaplibre('quick', 3)).toBe(false);
    expect(shouldRenderMaplibre('route', 3)).toBe(false);
  });
});
