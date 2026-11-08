// src/lib/walk/__tests__/portCompat.test.ts
// Компайл-тайм ассерт структурной совместимости портов (docs/walk-engine.md §2):
// любой GeoProvider из замороженного контракта geo-слоя удовлетворяет
// локальному WalkRoutingPort движка. Дрейф geo/types.ts поймает tsc здесь,
// при этом сам движок lib/geo/types не импортирует.

import { describe, it, expect } from 'vitest';
import type { GeoProvider } from '@/lib/geo/types';
import type { WalkRoutingPort } from '@/lib/walk/ports';

describe('структурная совместимость портов', () => {
  it('GeoProvider удовлетворяет WalkRoutingPort', () => {
    type GeoProviderIsWalkPort = GeoProvider extends WalkRoutingPort ? true : never;
    const check: GeoProviderIsWalkPort = true;
    expect(check).toBe(true);
  });
});
