import { describe, it, expect } from 'vitest';
import { OrsRoutingAdapter, MATRIX_SOURCES_PER_REQUEST } from '@/lib/geo/cloud/ors';
import { GeoError } from '@/lib/geo/types';
import { createFakeFetch, jsonResponse, parseBody, MOSCOW, ZARYADYE } from './fakes';
import { LatLng } from '@/lib/geo/types';

const BASE = 'https://api.openrouteservice.org';
const DIRECTIONS_URL = `${BASE}/v2/directions/foot-walking/geojson`;

function makeAdapter(fetchImpl: typeof fetch): OrsRoutingAdapter {
  return new OrsRoutingAdapter({
    apiKey: 'test-key',
    baseUrl: BASE,
    fetchImpl,
    routeTimeoutMs: 1000,
    matrixTimeoutMs: 1000,
  });
}

function orsRouteBody() {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[37.6184, 55.7512], [37.619, 55.7515]] },
        properties: { summary: { distance: 1234.5, duration: 900.25 } },
      },
    ],
  };
}

describe('ORS route', () => {
  it('POST geojson-эндпоинт, ключ в Authorization, координаты в порядке [lng, lat]', async () => {
    const { fetch, calls } = createFakeFetch(() => jsonResponse(orsRouteBody()));
    const adapter = makeAdapter(fetch);

    const segment = await adapter.route([MOSCOW, ZARYADYE]);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(DIRECTIONS_URL);
    expect(calls[0].init?.method).toBe('POST');
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('test-key');
    expect(headers['Content-Type']).toBe('application/json');
    const body = parseBody(calls[0].init);
    expect(body.coordinates).toEqual([
      [37.61842, 55.75124],
      [37.62979, 55.75103], // округление до 5 знаков
    ]);

    expect(segment).toEqual({
      distanceMeters: 1234.5,
      durationSeconds: 900.25,
      geometry: [
        [55.7512, 37.6184], // геометрия вернулась в [lat, lng]
        [55.7515, 37.619],
      ],
      source: 'cloud',
    });
  });

  it('422 от ORS («не нашли маршрут») → NO_ROUTE', async () => {
    const { fetch } = createFakeFetch(() =>
      jsonResponse({ error: { code: 2010, message: 'Cannot find route' } }, 422),
    );
    const err = (await makeAdapter(fetch).route([MOSCOW, ZARYADYE]).catch((e) => e)) as GeoError;
    expect(err.code).toBe('NO_ROUTE');
    expect(err.message).toContain('Cannot find route');
  });

  it('401/403 (ключ отклонён) → NO_ROUTE', async () => {
    for (const status of [401, 403]) {
      const { fetch } = createFakeFetch(() => jsonResponse({}, status));
      const err = (await makeAdapter(fetch).route([MOSCOW, ZARYADYE]).catch((e) => e)) as GeoError;
      expect(err.code).toBe('NO_ROUTE');
      expect(err.message).toContain('ключ');
    }
  });

  it('429 (квота исчерпана) → NO_ROUTE с внятным message', async () => {
    const { fetch } = createFakeFetch(() => jsonResponse({}, 429));
    const err = (await makeAdapter(fetch).route([MOSCOW, ZARYADYE]).catch((e) => e)) as GeoError;
    expect(err.code).toBe('NO_ROUTE');
    expect(err.message).toContain('Квота');
  });

  it('5xx и таймаут остаются честными UPSTREAM_*', async () => {
    const { fetch } = createFakeFetch(() => jsonResponse({}, 503));
    const err = (await makeAdapter(fetch).route([MOSCOW, ZARYADYE]).catch((e) => e)) as GeoError;
    expect(err.code).toBe('UPSTREAM_UNAVAILABLE');
  });

  it('нет ключа → NO_ROUTE, сеть не дёргается', async () => {
    const { fetch, calls } = createFakeFetch(() => jsonResponse(orsRouteBody()));
    const adapter = new OrsRoutingAdapter({
      apiKey: undefined,
      baseUrl: BASE,
      fetchImpl: fetch,
      routeTimeoutMs: 100,
      matrixTimeoutMs: 100,
    });
    const err = (await adapter.route([MOSCOW, ZARYADYE]).catch((e) => e)) as GeoError;
    expect(err.code).toBe('NO_ROUTE');
    expect(err.message).toContain('OPENROUTESERVICE_API_KEY');
    expect(calls).toHaveLength(0);
  });

  it('пустой features → NO_ROUTE; без summary → UPSTREAM_INVALID; без геометрии → geometry []', async () => {
    const empty = createFakeFetch(() => jsonResponse({ type: 'FeatureCollection', features: [] }));
    const emptyErr = (await makeAdapter(empty.fetch).route([MOSCOW, ZARYADYE]).catch((e) => e)) as GeoError;
    expect(emptyErr.code).toBe('NO_ROUTE');

    const noSummary = createFakeFetch(() =>
      jsonResponse({ type: 'FeatureCollection', features: [{ properties: {} }] }),
    );
    const invalidErr = (await makeAdapter(noSummary.fetch).route([MOSCOW, ZARYADYE]).catch((e) => e)) as GeoError;
    expect(invalidErr.code).toBe('UPSTREAM_INVALID');

    const noGeometry = createFakeFetch(() =>
      jsonResponse({
        type: 'FeatureCollection',
        features: [{ properties: { summary: { distance: 10, duration: 10 } } }],
      }),
    );
    const segment = await makeAdapter(noGeometry.fetch).route([MOSCOW, ZARYADYE]);
    expect(segment.geometry).toEqual([]);
  });

  it('битые точки геометрии → UPSTREAM_INVALID', async () => {
    const { fetch } = createFakeFetch(() =>
      jsonResponse({
        type: 'FeatureCollection',
        features: [
          {
            geometry: { coordinates: [[37.6, 55.75], ['мусор', 55.76]] },
            properties: { summary: { distance: 10, duration: 10 } },
          },
        ],
      }),
    );
    const err = (await makeAdapter(fetch).route([MOSCOW, ZARYADYE]).catch((e) => e)) as GeoError;
    expect(err.code).toBe('UPSTREAM_INVALID');
  });
});

