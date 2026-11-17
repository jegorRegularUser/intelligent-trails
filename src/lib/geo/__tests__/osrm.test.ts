import { describe, it, expect } from 'vitest';
import { OsrmRoutingAdapter, OSRM_MAX_URL_LENGTH, SerialQueue } from '@/lib/geo/cloud/osrm';
import { CloudProvider } from '@/lib/geo/cloud/cloud-provider';
import { GeoError } from '@/lib/geo/types';
import { createFakeFetch, jsonResponse, FakeFetch, MOSCOW, ZARYADYE } from './fakes';
import { LatLng } from '@/lib/geo/types';

const BASE = 'https://osrm.example/routed-foot';
const ROUTE_URL =
  `${BASE}/route/v1/foot/37.61842,55.75124;37.62979,55.75103?overview=full&geometries=geojson`;
const TABLE_URL =
  `${BASE}/table/v1/foot/37.61842,55.75124;37.62979,55.75103;37.61500,55.75200` +
  '?sources=0;1&destinations=2&annotations=duration,distance';

const PARK: LatLng = [55.752, 37.615];

function makeAdapter(fetchImpl: typeof fetch, opts?: { maxUrlLength?: number; timeouts?: number }) {
  return new OsrmRoutingAdapter({
    baseUrl: BASE,
    fetchImpl,
    routeTimeoutMs: opts?.timeouts ?? 1000,
    matrixTimeoutMs: opts?.timeouts ?? 1000,
    maxUrlLength: opts?.maxUrlLength,
  });
}

function osrmRouteBody() {
  return {
    code: 'Ok',
    routes: [
      {
        legs: [{ duration: 900.25, distance: 1234.5 }],
        duration: 900.25,
        distance: 1234.5,
        geometry: { coordinates: [[37.6184, 55.7512], [37.619, 55.7515]] },
      },
    ],
  };
}

interface ParsedTableCall {
  url: string;
  coords: number[][];
  sources: number[];
  destinations: number[];
  annotations: string | null;
}

function parseTableCall(url: string): ParsedTableCall {
  const parsed = new URL(url);
  const coords = parsed.pathname
    .split('/table/v1/foot/')[1]
    .split(';')
    .map((pair) => pair.split(',').map(Number));
  const sources = (parsed.searchParams.get('sources') ?? '').split(';').map(Number);
  const destinations = (parsed.searchParams.get('destinations') ?? '').split(';').map(Number);
  return { url, coords, sources, destinations, annotations: parsed.searchParams.get('annotations') };
}

interface TableHandlerOptions {
  /** Ячейка (чанк, строка, столбец), которую апстрим отдаёт как null. */
  nullAt?: (chunk: number, row: number, col: number) => boolean;
}

/** Детерминированный table-апстрим: значение ячейки = f(номер чанка, строка, столбец). */
function tableHandler(calls: ParsedTableCall[], opts?: TableHandlerOptions) {
  return createFakeFetch((url) => {
    const parsed = parseTableCall(url);
    const chunkIndex = calls.length;
    calls.push(parsed);
    const durations: (number | null)[][] = [];
    const distances: (number | null)[][] = [];
    for (let r = 0; r < parsed.sources.length; r++) {
      const rowDurations: (number | null)[] = [];
      const rowDistances: (number | null)[] = [];
      for (let c = 0; c < parsed.destinations.length; c++) {
        const unreachable = opts?.nullAt?.(chunkIndex, r, c) ?? false;
        rowDurations.push(unreachable ? null : chunkIndex * 1000 + r * 10 + c);
        rowDistances.push(unreachable ? null : chunkIndex * 1000 + r + c);
      }
      durations.push(rowDurations);
      distances.push(rowDistances);
    }
    return jsonResponse({ code: 'Ok', durations, distances });
  });
}

