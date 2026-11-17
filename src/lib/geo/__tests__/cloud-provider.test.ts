import { describe, it, expect } from 'vitest';
import { CloudProvider } from '@/lib/geo/cloud/cloud-provider';
import { GeoError } from '@/lib/geo/types';
import { createFakeFetch, jsonResponse, parseBody, FakeFetch, MOSCOW, ZARYADYE } from './fakes';

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

const MIRRORS = ['https://mirror-a.example/api/interpreter'] as const;

const OSRM_ROUTE = {
  code: 'Ok',
  routes: [
    {
      legs: [{ duration: 80, distance: 100 }],
      duration: 80,
      distance: 100,
      geometry: { coordinates: [[37.6184, 55.7512]] },
    },
  ],
};

/** Один fake fetch на все апстримы: роутинг по хосту. */
function world(handlers: {
  ors?: (url: string, body: Record<string, unknown>) => Response;
  osrm?: (url: string) => Response;
  photon?: (url: string) => Response;
  nominatim?: (url: string) => Response;
  overpass?: (url: string) => Response;
}): FakeFetch {
  return createFakeFetch((url) => {
    if (url.startsWith('https://api.openrouteservice.org')) {
      throw new Error('ORS не должен вызываться в этом сценарии');
    }
    if (url.startsWith('https://routing.openstreetmap.de')) {
      if (!handlers.osrm) throw new Error('OSRM не должен вызываться в этом сценарии');
      return handlers.osrm(url);
    }
    if (url.startsWith('https://photon.komoot.io')) return handlers.photon?.(url) ?? jsonResponse({ features: [] });
    if (url.startsWith('https://nominatim.openstreetmap.org')) return handlers.nominatim?.(url) ?? jsonResponse([]);
    if (url.includes('mirror-')) return handlers.overpass?.(url) ?? jsonResponse({ elements: [] });
    throw new Error(`неожиданный апстрим: ${url}`);
  });
}

/** Провайдер с короткими таймаутами/интервалом Nominatim — тесты не ждут секунд. */
function makeProvider(fake: FakeFetch, orsApiKey = 'test-key'): CloudProvider {
  return new CloudProvider({
    orsApiKey,
    overpassMirrors: MIRRORS,
    nominatimMinIntervalMs: 20,
    fetchImpl: fake.fetch,
  });
}

describe('валидация входов — до сети', () => {
  const cases: Array<[string, (provider: CloudProvider) => Promise<unknown>]> = [
    ['route: нечисловая широта', (p) => p.route({ waypoints: [[Number.NaN, 37.6], ZARYADYE] })],
    ['route: один waypoint', (p) => p.route({ waypoints: [MOSCOW] })],
    ['route: широта > 90', (p) => p.route({ waypoints: [[91, 37.6], ZARYADYE] })],
    ['route: долгота < -180', (p) => p.route({ waypoints: [MOSCOW, [55.7, -181]] })],
    ['route: бесконечность', (p) => p.route({ waypoints: [[55.7, Number.POSITIVE_INFINITY], ZARYADYE] })],
    ['route: alternatives 3', (p) => p.route({ waypoints: [MOSCOW, ZARYADYE], alternatives: 3 })],
    ['matrix: NaN в источнике', (p) => p.matrix([[Number.NaN, 37.6]], [ZARYADYE])],
    ['matrix: NaN в цели', (p) => p.matrix([MOSCOW], [[55.7, Number.NaN]])],
    ['searchPlaces: плохой center', (p) => p.searchPlaces([200, 200], 'cafe')],
    ['searchPlaces: плохой toward', (p) => p.searchPlaces(MOSCOW, 'cafe', { toward: [91, 0] })],
    ['reverseGeocode: плохая точка', (p) => p.reverseGeocode([Number.NaN, 0])],
    ['suggest: плохой near', (p) => p.suggest('кофе', [0, 999])],
    ['isFastArea: плохая точка', (p) => p.isFastArea([1000, 0])],
  ];

  for (const [name, run] of cases) {
    it(`${name} → INVALID_INPUT, апстримы не вызываются`, async () => {
      const fake = world({
        ors: () => jsonResponse(ORS_ROUTE),
        overpass: () => jsonResponse({ elements: [] }),
      });
      const provider = makeProvider(fake);

      const err = (await run(provider).catch((e) => e)) as GeoError;
      expect(err).toBeInstanceOf(GeoError);
      expect(err.code).toBe('INVALID_INPUT');
      expect(fake.calls).toHaveLength(0);
    });
  }

  it('matrix с пустыми списками → [] без сети; suggest с пустой строкой → []', async () => {
    const fake = world({});
    const provider = makeProvider(fake);
    await expect(provider.matrix([], [])).resolves.toEqual([]);
    await expect(provider.suggest('   ')).resolves.toEqual([]);
    expect(fake.calls).toHaveLength(0);
  });

  it('isFastArea валидная точка → всегда false (пакетный тир позже)', async () => {
    const fake = world({});
    const provider = makeProvider(fake);
    await expect(provider.isFastArea(MOSCOW)).resolves.toBe(false);
    expect(fake.calls).toHaveLength(0);
  });
});

