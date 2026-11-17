// ЖИВЫЕ интеграционные тесты OSRM-фолбэка (ADR-004) — ходят в реальную сеть
// на публичный инстанс FOSSGIS (routing.openstreetmap.de, routed-foot).
// CI их не запускает: vitest.config.ts исключает **/*.integration.test.*
// Локально нужен конфиг без этого исключения (CLI --exclude к нему ДОБАВЛЯЕТСЯ,
// не заменяет): сделай временный vitest-конфиг с exclude: ['**/node_modules/**']
// и запусти RUN_GEO_LIVE_TESTS=1 npx vitest run --config <temp> src/lib/geo/__tests__/osrm.integration.test.ts
// Гейт RUN_GEO_LIVE_TESTS=1 — публичный инстанс, не долбим его на каждый прогон
// (fair use: пара запросов за прогон, без ретраев).
import { describe, it, expect } from 'vitest';
import { CloudProvider } from '@/lib/geo/cloud/cloud-provider';
import { OsrmRoutingAdapter } from '@/lib/geo/cloud/osrm';

const MOSCOW: [number, number] = [55.751244, 37.618423]; // Красная площадь
const ZARYADYE: [number, number] = [55.751032, 37.629789]; // Зарядье
const CHISTYE_PRUDY: [number, number] = [55.764519, 37.638731];

describe.skipIf(!process.env.RUN_GEO_LIVE_TESTS)('OSRM LIVE: FOSSGIS routed-foot', () => {
  it('адаптер: короткий маршрут по центру Москвы, геометрия в [lat, lng]', async () => {
    const adapter = new OsrmRoutingAdapter({
      baseUrl: 'https://routing.openstreetmap.de/routed-foot',
      routeTimeoutMs: 15_000,
      matrixTimeoutMs: 15_000,
    });

    const segment = await adapter.route([MOSCOW, ZARYADYE]);

    expect(segment.source).toBe('osrm');
    expect(segment.distanceMeters).toBeGreaterThan(100);
    expect(segment.distanceMeters).toBeLessThan(5000);
    expect(segment.durationSeconds).toBeGreaterThan(60);
    expect(segment.geometry.length).toBeGreaterThan(5);
    for (const [lat, lng] of segment.geometry) {
      expect(lat).toBeGreaterThan(55.7);
      expect(lat).toBeLessThan(55.8);
      expect(lng).toBeGreaterThan(37.5);
      expect(lng).toBeLessThan(37.7);
    }
  });

  it('адаптер: таблица 3×3, диагональ ~0, склейка индексов не поехала', async () => {
    const adapter = new OsrmRoutingAdapter({
      baseUrl: 'https://routing.openstreetmap.de/routed-foot',
      routeTimeoutMs: 15_000,
      matrixTimeoutMs: 15_000,
    });

    const cells = await adapter.matrix(
      [MOSCOW, ZARYADYE, CHISTYE_PRUDY],
      [MOSCOW, ZARYADYE, CHISTYE_PRUDY],
    );

    expect(cells).toHaveLength(9);
    const diagonal = cells.filter((c) => c.sourceIndex === c.targetIndex);
    expect(diagonal).toHaveLength(3);
    for (const cell of diagonal) {
      // Диагональ — время от точки до самой себя: 0 или чуть больше (привязка к графику).
      expect(cell.durationSeconds ?? 0).toBeLessThan(60);
      expect(cell.distanceMeters ?? 0).toBeLessThan(100);
    }
    // Пешком между этими точками Москвы дойти можно — ячейки не null.
    const cross = cells.find((c) => c.sourceIndex === 0 && c.targetIndex === 2)!;
    expect(cross.durationSeconds).not.toBeNull();
    expect(cross.durationSeconds! / 60).toBeGreaterThan(10); // Чистые пруды от Кремля дольше 10 минут
  });

  it('CloudProvider без ключа ORS: маршрут строится через OSRM-фолбэк', async () => {
    // Ключ пустой ровно как в env без OPENROUTESERVICE_API_KEY — продукт
    // обязан работать на одном OSRM (ADR-004, политика «ключа нет»).
    const provider = new CloudProvider({ orsApiKey: '' });

    const segment = await provider.route({ waypoints: [MOSCOW, ZARYADYE] });

    expect(segment.source).toBe('osrm');
    expect(segment.geometry.length).toBeGreaterThan(5);
  });
});