describe('ORS matrix: чанкинг ≤40 источников + ВСЕ цели', () => {
  const TARGETS: LatLng[] = Array.from({ length: 7 }, (_, i) => [55.70 + i * 0.01, 37.60] as LatLng);

  interface MatrixCall {
    url: string;
    sources: unknown[];
    targets: unknown[];
    locations: unknown[];
  }

  /** 95 источников → чанки 40 + 40 + 15. Ответ детерминирован по (чанк, строка, столбец). */
  function matrixHandler(calls: MatrixCall[]) {
    return createFakeFetch((url, init) => {
      const body = parseBody(init);
      const sources = body.sources as number[];
      // ORS ждёт destinations, не targets (живой запрос: с 'targets' — код 6011)
      const targets = body.destinations as number[];
      const locations = body.locations as number[][];
      calls.push({ url, sources, targets, locations });

      const chunkIndex = calls.length - 1;
      const sourceCount = sources.length;
      const targetCount = targets.length;
      const durations: (number | null)[][] = [];
      const distances: (number | null)[][] = [];
      for (let r = 0; r < sourceCount; r++) {
        const rowD: (number | null)[] = [];
        const rowS: (number | null)[] = [];
        for (let c = 0; c < targetCount; c++) {
          // В чанке №2 unreachable-ячейка (0,0) — null в обеих метриках, как у ORS.
          const unreachable = chunkIndex === 1 && r === 0 && c === 0;
          rowD.push(unreachable ? null : chunkIndex * 1000 + r * 10 + c);
          rowS.push(unreachable ? null : chunkIndex * 1000 + r + c);
        }
        durations.push(rowD);
        distances.push(rowS);
      }
      return jsonResponse({ durations, distances });
    });
  }

  it('3 запроса на 95 источников; индексы в запросе относительные, цели — все каждый раз', async () => {
    const sources: LatLng[] = Array.from({ length: 95 }, (_, i) => [55.50 + i * 0.001, 37.50] as LatLng);
    const calls: MatrixCall[] = [];
    const { fetch } = matrixHandler(calls);

    const cells = await makeAdapter(fetch).matrix(sources, TARGETS);

    expect(calls).toHaveLength(3); // ceil(95 / 40)
    expect(calls.map((c) => c.sources.length)).toEqual([40, 40, 15]);
    // sources — индексы ВНУТРИ locations чанка: [0..len-1]
    expect(calls[0].sources).toEqual(Array.from({ length: 40 }, (_, i) => i));
    expect(calls[2].sources).toEqual(Array.from({ length: 15 }, (_, i) => i));
    // цели в КАЖДОМ запросе все, с относительными индексами [len .. len+T-1]
    expect(cells).toHaveLength(95 * TARGETS.length);
    for (const call of calls) {
      expect(call.targets).toEqual(
        Array.from({ length: TARGETS.length }, (_, i) => call.sources.length + i),
      );
    }
  });

  it('склейка ячеек: глобальный sourceIndex = chunkStart + локальная строка, цель = столбец', async () => {
    const sources: LatLng[] = Array.from({ length: 95 }, (_, i) => [55.50 + i * 0.001, 37.50] as LatLng);
    const calls: MatrixCall[] = [];
    const { fetch } = matrixHandler(calls);
    const cells = await makeAdapter(fetch).matrix(sources, TARGETS);

    expect(cells).toHaveLength(95 * TARGETS.length);

    const at = (s: number, t: number) => cells.find((c) => c.sourceIndex === s && c.targetIndex === t)!;

    // Чанк 0: s=0,t=0 → 0*1000+0*10+0; s=39,t=6 → 39*10+6
    expect(at(0, 0).durationSeconds).toBe(0);
    expect(at(39, 6).durationSeconds).toBe(396);
    // Чанк 1 (chunkStart=40): s=40 → локальная строка 0
    expect(at(40, 1).durationSeconds).toBe(1000 + 1);
    expect(at(59, 3).durationSeconds).toBe(1000 + 19 * 10 + 3);
    // Чанк 2 (chunkStart=80): s=94 → локальная строка 14
    expect(at(94, 6).durationSeconds).toBe(2000 + 14 * 10 + 6);

    // unreachable (чанк 1, строка 0 = s 40, столбец 0) → null и там и там
    expect(at(40, 0).durationSeconds).toBeNull();
    expect(at(40, 0).distanceMeters).toBeNull();
  });

  it('locations запроса = чанк источников + все цели, в порядке [lng, lat]', async () => {
    const sources: LatLng[] = [MOSCOW, ZARYADYE];
    const calls: MatrixCall[] = [];
    const { fetch } = matrixHandler(calls);

    await makeAdapter(fetch).matrix(sources, TARGETS);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${BASE}/v2/matrix/foot-walking`);
    expect(calls[0].sources).toEqual([0, 1]);
    expect(calls[0].targets).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(calls[0].locations).toHaveLength(2 + TARGETS.length);
    // Порядок ORS [lng, lat]: первая локация — округлённая MOSCOW.
    expect(calls[0].locations[0]).toEqual([37.61842, 55.75124]);
  });

  it('повторный вызов с теми же точками попадает в кэш чанков', async () => {
    const sources: LatLng[] = Array.from({ length: 45 }, (_, i) => [55.50 + i * 0.001, 37.50] as LatLng);
    const calls: MatrixCall[] = [];
    const { fetch } = matrixHandler(calls);
    const adapter = makeAdapter(fetch);

    const first = await adapter.matrix(sources, TARGETS);
    const second = await adapter.matrix(sources, TARGETS);

    expect(calls).toHaveLength(2); // 45 → чанки 40+5, второй вызов целиком из кэша
    expect(second).toEqual(first);
  });

  it('новые цели → новые запросы (кэш чанка зависит и от целей)', async () => {
    const sources: LatLng[] = Array.from({ length: 41 }, (_, i) => [55.50 + i * 0.001, 37.50] as LatLng);
    const calls: MatrixCall[] = [];
    const { fetch } = matrixHandler(calls);
    const adapter = makeAdapter(fetch);

    await adapter.matrix(sources, TARGETS);
    await adapter.matrix(sources, TARGETS.slice(0, 3));

    // 41 источник = чанки 40+1; новые цели → оба чанка запрашиваются заново.
    expect(calls).toHaveLength(4);
    // Чанк 40 источников: цели с относительными индексами [40..42].
    expect(calls[2].targets).toEqual([40, 41, 42]);
    // Чанк 1 источника: цели с относительными индексами [1..3].
    expect(calls[3].targets).toEqual([1, 2, 3]);
    expect(calls[3].sources).toEqual([0]);
  });

  it('пустые списки → [] без запросов; нет ключа → NO_ROUTE без запросов', async () => {
    const { fetch, calls } = matrixHandler([]);
    const adapter = makeAdapter(fetch);
    await expect(adapter.matrix([], TARGETS)).resolves.toEqual([]);
    await expect(adapter.matrix([MOSCOW], [])).resolves.toEqual([]);
    expect(calls).toHaveLength(0);

    const noKey = new OrsRoutingAdapter({
      apiKey: '',
      baseUrl: BASE,
      fetchImpl: fetch,
      routeTimeoutMs: 100,
      matrixTimeoutMs: 100,
    });
    const err = (await noKey.matrix([MOSCOW], TARGETS).catch((e) => e)) as GeoError;
    expect(err.code).toBe('NO_ROUTE');
  });

  it('422 матрицы → NO_ROUTE; мусорные durations → UPSTREAM_INVALID', async () => {
    const notFound = createFakeFetch(() => jsonResponse({ error: { code: 2099 } }, 422));
    const err = (await makeAdapter(notFound.fetch).matrix([MOSCOW], TARGETS).catch((e) => e)) as GeoError;
    expect(err.code).toBe('NO_ROUTE');

    const garbage = createFakeFetch(() => jsonResponse({ durations: 'не матрица' }));
    const invalidErr = (await makeAdapter(garbage.fetch).matrix([MOSCOW], TARGETS).catch((e) => e)) as GeoError;
    expect(invalidErr.code).toBe('UPSTREAM_INVALID');
  });

  it('константа лимита чанка = 40', () => {
    expect(MATRIX_SOURCES_PER_REQUEST).toBe(40);
  });
});
