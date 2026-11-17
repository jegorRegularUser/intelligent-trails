// src/lib/geo/__tests__/street-features.test.ts
// Фичи улиц «Улицы с характером» (docs/street-interest-wave.md S1): запрос с
// клипом out geom (s,w,n,e), парсер node/way/relation-outer, клиентские капы,
// кэш CloudProvider (TTL 10 мин + отрицательный 90 с). Всё на фейковом fetch.

import { describe, expect, it } from 'vitest';
import { CloudProvider } from '@/lib/geo/cloud/cloud-provider';
import { GeoError } from '@/lib/geo/types';
import {
  STREET_FEATURES_MAX_ELEMENTS,
  STREET_FEATURES_MAX_POINTS,
  clampStreetRadius,
  parseStreetFeatures,
  streetFeaturesQuery,
} from '@/lib/geo/streetFeatures';
import { createFakeFetch, jsonResponse, MOSCOW } from './fakes';

const MIRRORS = ['https://mirror-a.example/api/interpreter'] as const;

function streetProvider(fetchImpl: typeof fetch): CloudProvider {
  return new CloudProvider({ orsApiKey: '', overpassMirrors: MIRRORS, fetchImpl });
}

function overpassQueryOf(init?: RequestInit): string {
  const body = init?.body;
  expect(typeof body).toBe('string');
  return new URLSearchParams(body as string).get('data') ?? '';
}

function fakeStreetResponse(elements: unknown[]): { fetch: typeof fetch; calls: { url: string; init?: RequestInit }[] } {
  return createFakeFetch(() => jsonResponse({ elements }));
}

/** way-элемент с прямоугольным контуром шириной ~dLat, высотой ~dLng. */
function wayElement(id: number, lat: number, lon: number, sizeDeg = 0.004, tags: Record<string, string> = { leisure: 'park', name: `Парк ${id}` }) {
  return {
    type: 'way',
    id,
    tags,
    geometry: [
      { lat, lon },
      { lat, lon: lon + sizeDeg },
      { lat: lat + sizeDeg, lon: lon + sizeDeg },
      { lat: lat + sizeDeg, lon },
      { lat, lon },
    ],
  };
}

