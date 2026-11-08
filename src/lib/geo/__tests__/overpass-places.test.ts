import { describe, it, expect } from 'vitest';
import { OverpassPlacesAdapter, corridorSearchPoints } from '@/lib/geo/cloud/overpass-places';
import { GeoError } from '@/lib/geo/types';
import { createFakeFetch, jsonResponse, MOSCOW, ZARYADYE } from './fakes';

const MIRRORS = [
  'https://mirror-a.example/api/interpreter',
  'https://mirror-b.example/api/interpreter',
  'https://mirror-c.example/api/interpreter',
] as const;

function makeAdapter(
  fetchImpl: typeof fetch,
  mirrors: readonly string[] = MIRRORS,
): OverpassPlacesAdapter {
  return new OverpassPlacesAdapter({
    mirrors,
    userAgent: 'IntelligentTrails/1.0 (geo-provider; https://github.com/intelligent-trails)',
    fetchImpl,
    timeoutMs: 500,
  });
}

function overpassQueryOf(init?: RequestInit): string {
  const body = init?.body;
  expect(typeof body).toBe('string');
  return new URLSearchParams(body as string).get('data') ?? '';
}

function cafeElement(id: number, lat: number, lon: number, name = `Кафе ${id}`) {
  return { type: 'node', id, lat, lon, tags: { amenity: 'cafe', name } };
}

describe('запрос Overpass', () => {
  it('POST на зеркало, form-urlencoded, тег из constants/categories.ts, радиус и центр в query', async () => {
    const { fetch, calls } = createFakeFetch(() => jsonResponse({ elements: [cafeElement(1, 55.7513, 37.6185)] }));
    const places = await makeAdapter(fetch).searchPlaces(MOSCOW, 'cafe', { radiusMeters: 200 });

    expect(calls).toHaveLength(1); // radiusMeters пиннит один радиус — без эскалации
    expect(calls[0].url).toBe(MIRRORS[0]);
    expect(calls[0].init?.method).toBe('POST');
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(headers['User-Agent']).toContain('IntelligentTrails');

    const query = overpassQueryOf(calls[0].init);
    expect(query).toContain('[out:json][timeout:12];');
    expect(query).toContain('nwr["amenity"="cafe"](around:200,55.75124,37.61842)');
    expect(query).toContain('out center;');

    expect(places).toHaveLength(1);
    expect(places[0]).toMatchObject({
      id: 'node/1',
      name: 'Кафе 1',
      category: 'cafe',
      coordinates: [55.7513, 37.6185],
      rating: undefined,
      indoor: undefined,
    });
  });

  it('парк: запрос тянет и park, и public garden; «сквер» без «парк» отсеивается', async () => {
    const { fetch, calls } = createFakeFetch(() =>
      jsonResponse({
        elements: [
          { type: 'way', id: 1, center: { lat: 55.7513, lon: 37.6185 }, tags: { leisure: 'park', name: 'Сквер Дружбы' } },
          { type: 'way', id: 2, center: { lat: 55.7514, lon: 37.6186 }, tags: { leisure: 'park', name: 'Парк Горького' } },
          { type: 'way', id: 3, center: { lat: 55.7515, lon: 37.6187 }, tags: { leisure: 'garden', 'garden:type': 'public', name: 'Сад Эрмитаж' } },
          { type: 'way', id: 4, center: { lat: 55.7516, lon: 37.6188 }, tags: { leisure: 'garden', name: 'Закрытый сад' } },
        ],
      }),
    );
    const places = await makeAdapter(fetch).searchPlaces(MOSCOW, 'park');

    const query = overpassQueryOf(calls[0].init);
    expect(query).toContain('nwr["leisure"="park"](around:300,55.75124,37.61842)');
    expect(query).toContain('nwr["leisure"="garden"]["garden:type"="public"](around:300,55.75124,37.61842)');

    const names = places.map((p) => p.name);
    expect(names).toContain('Парк Горького');
    expect(names).toContain('Сад Эрмитаж');
    expect(names).not.toContain('Сквер Дружбы');
    expect(names).not.toContain('Закрытый сад');
  });

  it('неизвестная категория → INVALID_INPUT без похода в сеть', async () => {
    const { fetch, calls } = createFakeFetch(() => jsonResponse({ elements: [] }));
    const err = (await makeAdapter(fetch).searchPlaces(MOSCOW, 'бомбоубежище').catch((e) => e)) as GeoError;
    expect(err.code).toBe('INVALID_INPUT');
    expect(calls).toHaveLength(0);
  });
});

describe('эскалация радиуса и коридор', () => {
  it('пустые радиусы 200/700 → запрос на 2000; то же зеркало (это не ошибка зеркала)', async () => {
    const { fetch, calls } = createFakeFetch(() =>
      calls.length < 2
        ? jsonResponse({ elements: [] })
        : jsonResponse({ elements: [cafeElement(7, 55.7513, 37.6185)] }),
    );

    const places = await makeAdapter(fetch).searchPlaces(MOSCOW, 'cafe');

    expect(places).toHaveLength(1);
    expect(calls).toHaveLength(4); // все радиусы кафе: 200, 700, 2000, 5000
    expect(calls.map((c) => c.url)).toEqual([MIRRORS[0], MIRRORS[0], MIRRORS[0], MIRRORS[0]]);
    const radiuses = calls.map((c) => overpassQueryOf(c.init).match(/around:(\d+)/)?.[1]);
    expect(radiuses).toEqual(['200', '700', '2000', '5000']);
  });

  it('коридорный поиск: центр, середина, toward — три центра в запросах', async () => {
    // Один радиус (radiusMeters) + мало результатов на центр → коридор
    // проходит все три точки.
    const { fetch, calls } = createFakeFetch(() =>
      jsonResponse({ elements: [cafeElement(1, 55.7513, 37.6185)] }),
    );

    await makeAdapter(fetch).searchPlaces(MOSCOW, 'cafe', { toward: ZARYADYE, radiusMeters: 200 });

    expect(calls).toHaveLength(3);
    const centers = calls.map((c) => overpassQueryOf(c.init).match(/around:200,([\d.]+),([\d.]+)/));
    expect(centers[0]?.[1]).toBe('55.75124');
    expect(centers[1]?.[1]).toBe('55.75114'); // середина коридора (округлена)
    expect(centers[2]?.[1]).toBe('55.75103');
  });

  it('corridorSearchPoints: без toward — одна точка', () => {
    expect(corridorSearchPoints(MOSCOW)).toEqual([MOSCOW]);
    expect(corridorSearchPoints(MOSCOW, ZARYADYE)).toHaveLength(3);
  });
});