describe('OSRM route: координатный порядок и парсинг', () => {
  it('GET route/v1/foot с координатами [lng, lat]; геометрия возвращается в [lat, lng], source osrm', async () => {
    const { fetch, calls } = createFakeFetch(() => jsonResponse(osrmRouteBody()));
    const adapter = makeAdapter(fetch);

    const segment = await adapter.route([MOSCOW, ZARYADYE]);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(ROUTE_URL);
    expect(segment).toEqual({
      distanceMeters: 1234.5,
      durationSeconds: 900.25,
      geometry: [
        [55.7512, 37.6184], // OSRM отдал [lng, lat] — вернули к порядку приложения
        [55.7515, 37.619],
      ],
      source: 'osrm',
    });
  });

  it('нет верхнеуровневых duration/distance — берём сумму ног', async () => {
    const body = {
      code: 'Ok',
      routes: [
        {
          legs: [
            { duration: 100, distance: 200 },
            { duration: 50.5, distance: 100.5 },
          ],
          geometry: { coordinates: [] },
        },
      ],
    };
    const { fetch } = createFakeFetch(() => jsonResponse(body));
    const segment = await makeAdapter(fetch).route([MOSCOW, ZARYADYE]);
    expect(segment.durationSeconds).toBe(150.5);
    expect(segment.distanceMeters).toBe(300.5);
    expect(segment.geometry).toEqual([]);
  });

  it('пустой routes → NO_ROUTE; нет метрик → UPSTREAM_INVALID; битая точка → UPSTREAM_INVALID', async () => {
    const empty = createFakeFetch(() => jsonResponse({ code: 'Ok', routes: [] }));
    const emptyErr = (await makeAdapter(empty.fetch).route([MOSCOW, ZARYADYE]).catch((e) => e)) as GeoError;
    expect(emptyErr.code).toBe('NO_ROUTE');

    const noMetrics = createFakeFetch(() =>
      jsonResponse({ code: 'Ok', routes: [{ legs: [], geometry: { coordinates: [] } }] }),
    );
    const invalidErr = (await makeAdapter(noMetrics.fetch).route([MOSCOW, ZARYADYE]).catch((e) => e)) as GeoError;
    expect(invalidErr.code).toBe('UPSTREAM_INVALID');

    const brokenPoint = createFakeFetch(() =>
      jsonResponse({
        code: 'Ok',
        routes: [
          {
            duration: 10,
            distance: 10,
            geometry: { coordinates: [[37.6, 55.75], ['мусор', 55.76]] },
          },
        ],
      }),
    );
    const pointErr = (await makeAdapter(brokenPoint.fetch).route([MOSCOW, ZARYADYE]).catch((e) => e)) as GeoError;
    expect(pointErr.code).toBe('UPSTREAM_INVALID');
  });

  it('code NoRoute/NoSegment → NO_ROUTE; прочие коды и отсутствие code → UPSTREAM_INVALID', async () => {
    for (const [code, expected] of [
      ['NoRoute', 'NO_ROUTE'],
      ['NoSegment', 'NO_ROUTE'],
      ['TooBig', 'UPSTREAM_INVALID'],
      ['InvalidQuery', 'UPSTREAM_INVALID'],
      [undefined, 'UPSTREAM_INVALID'],
    ] as const) {
      const { fetch } = createFakeFetch(() => jsonResponse({ code, routes: [] }));
      const err = (await makeAdapter(fetch).route([MOSCOW, ZARYADYE]).catch((e) => e)) as GeoError;
      expect(err.code, `code=${code}`).toBe(expected);
    }
  });

  it('HTTP 500 → UPSTREAM_UNAVAILABLE; таймаут → UPSTREAM_TIMEOUT', async () => {
    const down = createFakeFetch(() => jsonResponse({}, 500));
    const downErr = (await makeAdapter(down.fetch).route([MOSCOW, ZARYADYE]).catch((e) => e)) as GeoError;
    expect(downErr.code).toBe('UPSTREAM_UNAVAILABLE');

    const slow = createFakeFetch(() => new Promise<Response>(() => {}));
    const timeoutErr = (await makeAdapter(slow.fetch, { timeouts: 30 })
      .route([MOSCOW, ZARYADYE])
      .catch((e) => e)) as GeoError;
    expect(timeoutErr.code).toBe('UPSTREAM_TIMEOUT');
  });
});

