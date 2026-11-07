import { describe, it, expect } from 'vitest';
import {
  NominatimAdapter,
  RateLimiter,
  NOMINATIM_SUGGEST_LIMIT,
} from '@/lib/geo/cloud/nominatim';
import { GeoError } from '@/lib/geo/types';
import { createFakeFetch, jsonResponse, MOSCOW, RecordedCall } from './fakes';

const BASE = 'https://nominatim.openstreetmap.org';
const UA = 'IntelligentTrails/1.0 (geo-provider; https://github.com/intelligent-trails)';

function makeAdapter(fetchImpl: typeof fetch, minIntervalMs = 1000): NominatimAdapter {
  return new NominatimAdapter({
    baseUrl: BASE,
    userAgent: UA,
    minIntervalMs,
    fetchImpl,
    timeoutMs: 500,
  });
}

function callHeaders(call: RecordedCall): Record<string, string> {
  return (call.init?.headers ?? {}) as Record<string, string>;
}

describe('RateLimiter', () => {
  it('параллельные вызовы получают слоты через minInterval (0, 1000, 2000)', async () => {
    const waits: number[] = [];
    const limiter = new RateLimiter(1000, async (ms) => { waits.push(ms); }, () => 0);

    await Promise.all([limiter.acquire(), limiter.acquire(), limiter.acquire()]);

    expect(waits).toEqual([0, 1000, 2000]);
  });

  it('после простоя лишнего ожидания нет', async () => {
    let t = 0;
    const waits: number[] = [];
    const limiter = new RateLimiter(1000, async (ms) => { waits.push(ms); }, () => t);

    await limiter.acquire(); // слот в t=0
    t = 5000;
    await limiter.acquire(); // слот давно истёк — 0 мс ожидания

    expect(waits).toEqual([0, 0]);
  });

  it('реальный интервал соблюдается между стартами запросов', async () => {
    const stamps: number[] = [];
    const { fetch } = createFakeFetch(() => {
      stamps.push(Date.now());
      return jsonResponse([]);
    });
    const adapter = makeAdapter(fetch, 200); // уменьшенный интервал — тест быстрый

    await adapter.suggest('кофе');
    await adapter.suggest('парк');

    expect(stamps).toHaveLength(2);
    // Точная гарантия доказана фейк-клоком выше; здесь проверяем, что пауза
    // реально прожидаётся: без лимитера зазор был бы ~0. Нижняя граница
    // свободная — event loop может опоздать и со штампом первого запроса.
    expect(stamps[1] - stamps[0]).toBeGreaterThanOrEqual(100);
  });
});

describe('Nominatim reverse', () => {
  it('GET /reverse с jsonv2, zoom=18 и обязательным User-Agent', async () => {
    const { fetch, calls } = createFakeFetch(() =>
      jsonResponse({
        name: 'Красная площадь',
        display_name: 'Красная площадь, Китай-город, Москва, ЦФО, 109012, Россия',
        category: 'historic',
        type: 'square',
        osm_type: 'way',
        osm_id: 4055044,
        address: { city: 'Москва', country: 'Россия' },
      }),
    );

    const result = await makeAdapter(fetch).reverse(MOSCOW);

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.origin + url.pathname).toBe(`${BASE}/reverse`);
    expect(url.searchParams.get('format')).toBe('jsonv2');
    expect(url.searchParams.get('lat')).toBe('55.75124');
    expect(url.searchParams.get('lon')).toBe('37.61842');
    expect(url.searchParams.get('zoom')).toBe('18');
    expect(callHeaders(calls[0])['User-Agent']).toBe(UA);

    expect(result).toEqual({
      name: 'Красная площадь',
      address: 'Красная площадь, Китай-город, Москва, ЦФО, 109012, Россия',
      kind: 'square',
      osmId: 4055044,
      osmType: 'W',
      tags: { city: 'Москва', country: 'Россия' },
    });
  });

  it('{"error": "Unable to geocode"} → null (честное «пусто»)', async () => {
    const { fetch } = createFakeFetch(() => jsonResponse({ error: 'Unable to geocode' }));
    await expect(makeAdapter(fetch).reverse(MOSCOW)).resolves.toBeNull();
  });

  it('нет display_name → UPSTREAM_INVALID', async () => {
    const { fetch } = createFakeFetch(() => jsonResponse({ place_id: 1 }));
    const err = (await makeAdapter(fetch).reverse(MOSCOW).catch((e) => e)) as GeoError;
    expect(err.code).toBe('UPSTREAM_INVALID');
  });
});

describe('Nominatim suggest', () => {
  it('GET /search с viewbox-bias при near', async () => {
    const { fetch, calls } = createFakeFetch(() =>
      jsonResponse([
        { name: 'Зарядье', display_name: 'Парк «Зарядье», Москва, Россия', lat: '55.7510', lon: '37.6298' },
      ]),
    );

    const items = await makeAdapter(fetch).suggest('зарядье', MOSCOW);

    const url = new URL(calls[0].url);
    expect(url.origin + url.pathname).toBe(`${BASE}/search`);
    expect(url.searchParams.get('format')).toBe('jsonv2');
    expect(url.searchParams.get('q')).toBe('зарядье');
    expect(url.searchParams.get('limit')).toBe(String(NOMINATIM_SUGGEST_LIMIT));
    expect(url.searchParams.get('viewbox')).toBeTruthy();

    expect(items).toEqual([
      {
        title: 'Зарядье',
        subtitle: 'Парк «Зарядье», Москва, Россия',
        coordinates: [55.751, 37.6298],
      },
    ]);
  });

  it('элементы без координат/display_name отфильтровываются; пустой массив → []', async () => {
    const { fetch } = createFakeFetch(() =>
      jsonResponse([{ lat: 'bad', lon: '37.6', display_name: 'x' }, { lat: '55.7', lon: '37.6' }]),
    );
    await expect(makeAdapter(fetch).suggest('x')).resolves.toEqual([]);

    const empty = createFakeFetch(() => jsonResponse([]));
    await expect(makeAdapter(empty.fetch).suggest('x')).resolves.toEqual([]);
  });

  it('не-массив ответа → UPSTREAM_INVALID', async () => {
    const { fetch } = createFakeFetch(() => jsonResponse({ weird: true }));
    const err = (await makeAdapter(fetch).suggest('x').catch((e) => e)) as GeoError;
    expect(err.code).toBe('UPSTREAM_INVALID');
  });
});