describe('нет ключа ORS (ADR-004: OSRM — первичный роутер)', () => {
  it('route уходит в OSRM, ORS не дёргается', async () => {
    const fake = world({ osrm: () => jsonResponse(OSRM_ROUTE) });
    const provider = makeProvider(fake, '');
    const segment = await provider.route({ waypoints: [MOSCOW, ZARYADYE] });
    expect(segment.source).toBe('osrm');
    expect(fake.calls).toHaveLength(1);
    expect(new URL(fake.calls[0].url).host).toBe('routing.openstreetmap.de');
  });

  it('matrix уходит в OSRM, ORS не дёргается', async () => {
    const fake = world({
      osrm: () => jsonResponse({ code: 'Ok', durations: [[42]], distances: [[60]] }),
    });
    const provider = makeProvider(fake, '');
    const cells = await provider.matrix([MOSCOW], [ZARYADYE]);
    expect(cells).toEqual([
      { sourceIndex: 0, targetIndex: 0, durationSeconds: 42, distanceMeters: 60 },
    ]);
    expect(fake.calls).toHaveLength(1);
    expect(new URL(fake.calls[0].url).host).toBe('routing.openstreetmap.de');
  });
});

describe('кэши провайдера', () => {
  it('повторный route по тем же точкам бьёт в кэш', async () => {
    let orsCalls = 0;
    const fake = createFakeFetch(() => {
      orsCalls++;
      return jsonResponse(ORS_ROUTE);
    });
    const provider = makeProvider(fake);

    const first = await provider.route({ waypoints: [MOSCOW, ZARYADYE] });
    const second = await provider.route({ waypoints: [MOSCOW, ZARYADYE] });

    expect(orsCalls).toBe(1);
    expect(second).toEqual(first);
  });

  it('ошибка маршрута не кэшируется', async () => {
    let respondOk = false;
    const fake = createFakeFetch(() => (respondOk ? jsonResponse(ORS_ROUTE) : jsonResponse({}, 503)));
    const provider = makeProvider(fake);

    await expect(provider.route({ waypoints: [MOSCOW, ZARYADYE] })).rejects.toBeInstanceOf(GeoError);
    respondOk = true;
    await expect(provider.route({ waypoints: [MOSCOW, ZARYADYE] })).resolves.toBeTruthy();
  });

  it('searchPlaces кэширует и непустой, и пустой ответ', async () => {
    const fake = world({ overpass: () => jsonResponse({ elements: [{ type: 'node', id: 1, lat: 55.7513, lon: 37.6185, tags: { amenity: 'cafe', name: 'Кафе' } }] }) });
    const provider = makeProvider(fake);

    const first = await provider.searchPlaces(MOSCOW, 'cafe', { radiusMeters: 200 });
    const second = await provider.searchPlaces(MOSCOW, 'cafe', { radiusMeters: 200 });
    expect(fake.calls).toHaveLength(1);
    expect(second).toEqual(first);

    const emptyFake = world({ overpass: () => jsonResponse({ elements: [] }) });
    const emptyProvider = makeProvider(emptyFake);
    await emptyProvider.searchPlaces(MOSCOW, 'cafe');
    // Пусто на всех радиусах эскалации — это 4 запроса, но ответ кэшируется.
    await emptyProvider.searchPlaces(MOSCOW, 'cafe');
    expect(emptyFake.calls).toHaveLength(4);
  });
});