describe('маппинг элементов', () => {
  it('безымянные, без координат и за радиусом — мимо; сортировка по удалённости; limit', async () => {
    const { fetch } = createFakeFetch(() =>
      jsonResponse({
        elements: [
          cafeElement(1, 55.75130, 37.61850), // ~7 м
          { type: 'node', id: 2, lat: 55.75131, lon: 37.61851, tags: { amenity: 'cafe' } }, // без имени
          { type: 'node', id: 3, tags: { amenity: 'cafe', name: 'нет координат' } },
          cafeElement(4, 55.76000, 37.63000, 'Далеко за радиусом'), // > 200 м
          cafeElement(5, 55.75126, 37.61845, 'Ближе всех'),
        ],
      }),
    );

    const places = await makeAdapter(fetch).searchPlaces(MOSCOW, 'cafe', { radiusMeters: 200, limit: 2 });

    expect(places.map((p) => p.name)).toEqual(['Ближе всех', 'Кафе 1']);
  });

  it('дедуп по id и по имени; rating и address из тегов; indoor-эвристика', async () => {
    const { fetch } = createFakeFetch(() =>
      jsonResponse({
        elements: [
          { type: 'node', id: 1, lat: 55.7513, lon: 37.6185, tags: { amenity: 'cafe', name: 'Кофейня', 'addr:street': 'Никольская', 'addr:housenumber': '10', rating: '4.5', indoor: 'yes' } },
          { type: 'node', id: 1, lat: 55.7513, lon: 37.6185, tags: { amenity: 'cafe', name: 'Кофейня' } }, // дубликат id (в другом радиусе)
          { type: 'node', id: 2, lat: 55.75131, lon: 37.61851, tags: { amenity: 'cafe', name: 'кофейня' } }, // дубликат имени
        ],
      }),
    );

    // Один запрос на большой радиус, чтобы оба элемента пришли вместе.
    const places = await makeAdapter(fetch).searchPlaces(MOSCOW, 'cafe', { radiusMeters: 200 });

    expect(places).toHaveLength(1);
    expect(places[0]).toMatchObject({
      id: 'node/1',
      address: 'Никольская, 10',
      rating: 4.5,
      indoor: true,
    });
  });
});

describe('зеркала', () => {
  it('первое зеркало упало (500) → один круг по остальным; победитель становится sticky', async () => {
    const { fetch, calls } = createFakeFetch((url) =>
      url.startsWith(MIRRORS[0]) ? jsonResponse({}, 500) : jsonResponse({ elements: [cafeElement(1, 55.7513, 37.6185)] }),
    );
    const adapter = makeAdapter(fetch);

    const places = await adapter.searchPlaces(MOSCOW, 'cafe', { radiusMeters: 200 });
    expect(places).toHaveLength(1);
    // a упал, затем гонка стреляет по b и c одновременно.
    expect(calls).toHaveLength(3);
    expect(calls[0].url).toBe(MIRRORS[0]);

    // Повтор: только sticky-зеркало.
    await adapter.searchPlaces(MOSCOW, 'cafe', { radiusMeters: 200 });
    expect(calls).toHaveLength(4);
    expect(calls[3].url).not.toBe(MIRRORS[0]);
  });

  it('все зеркала лежат (5xx) → UPSTREAM_UNAVAILABLE; вызовов = числу зеркал', async () => {
    const { fetch, calls } = createFakeFetch(() => jsonResponse({}, 500));
    const err = (await makeAdapter(fetch).searchPlaces(MOSCOW, 'cafe').catch((e) => e)) as GeoError;
    expect(err.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(calls).toHaveLength(MIRRORS.length);
  });

  it('все зеркала вернули мусор (200 без elements) → UPSTREAM_INVALID', async () => {
    const { fetch } = createFakeFetch(() => jsonResponse({ elements: 'не массив' }));
    const err = (await makeAdapter(fetch).searchPlaces(MOSCOW, 'cafe').catch((e) => e)) as GeoError;
    expect(err.code).toBe('UPSTREAM_INVALID');
  });

  it('частичный результат до падения зеркала возвращается, а не роняется', async () => {
    let queryCount = 0;
    const { fetch } = createFakeFetch(() => {
      queryCount++;
      if (queryCount === 1) return jsonResponse({ elements: [cafeElement(1, 55.7513, 37.6185), cafeElement(2, 55.75131, 37.61851)] });
      return jsonResponse({}, 500); // эскалация радиуса упала
    });

    const places = await makeAdapter(fetch).searchPlaces(MOSCOW, 'cafe');
    expect(places).toHaveLength(2);
  });
});