describe('запрос street-features', () => {
  it('строка-снапшот: [timeout:20], statement-bbox, 5 классов union, out geom (s,w,n,e)', () => {
    const query = streetFeaturesQuery(MOSCOW, 1000);
    expect(query).toContain('[out:json][timeout:20];');
    expect(query).toContain('out geom (s,w,n,e);');
    for (const statement of [
      'nwr["leisure"="park"][bbox:',
      'nwr["natural"="wood"][bbox:',
      'nwr["natural"="water"][bbox:',
      'nwr["waterway"~"^(riverbank|canal|stream)$"][bbox:',
      'nwr["highway"="pedestrian"]["name"][bbox:',
      'nwr["place"="square"][bbox:',
      'node["tourism"="viewpoint"][bbox:',
      'node["man_made"="viewpoint"][bbox:',
      'node["tourism"="artwork"][bbox:',
      'node["amenity"="fountain"][bbox:',
      'node["historic"~"^(memorial|monument)$"][bbox:',
    ]) {
      expect(query).toContain(statement);
    }
    // bbox = юг,запад,север,восток — окно радиуса вокруг центра.
    const match = query.match(/\[bbox:([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\]/);
    expect(match).not.toBeNull();
    const [s, w, n, e] = [Number(match![1]), Number(match![2]), Number(match![3]), Number(match![4])];
    expect(s).toBeLessThan(n);
    expect(w).toBeLessThan(e);
    // На широте 55° градус долготы короче градуса широты → спан долгот в
    // ГРАДУСАХ шире, хотя в метрах окно квадратное.
    expect(n - s).toBeLessThan(e - w);
  });

  it('кламп радиуса [500, 3000]: 10 м и 500 → один bbox, 5000 и 30000 → другой', () => {
    expect(streetFeaturesQuery(MOSCOW, 10)).toBe(streetFeaturesQuery(MOSCOW, 500));
    expect(streetFeaturesQuery(MOSCOW, 5000)).toBe(streetFeaturesQuery(MOSCOW, 3000));
    expect(streetFeaturesQuery(MOSCOW, 500)).not.toBe(streetFeaturesQuery(MOSCOW, 3000));
    expect(clampStreetRadius(1234.5)).toBe(1234.5);
  });

  it('не-конечный радиус → INVALID_INPUT до запроса', () => {
    expect(() => clampStreetRadius(Number.NaN)).toThrow(GeoError);
    expect(() => clampStreetRadius(Number.POSITIVE_INFINITY)).toThrow(GeoError);
  });
});

describe('парсер элементов', () => {
  it('node → точка, way → контур с площадью; безымянные не отбрасываются', () => {
    const features = parseStreetFeatures([
      { type: 'node', id: 1, lat: 55.7513, lon: 37.6185, tags: { tourism: 'viewpoint', name: 'Смотровая' } },
      { type: 'node', id: 2, lat: 55.7514, lon: 37.6186, tags: { amenity: 'fountain' } },
      wayElement(10, 55.75, 37.61),
      { type: 'way', id: 11, tags: { natural: 'water', waterway: 'riverbank' }, geometry: [
        { lat: 55.752, lon: 37.62 }, { lat: 55.753, lon: 37.621 }, { lat: 55.754, lon: 37.622 },
      ] },
    ]) as NonNullable<ReturnType<typeof parseStreetFeatures>>;

    expect(features).toHaveLength(4);
    const viewpoint = features.find((f) => f.kind === 'viewpoint');
    expect(viewpoint).toMatchObject({ kind: 'viewpoint', geometry: [[55.7513, 37.6185]], areaMeters: 0, name: 'Смотровая' });
    const fountain = features.find((f) => f.kind === 'art');
    expect(fountain?.name).toBeUndefined(); // без имени — не отбрасывать (S1)
    const park = features.find((f) => f.kind === 'green');
    expect(park?.geometry).toHaveLength(5);
    expect(park!.areaMeters).toBeGreaterThan(100000); // ~0.004° × 0.004° ≈ 25 га
    const bank = features.find((f) => f.kind === 'water');
    expect(bank?.areaMeters).toBe(0); // незамкнутая линия — не полигон
  });

  it('relation: outer-кольца берутся, inner (острова) — мимо; дедуп с way-фичами', () => {
    const features = parseStreetFeatures([
      // Мультиполигон: outer-кольцо + остров (inner) + внешний way-барьер,
      // размеченный и сам по себе (дедуп обязателен, иначе двойной счёт).
      wayElement(10, 55.75, 37.61),
      {
        type: 'relation',
        id: 100,
        tags: { natural: 'water', name: 'Пруд' },
        members: [
          { type: 'way', ref: 10, role: 'outer', geometry: [{ lat: 55.8, lon: 37.7 }, { lat: 55.81, lon: 37.71 }] },
          { type: 'way', ref: 20, role: 'inner', geometry: [{ lat: 55.79, lon: 37.69 }] },
          { type: 'way', ref: 21, role: 'outer', geometry: [{ lat: 55.82, lon: 37.72 }, { lat: 55.83, lon: 37.73 }] },
        ],
      },
    ]) as NonNullable<ReturnType<typeof parseStreetFeatures>>;

    // way/10 — одна фича (из way-элемента, не из member), inner/20 — мимо, outer/21 — вторая.
    expect(features).toHaveLength(2);
    expect(features.every((f) => f.kind === 'water' || f.kind === 'green')).toBe(true);
    expect(features.some((f) => f.name === 'Пруд' && f.geometry[0][0] === 55.82)).toBe(true);
    expect(features.some((f) => f.name === 'Парк 10')).toBe(true);
    const geoms = features.map((f) => f.geometry[0]);
    expect(geoms).not.toContainEqual([55.8, 37.7]); // дедуп member с way-фичей
    expect(geoms).not.toContainEqual([55.79, 37.69]); // остров не попадает
  });

  it('децимация: контур из 200 вершин ресемплируется до ≤ 64 точек по длине', () => {
    const longRing = Array.from({ length: 200 }, (_, i) => ({
      lat: 55.75 + (i % 2) * 0.002,
      lon: 37.61 + i * 0.00005,
    }));
    longRing.push(longRing[0]);
    const features = parseStreetFeatures([
      { type: 'way', id: 1, tags: { leisure: 'park' }, geometry: longRing },
    ]) as NonNullable<ReturnType<typeof parseStreetFeatures>>;
    expect(features).toHaveLength(1);
    expect(features[0].geometry.length).toBeLessThanOrEqual(64);
    expect(features[0].geometry[0]).toEqual([longRing[0].lat, longRing[0].lon]); // ресемпл сохраняет концы
    expect(features[0].areaMeters).toBeGreaterThan(0);
  });
});

describe('клиентские капы (S1, B1)', () => {
  it('элементов > 3000 → частичная деградация: только water/green/pedestrian', () => {
    const elements: unknown[] = [];
    for (let i = 0; i < STREET_FEATURES_MAX_ELEMENTS + 1; i++) {
      elements.push({ type: 'node', id: i, lat: 55.75, lon: 37.61, tags: { amenity: 'fountain', name: `Ф ${i}` } });
      if (i < 100) elements.push({ type: 'node', id: 100000 + i, lat: 55.75, lon: 37.61, tags: { natural: 'water' } });
    }
    const features = parseStreetFeatures(elements) as NonNullable<ReturnType<typeof parseStreetFeatures>>;
    expect(features.every((f) => f.kind === 'water')).toBe(true); // ядро приоритета, art срезан
  });

  it('точек > 50000 → частичная деградация по классам; ядро не влезло → null', () => {
    // Линия из 60000 точек одна — viewpoint/art в сет отсутствуют, деградировать
    // нечем → null.
    const hugeLine = Array.from({ length: STREET_FEATURES_MAX_POINTS + 1000 }, (_, i) => ({
      lat: 55.75 + i * 1e-6,
      lon: 37.61,
    }));
    expect(parseStreetFeatures([{ type: 'way', id: 1, tags: { natural: 'water' }, geometry: hugeLine }])).toBeNull();

    // Ядро (вода ~1000 точек) + украшения (59000 точек) → остаются только ядровые.
    const core = Array.from({ length: 1000 }, (_, i) => ({ lat: 55.75 + i * 1e-6, lon: 37.62 }));
    const decorations = Array.from({ length: STREET_FEATURES_MAX_POINTS - 1000 + 500 }, (_, i) => ({
      lat: 55.76 + i * 1e-6,
      lon: 37.63,
    }));
    const features = parseStreetFeatures([
      { type: 'way', id: 1, tags: { natural: 'water' }, geometry: core },
      { type: 'way', id: 2, tags: { tourism: 'artwork', name: 'Арт' }, geometry: decorations },
    ]) as NonNullable<ReturnType<typeof parseStreetFeatures>>;
    expect(features.map((f) => f.kind)).toEqual(['water']);
  });
});

describe('CloudProvider: кэш street-features (S6)', () => {
  const small = { type: 'node', id: 1, lat: 55.7513, lon: 37.6185, tags: { tourism: 'viewpoint', name: 'Смотровая' } };

  it('успешный ответ (в т.ч. пустой) кэшится: второй вызов без сети', async () => {
    const { fetch, calls } = fakeStreetResponse([small]);
    const provider = streetProvider(fetch);

    const first = await provider.fetchStreetFeatures(MOSCOW, 1000);
    expect(first).toHaveLength(1);
    const second = await provider.fetchStreetFeatures(MOSCOW, 1000);
    expect(second).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });

  it('отказ зеркал → null и отрицательный кэш 90 с: повтор без сети, другой центр — с сетью', async () => {
    const { fetch, calls } = createFakeFetch(() => jsonResponse({}, 500));
    const provider = streetProvider(fetch);

    const failed = await provider.fetchStreetFeatures(MOSCOW, 1000);
    expect(failed).toBeNull();
    expect(await provider.fetchStreetFeatures(MOSCOW, 1000)).toBeNull();
    expect(calls).toHaveLength(MIRRORS.length); // 1 круг зеркал, повтор из кэша

    await provider.fetchStreetFeatures([55.76, 37.62], 1000);
    expect(calls.length).toBeGreaterThan(MIRRORS.length); // другой ключ кэша — сеть
  });

  it('клампнутый радиус — один ключ кэша: 5000 и 6000 м делят ответ', async () => {
    const { fetch, calls } = fakeStreetResponse([]);
    const provider = streetProvider(fetch);

    await provider.fetchStreetFeatures(MOSCOW, 5000);
    await provider.fetchStreetFeatures(MOSCOW, 6000);
    expect(calls).toHaveLength(1);
  });
});