describe('alternatives: кэш-ключ с alternatives и routeAlternatives (R3.a)', () => {
  it('route с alternatives и без — разные кэш-ключи: два сетевых вызова', async () => {
    let orsCalls = 0;
    const fake = createFakeFetch(() => {
      orsCalls++;
      return jsonResponse(ORS_ROUTE);
    });
    const provider = makeProvider(fake);

    await provider.route({ waypoints: [MOSCOW, ZARYADYE], alternatives: 2 });
    await provider.route({ waypoints: [MOSCOW, ZARYADYE] });
    expect(orsCalls).toBe(2); // без alternatives в ключе второй ответ попал бы в чужой кэш

    // Повторы — из кэша.
    await provider.route({ waypoints: [MOSCOW, ZARYADYE], alternatives: 2 });
    await provider.route({ waypoints: [MOSCOW, ZARYADYE] });
    expect(orsCalls).toBe(2);
  });

  it('routeAlternatives: массив, отдельный кэш, target_count = alternatives+1', async () => {
    const fake = createFakeFetch(() =>
      jsonResponse({
        type: 'FeatureCollection',
        features: [ORS_ROUTE.features[0], { ...ORS_ROUTE.features[0], properties: { summary: { distance: 500, duration: 400 } } }],
      }),
    );
    const provider = makeProvider(fake);

    const first = await provider.routeAlternatives({ waypoints: [MOSCOW, ZARYADYE] });
    const second = await provider.routeAlternatives({ waypoints: [MOSCOW, ZARYADYE] });

    expect(fake.calls).toHaveLength(1); // повтор из кэша
    expect(first).toHaveLength(2);
    expect(first[0].distanceMeters).toBe(100); // основной первым
    expect(first[1].distanceMeters).toBe(500);
    expect(second).toEqual(first);
    // Дефолт 2 → target_count 3 (включая основной) — потолок контракта ORS.
    const body = parseBody(fake.calls[0].init);
    expect(body.alternative_routes).toEqual({ target_count: 3, share_factor: 0.6, weight_factor: 1.3 });
  });

  it('routeAlternatives с alternatives: 1 → target_count 2', async () => {
    const fake = createFakeFetch(() =>
      jsonResponse({ type: 'FeatureCollection', features: [ORS_ROUTE.features[0]] }),
    );
    const provider = makeProvider(fake);
    await provider.routeAlternatives({ waypoints: [MOSCOW, ZARYADYE], alternatives: 1 });
    expect(parseBody(fake.calls[0].init).alternative_routes).toEqual({
      target_count: 2,
      share_factor: 0.6,
      weight_factor: 1.3,
    });
  });

  it('routeAlternatives: alternatives 3 → INVALID_INPUT до сети', async () => {
    const fake = createFakeFetch(() => jsonResponse(ORS_ROUTE));
    const provider = makeProvider(fake);
    const err = (await provider
      .routeAlternatives({ waypoints: [MOSCOW, ZARYADYE], alternatives: 3 })
      .catch((e) => e)) as GeoError;
    expect(err.code).toBe('INVALID_INPUT');
    expect(fake.calls).toHaveLength(0);
  });
});