describe('OSRM matrix: URL-бюджет, склейка, null', () => {
  it('один запрос: sources/destinations относительные, annotations=duration,distance, порядок [lng, lat]', async () => {
    const calls: ParsedTableCall[] = [];
    const { fetch } = tableHandler(calls);

    const cells = await makeAdapter(fetch).matrix([MOSCOW, ZARYADYE], [PARK]);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(TABLE_URL);
    expect(calls[0].sources).toEqual([0, 1]);
    expect(calls[0].destinations).toEqual([2]);
    expect(calls[0].annotations).toBe('duration,distance');
    // Порядок OSRM [lng, lat]: первая локация — округлённая MOSCOW.
    expect(calls[0].coords[0]).toEqual([37.61842, 55.75124]);
    expect(calls[0].coords[2]).toEqual([37.615, 55.752]);

    expect(cells).toEqual([
      { sourceIndex: 0, targetIndex: 0, durationSeconds: 0, distanceMeters: 0 },
      { sourceIndex: 1, targetIndex: 0, durationSeconds: 10, distanceMeters: 1 },
    ]);
  });

  it('чанкинг по URL-бюджету: цели целиком, источники режутся, склейка глобальных индексов', async () => {
    // Бюджет 220 при этой базе: запрос влезает при k+T ≤ 5 точек → цели (3)
    // целиком в каждом запросе, источники чанками по 2.
    const sources: LatLng[] = Array.from({ length: 6 }, (_, i) => [55.50 + i * 0.001, 37.50] as LatLng);
    const calls: ParsedTableCall[] = [];
    const { fetch } = tableHandler(calls, { nullAt: (chunk, r, c) => chunk === 1 && r === 0 && c === 1 });

    const cells = await makeAdapter(fetch, { maxUrlLength: 220 }).matrix(sources, [MOSCOW, ZARYADYE, PARK]);

    expect(calls).toHaveLength(3);
    for (const call of calls) {
      expect(call.sources).toEqual([0, 1]);
      expect(call.destinations).toEqual([2, 3, 4]); // цели целиком, относительные индексы
      expect(call.url.length).toBeLessThanOrEqual(220);
    }
    // locations = чанк источников + все цели.
    expect(calls[0].coords).toHaveLength(5);

    const at = (s: number, t: number) => cells.find((c) => c.sourceIndex === s && c.targetIndex === t)!;
    expect(cells).toHaveLength(6 * 3);
    // Чанк 0: s=0,t=0 → 0; s=1,t=2 → 1*10+2.
    expect(at(0, 0).durationSeconds).toBe(0);
    expect(at(1, 2).durationSeconds).toBe(12);
    // Чанк 1 (chunkStart=2): s=3 → локальная строка 1; null-ячейка (1,0,1) = s2,t1.
    expect(at(3, 0).durationSeconds).toBe(1000 + 1 * 10);
    expect(at(2, 1).durationSeconds).toBeNull();
    expect(at(2, 1).distanceMeters).toBeNull();
    // Чанк 2 (chunkStart=4): s=5 → локальная строка 1.
    expect(at(5, 2).durationSeconds).toBe(2000 + 1 * 10 + 2);
  });

  it('цели сами не влезают в бюджет → двухуровневый чанкинг, каждый URL ≤ бюджета', async () => {
    // Бюджет 150: запрос влезает при k+T ≤ 2 точек → цели по 1, источники по 1.
    const sources: LatLng[] = Array.from({ length: 3 }, (_, i) => [55.50 + i * 0.001, 37.50] as LatLng);
    const targets: LatLng[] = Array.from({ length: 3 }, (_, i) => [55.70 + i * 0.001, 37.70] as LatLng);
    const calls: ParsedTableCall[] = [];
    const { fetch } = tableHandler(calls);

    const cells = await makeAdapter(fetch, { maxUrlLength: 150 }).matrix(sources, targets);

    expect(calls).toHaveLength(9); // 3 источника × 3 цели
    for (const call of calls) {
      expect(call.url.length).toBeLessThanOrEqual(150);
      expect(call.sources).toHaveLength(1);
      expect(call.destinations).toHaveLength(1);
    }
    // Склейка: внешний цикл — цели, внутренний — источники, поэтому чанк №5
    // (t=1, s=2) и чанк №6 (t=2, s=0).
    const at = (s: number, t: number) => cells.find((c) => c.sourceIndex === s && c.targetIndex === t)!;
    expect(at(2, 1).durationSeconds).toBe(5 * 1000);
    expect(at(0, 2).durationSeconds).toBe(6 * 1000);
  });

  it('дефолтный бюджет 8000: 200 источников × 5 целей одним запросом (без ORS-чанкинга по 40)', async () => {
    const sources: LatLng[] = Array.from({ length: 200 }, (_, i) => [55.50 + i * 0.001, 37.50] as LatLng);
    const targets: LatLng[] = Array.from({ length: 5 }, (_, i) => [55.70 + i * 0.001, 37.70] as LatLng);
    const calls: ParsedTableCall[] = [];
    const { fetch } = tableHandler(calls);

    const cells = await makeAdapter(fetch).matrix(sources, targets);

    expect(OSRM_MAX_URL_LENGTH).toBe(8000);
    expect(calls).toHaveLength(1);
    expect(calls[0].url.length).toBeLessThanOrEqual(OSRM_MAX_URL_LENGTH);
    expect(cells).toHaveLength(200 * 5);
    const last = cells.find((c) => c.sourceIndex === 199 && c.targetIndex === 4)!;
    // Один чанк: строка 199 чанка №0 → 199*10 + 4.
    expect(last.durationSeconds).toBe(199 * 10 + 4);
  });

  it('повторный вызов с теми же точками бьёт в кэш чанков; новые цели — новые запросы', async () => {
    const sources: LatLng[] = Array.from({ length: 6 }, (_, i) => [55.50 + i * 0.001, 37.50] as LatLng);
    const calls: ParsedTableCall[] = [];
    const { fetch } = tableHandler(calls);
    const adapter = makeAdapter(fetch, { maxUrlLength: 220 });

    const first = await adapter.matrix(sources, [MOSCOW, ZARYADYE, PARK]);
    expect(calls).toHaveLength(3);

    const second = await adapter.matrix(sources, [MOSCOW, ZARYADYE, PARK]);
    expect(calls).toHaveLength(3); // второй вызов целиком из кэша
    expect(second).toEqual(first);

    await adapter.matrix(sources, [MOSCOW, ZARYADYE]);
    // Новый набор целей → новые чанки. Бонус: с T=2 бюджет позволяет чанки
    // источников по 3 (было 2 при T=3), поэтому ровно 2 запроса, а не 3.
    expect(calls).toHaveLength(5);
  });

  it('пустые списки → [] без запросов', async () => {
    const calls: ParsedTableCall[] = [];
    const { fetch } = tableHandler(calls);
    const adapter = makeAdapter(fetch, { maxUrlLength: 150 });

    await expect(adapter.matrix([], [MOSCOW])).resolves.toEqual([]);
    await expect(adapter.matrix([MOSCOW], [])).resolves.toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('бюджет меньше одного запроса → INVALID_INPUT до сети', async () => {
    const { fetch, calls } = tableHandler([]);
    const adapter = makeAdapter(fetch, { maxUrlLength: 50 });
    const err = (await adapter.matrix([MOSCOW], [ZARYADYE]).catch((e) => e)) as GeoError;
    expect(err.code).toBe('INVALID_INPUT');
    expect(calls).toHaveLength(0);
  });

  it('table code NoRoute → NO_ROUTE; мусорная матрица → UPSTREAM_INVALID', async () => {
    const noRoute = createFakeFetch(() => jsonResponse({ code: 'NoRoute' }));
    const noRouteErr = (await makeAdapter(noRoute.fetch)
      .matrix([MOSCOW], [ZARYADYE])
      .catch((e) => e)) as GeoError;
    expect(noRouteErr.code).toBe('NO_ROUTE');

    const garbage = createFakeFetch(() => jsonResponse({ code: 'Ok', durations: 'не матрица' }));
    const invalidErr = (await makeAdapter(garbage.fetch)
      .matrix([MOSCOW], [ZARYADYE])
      .catch((e) => e)) as GeoError;
    expect(invalidErr.code).toBe('UPSTREAM_INVALID');
  });
});

describe('OSRM fair use: сериализация запросов', () => {
  function deferredFetch() {
    const resolvers: Array<(response: Response) => void> = [];
    const { fetch, calls } = createFakeFetch(
      () => new Promise<Response>((resolve) => resolvers.push(resolve)),
    );
    return { fetch, calls, resolvers };
  }

  it('два параллельных route: второй fetch стартует только после ответа первого', async () => {
    const { fetch, calls, resolvers } = deferredFetch();
    const adapter = makeAdapter(fetch);

    const first = adapter.route([MOSCOW, ZARYADYE]);
    const second = adapter.route([MOSCOW, PARK]);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(calls).toHaveLength(1); // второй ждёт очереди
    resolvers[0](jsonResponse(osrmRouteBody()));
    await first;
    await new Promise((resolve) => setTimeout(resolve, 10)); // микротаски очереди: второй стартовал

    expect(calls).toHaveLength(2);
    resolvers[1](jsonResponse(osrmRouteBody()));
    const [a, b] = await Promise.all([first, second]);
    expect(a).toEqual(b);
  });

  it('route и matrix не блокируют друг друга (очередь на примитив)', async () => {
    const { fetch, calls, resolvers } = deferredFetch();
    const adapter = makeAdapter(fetch);

    const routePromise = adapter.route([MOSCOW, ZARYADYE]);
    const matrixPromise = adapter.matrix([MOSCOW], [ZARYADYE]);
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Оба запроса в полёте одновременно — разные очереди.
    expect(calls).toHaveLength(2);
    resolvers[0](jsonResponse(osrmRouteBody()));
    resolvers[1](
      jsonResponse({
        code: 'Ok',
        durations: [[0]],
        distances: [[0]],
      }),
    );
    await Promise.all([routePromise, matrixPromise]);
  });
});

describe('SerialQueue — контракты очереди на 1 в полёте', () => {
  it('задачи выполняются по очереди, порядок вызовов совпадает с порядком старта', async () => {
    const queue = new SerialQueue();
    const order: number[] = [];
    const tasks = [1, 2, 3].map((n) =>
      queue.run(async () => {
        order.push(n);
        return n * 10;
      }),
    );
    const results = await Promise.all(tasks);
    expect(order).toEqual([1, 2, 3]);
    expect(results).toEqual([10, 20, 30]);
  });

  it('ошибка задачи не ломает очередь: следующая стартует и отвечает', async () => {
    const queue = new SerialQueue();
    const failing = queue.run(async () => {
      throw new Error('первая упала');
    });
    const next = queue.run(async () => 'вторая дошла');
    await expect(failing).rejects.toThrow('первая упала');
    await expect(next).resolves.toBe('вторая дошла');
  });
});

// ---------------------------------------------------------------------------
// CloudProvider: политика фолбэка (ADR-004)
// ---------------------------------------------------------------------------

const ORS_ROUTE = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { coordinates: [[37.6184, 55.7512]] },
      properties: { summary: { distance: 100, duration: 80 } },
    },
  ],
};

