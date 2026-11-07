// ЖИВЫЕ интеграционные тесты облачного тира — ходят в реальную сеть.
// CI их не запускает: npx vitest run --exclude "**/*.integration.test.*"
// Локально: npx vitest run src/lib/geo/__tests__/cloud.integration.test.ts
//   - ORS-тесты требуют OPENROUTESERVICE_API_KEY в окружении;
//   - тесты Photon/Overpass гейтятся RUN_GEO_LIVE_TESTS=1 (публичные сервисы,
//     не хотим бить по ним на каждый прогон).
import { describe, it, expect } from 'vitest';
import { CloudProvider } from '@/lib/geo/cloud/cloud-provider';

const MOSCOW: [number, number] = [55.751244, 37.618423];
const ZARYADYE: [number, number] = [55.751032, 37.629789];

function liveProvider(): CloudProvider {
  return new CloudProvider({});
}

describe.skipIf(!process.env.OPENROUTESERVICE_API_KEY)('CloudProvider LIVE: OpenRouteService', () => {
  it('строит пешеходный маршрут по реальным улицам', async () => {
    const provider = liveProvider();
    const segment = await provider.route({ waypoints: [MOSCOW, ZARYADYE] });

    expect(segment.source).toBe('cloud');
    expect(segment.distanceMeters).toBeGreaterThan(100);
    expect(segment.distanceMeters).toBeLessThan(5000);
    expect(segment.geometry.length).toBeGreaterThan(5);
  });

  it('матрица: чанк из 3 источников × 2 цели, склейка индексов не поехала', async () => {
    const provider = liveProvider();
    const cells = await provider.matrix([MOSCOW, ZARYADYE, [55.752, 37.615]], [[55.752, 37.615], MOSCOW]);

    expect(cells).toHaveLength(6);
    const diagonal = cells.find((c) => c.sourceIndex === 0 && c.targetIndex === 1);
    expect(diagonal).toBeTruthy();
    expect(diagonal?.durationSeconds ?? 0).toBeGreaterThan(0);
  });
});

describe.skipIf(!process.env.RUN_GEO_LIVE_TESTS)('CloudProvider LIVE: публичные геосервисы', () => {
  it('suggest поPhoton/Nominatim находит Зарядье', async () => {
    const provider = liveProvider();
    const items = await provider.suggest('Зарядье', MOSCOW);

    expect(items.length).toBeGreaterThan(0);
    expect(items[0].coordinates).toBeTruthy();
  });

  it('reverseGeocode у Красной площади возвращает что-то осмысленное', async () => {
    const provider = liveProvider();
    const result = await provider.reverseGeocode(MOSCOW);
    expect(result).toBeTruthy();
  });

  it('searchPlaces находит кафе в Китай-городе', async () => {
    const provider = liveProvider();
    const places = await provider.searchPlaces(MOSCOW, 'cafe', { radiusMeters: 800, limit: 5 });

    expect(places.length).toBeGreaterThan(0);
    for (const place of places) {
      expect(place.category).toBe('cafe');
      expect(place.name).toBeTruthy();
    }
  });
});