describe('лестница геокодинга: Photon → Nominatim', () => {
  it('Photon упал → Nominatim отвечает за reverse', async () => {
    const fake = world({
      photon: () => jsonResponse({}, 500),
      nominatim: () =>
        jsonResponse({ display_name: 'Красная площадь, Москва', type: 'square', osm_type: 'way', osm_id: 42 }),
    });
    const provider = makeProvider(fake);

    const result = await provider.reverseGeocode(MOSCOW);
    expect(result?.address).toContain('Красная площадь');
    expect(fake.calls.map((c) => new URL(c.url).host)).toEqual(['photon.komoot.io', 'nominatim.openstreetmap.org']);
  });

  it('оба геокодера упали → GeoError наверх (лежка ≠ «здесь пусто»)', async () => {
    const fake = world({
      photon: () => jsonResponse({}, 500),
      nominatim: () => jsonResponse({}, 500),
    });
    const provider = makeProvider(fake);
    const err = (await provider.reverseGeocode(MOSCOW).catch((e) => e)) as GeoError;
    expect(err.code).toBe('UPSTREAM_UNAVAILABLE');
  });

  it('Photon пусто, Nominatim «Unable to geocode» → null (и кэш null)', async () => {
    const fake = world({
      photon: () => jsonResponse({ features: [] }),
      nominatim: () => jsonResponse({ error: 'Unable to geocode' }),
    });
    const provider = makeProvider(fake);

    await expect(provider.reverseGeocode(MOSCOW)).resolves.toBeNull();
    await provider.reverseGeocode(MOSCOW);
    expect(fake.calls).toHaveLength(2); // второй раз — из кэша
  });

  it('suggest: Photon пусто → Nominatim; оба пусто → []', async () => {
    const fake = world({
      photon: () => jsonResponse({ features: [] }),
      nominatim: () => jsonResponse([{ display_name: 'Зарядье, Москва', lat: '55.751', lon: '37.63' }]),
    });
    const provider = makeProvider(fake);
    const items = await provider.suggest('зарядье', MOSCOW);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Зарядье');

    const bothEmpty = world({
      photon: () => jsonResponse({ features: [] }),
      nominatim: () => jsonResponse([]),
    });
    const emptyProvider = makeProvider(bothEmpty);
    await expect(emptyProvider.suggest('нонсенс')).resolves.toEqual([]);
  });

  it('suggest: оба упали → GeoError', async () => {
    const fake = world({
      photon: () => jsonResponse({}, 503),
      nominatim: () => jsonResponse({}, 503),
    });
    const provider = makeProvider(fake);
    const err = (await provider.suggest('кофе').catch((e) => e)) as GeoError;
    expect(err.code).toBe('UPSTREAM_UNAVAILABLE');
  });
});

describe('сквозной CloudProvider', () => {
  it('route доходит до ORS с округлёнными [lng, lat] и ключом', async () => {
    const fake = createFakeFetch(() => jsonResponse(ORS_ROUTE));
    const provider = makeProvider(fake);

    const segment = await provider.route({ waypoints: [MOSCOW, ZARYADYE] });

    expect(segment.source).toBe('cloud');
    expect(fake.calls).toHaveLength(1);
    const body = parseBody(fake.calls[0].init);
    expect(body.coordinates).toEqual([
      [37.61842, 55.75124],
      [37.62979, 55.75103],
    ]);
  });

  it('searchPlaces на облачном тире ищет через Overpass', async () => {
    const fake = world({
      overpass: () =>
        jsonResponse({ elements: [{ type: 'node', id: 9, lat: 55.7513, lon: 37.6185, tags: { amenity: 'cafe', name: 'Кафе у Кремля' } }] }),
    });
    const provider = makeProvider(fake);

    const places = await provider.searchPlaces(MOSCOW, 'cafe', { radiusMeters: 300, limit: 5 });
    expect(places).toHaveLength(1);
    expect(places[0].category).toBe('cafe');
    expect(fake.calls[0].url).toBe(MIRRORS[0]);
  });
});
