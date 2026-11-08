import { describe, it, expect } from 'vitest';
import { PhotonAdapter, PHOTON_REVERSE_RADIUS_KM } from '@/lib/geo/cloud/photon';
import { GeoError } from '@/lib/geo/types';
import { createFakeFetch, jsonResponse, MOSCOW, ZARYADYE } from './fakes';

const BASE = 'https://photon.komoot.io';

function makeAdapter(fetchImpl: typeof fetch): PhotonAdapter {
  return new PhotonAdapter({ baseUrl: BASE, fetchImpl, timeoutMs: 500 });
}

const cafeFeature = {
  geometry: { coordinates: [37.61842, 55.75124] },
  properties: {
    osm_id: 12345,
    osm_type: 'N',
    osm_key: 'amenity',
    osm_value: 'cafe',
    name: 'Кофейня №1',
    street: 'Никольская',
    housenumber: '10',
    city: 'Москва',
    country: 'Россия',
    distance: 42.5,
  },
};

describe('Photon suggest', () => {
  it('GET /api с bias по точке (lat/lon) и limit', async () => {
    const { fetch, calls } = createFakeFetch(() =>
      jsonResponse({ features: [cafeFeature] }),
    );

    const items = await makeAdapter(fetch).suggest('кофе', MOSCOW);

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.origin + url.pathname).toBe(`${BASE}/api`);
    expect(url.searchParams.get('q')).toBe('кофе');
    expect(url.searchParams.get('limit')).toBe('8');
    expect(url.searchParams.get('lat')).toBe('55.75124');
    expect(url.searchParams.get('lon')).toBe('37.61842');

    expect(items).toEqual([
      {
        title: 'Кофейня №1',
        subtitle: 'Никольская, 10, Москва, Россия',
        coordinates: [55.75124, 37.61842],
      },
    ]);
  });

  it('без near bias-параметров нет', async () => {
    const { fetch, calls } = createFakeFetch(() => jsonResponse({ features: [] }));
    await makeAdapter(fetch).suggest('парк');
    const url = new URL(calls[0].url);
    expect(url.searchParams.has('lat')).toBe(false);
    expect(url.searchParams.has('lon')).toBe(false);
  });

  it('фичи без координат или без имени/улицы отфильтровываются', async () => {
    const { fetch } = createFakeFetch(() =>
      jsonResponse({
        features: [
          { geometry: {}, properties: { name: 'без координат' } },
          { geometry: { coordinates: [37.6, 55.75] }, properties: {} },
          cafeFeature,
        ],
      }),
    );
    const items = await makeAdapter(fetch).suggest('кофе');
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Кофейня №1');
  });

  it('features не массив → UPSTREAM_INVALID; таймаут → UPSTREAM_TIMEOUT', async () => {
    const { fetch } = createFakeFetch(() => jsonResponse({ features: 'мусор' }));
    const err = (await makeAdapter(fetch).suggest('кофе').catch((e) => e)) as GeoError;
    expect(err.code).toBe('UPSTREAM_INVALID');

    const hanging = createFakeFetch(() => new Promise<Response>(() => undefined));
    const timeoutErr = (await makeAdapter(hanging.fetch).suggest('кофе').catch((e) => e)) as GeoError;
    expect(timeoutErr.code).toBe('UPSTREAM_TIMEOUT');
  });
});

describe('Photon reverse', () => {
  it('GET /reverse с radius в километрах; маппинг в ReverseGeocodeResult', async () => {
    const { fetch, calls } = createFakeFetch(() => jsonResponse({ features: [cafeFeature] }));

    const result = await makeAdapter(fetch).reverse(MOSCOW);

    const url = new URL(calls[0].url);
    expect(url.origin + url.pathname).toBe(`${BASE}/reverse`);
    expect(url.searchParams.get('lat')).toBe('55.75124');
    expect(url.searchParams.get('lon')).toBe('37.61842');
    expect(url.searchParams.get('radius')).toBe(String(PHOTON_REVERSE_RADIUS_KM));

    expect(result).toEqual({
      name: 'Кофейня №1',
      address: 'Никольская, 10, Москва, Россия',
      kind: 'cafe',
      distanceMeters: 42.5,
      osmId: 12345,
      osmType: 'N',
      tags: expect.objectContaining({ osm_value: 'cafe', name: 'Кофейня №1' }),
    });
  });

  it('пустой features → null (честное «не знаем»)', async () => {
    const { fetch } = createFakeFetch(() => jsonResponse({ features: [] }));
    await expect(makeAdapter(fetch).reverse(ZARYADYE)).resolves.toBeNull();
  });

  it('фича без координат → UPSTREAM_INVALID', async () => {
    const { fetch } = createFakeFetch(() =>
      jsonResponse({ features: [{ geometry: {}, properties: { name: 'x' } }] }),
    );
    const err = (await makeAdapter(fetch).reverse(MOSCOW).catch((e) => e)) as GeoError;
    expect(err.code).toBe('UPSTREAM_INVALID');
  });
});