function osrmTableBody() {
  return {
    code: 'Ok',
    durations: [[1626.6], [436.8]],
    distances: [[2033.3], [545.7]],
  };
}

function world(handlers: {
  ors?: () => Response | Promise<Response>;
  osrm?: () => Response | Promise<Response>;
}): FakeFetch {
  return createFakeFetch((url) => {
    if (url.startsWith('https://api.openrouteservice.org')) {
      if (!handlers.ors) throw new Error('ORS не должен вызываться в этом сценарии');
      return handlers.ors();
    }
    if (url.startsWith(BASE)) {
      if (!handlers.osrm) throw new Error('OSRM не должен вызываться в этом сценарии');
      return handlers.osrm();
    }
    throw new Error(`неожиданный апстрим: ${url}`);
  });
}

function makeProvider(fake: FakeFetch, orsApiKey = 'test-key', timeouts?: { orsRouteMs: number }) {
  return new CloudProvider({
    orsApiKey,
    osrmBaseUrl: BASE,
    fetchImpl: fake.fetch,
    ...(timeouts ? { timeouts } : {}),
  });
}

describe('CloudProvider × OSRM: политика фолбэка (ADR-004)', () => {
  it('ORS 403 → одна попытка OSRM → сегмент от OSRM', async () => {
    const fake = world({ ors: () => jsonResponse({}, 403), osrm: () => jsonResponse(osrmRouteBody()) });
    const provider = makeProvider(fake);

    const segment = await provider.route({ waypoints: [MOSCOW, ZARYADYE] });

    expect(segment.source).toBe('osrm');
    expect(segment.distanceMeters).toBe(1234.5);
    expect(fake.calls).toHaveLength(2); // ORS, затем OSRM
    expect(new URL(fake.calls[0].url).host).toBe('api.openrouteservice.org');
    expect(new URL(fake.calls[1].url).host).toBe('osrm.example');
  });

  it('фолбэк-ответ кэшируется: повторный route не ходит в сеть', async () => {
    const fake = world({ ors: () => jsonResponse({}, 403), osrm: () => jsonResponse(osrmRouteBody()) });
    const provider = makeProvider(fake);

    const first = await provider.route({ waypoints: [MOSCOW, ZARYADYE] });
    const second = await provider.route({ waypoints: [MOSCOW, ZARYADYE] });

    expect(fake.calls).toHaveLength(2); // ORS+OSRM один раз, дальше кэш
    expect(second).toEqual(first);
    expect(second.source).toBe('osrm');
  });

  it('нет ключа ORS → OSRM сразу, ORS не дёргается', async () => {
    const fake = world({ osrm: () => jsonResponse(osrmRouteBody()) });
    const provider = makeProvider(fake, '');

    const segment = await provider.route({ waypoints: [MOSCOW, ZARYADYE] });

    expect(segment.source).toBe('osrm');
    expect(fake.calls).toHaveLength(1);
    expect(new URL(fake.calls[0].url).host).toBe('osrm.example');
  });

  it('матрица: ORS 500 → одна попытка OSRM, null-ячейки доезжают', async () => {
    const fake = world({ ors: () => jsonResponse({}, 500), osrm: () => jsonResponse(osrmTableBody()) });
    const provider = makeProvider(fake);

    const cells = await provider.matrix([MOSCOW, ZARYADYE], [PARK]);

    expect(fake.calls).toHaveLength(2);
    expect(cells).toEqual([
      { sourceIndex: 0, targetIndex: 0, durationSeconds: 1626.6, distanceMeters: 2033.3 },
      { sourceIndex: 1, targetIndex: 0, durationSeconds: 436.8, distanceMeters: 545.7 },
    ]);
  });

  it('матрица без ключа → OSRM сразу', async () => {
    const fake = world({ osrm: () => jsonResponse(osrmTableBody()) });
    const provider = makeProvider(fake, '');

    const cells = await provider.matrix([MOSCOW, ZARYADYE], [PARK]);

    expect(fake.calls).toHaveLength(1);
    expect(new URL(fake.calls[0].url).host).toBe('osrm.example');
    expect(cells).toHaveLength(2);
  });

  it('UPSTREAM_TIMEOUT ORS не триггерит фолбэк: время уже съедено', async () => {
    const fake = world({
      ors: () => new Promise<Response>(() => {}),
      osrm: () => jsonResponse(osrmRouteBody()),
    });
    const provider = makeProvider(fake, 'test-key', { orsRouteMs: 30 });

    const err = (await provider.route({ waypoints: [MOSCOW, ZARYADYE] }).catch((e) => e)) as GeoError;
    expect(err.code).toBe('UPSTREAM_TIMEOUT');
    expect(fake.calls).toHaveLength(1); // только ORS, OSRM не дёргался
  });

  it('OSRM тоже упал → наверх его ошибка (последняя попытка решает)', async () => {
    const fake = world({
      ors: () => jsonResponse({}, 403),
      osrm: () => jsonResponse({ code: 'NoRoute' }),
    });
    const provider = makeProvider(fake);

    const err = (await provider.route({ waypoints: [MOSCOW, ZARYADYE] }).catch((e) => e)) as GeoError;
    expect(err.code).toBe('NO_ROUTE');
    expect(err.message).toContain('OSRM');
  });

  it('routeAlternatives: ORS 403 → OSRM отдаёт [основной] (альтернатив нет — легальная деградация)', async () => {
    const fake = world({ ors: () => jsonResponse({}, 403), osrm: () => jsonResponse(osrmRouteBody()) });
    const provider = makeProvider(fake);

    const segments = await provider.routeAlternatives({ waypoints: [MOSCOW, ZARYADYE] });

    expect(segments).toHaveLength(1);
    expect(segments[0].source).toBe('osrm');
    expect(fake.calls).toHaveLength(2);
  });

  it('routeAlternatives без ключа → OSRM сразу', async () => {
    const fake = world({ osrm: () => jsonResponse(osrmRouteBody()) });
    const provider = makeProvider(fake, '');

    const segments = await provider.routeAlternatives({ waypoints: [MOSCOW, ZARYADYE] });
    expect(segments).toHaveLength(1);
    expect(segments[0].source).toBe('osrm');
    expect(fake.calls).toHaveLength(1);
  });

  it('ORS живой → OSRM не вызывается вовсе', async () => {
    const fake = world({ ors: () => jsonResponse(ORS_ROUTE) });
    const provider = makeProvider(fake);

    const segment = await provider.route({ waypoints: [MOSCOW, ZARYADYE] });

    expect(segment.source).toBe('cloud');
    expect(fake.calls).toHaveLength(1);
  });
});
