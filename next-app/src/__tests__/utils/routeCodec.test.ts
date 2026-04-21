import { describe, it, expect } from 'vitest';
import { encodeRouteToUrl, decodeRouteFromUrl } from '@/utils/routeCodec';
import type { RoutingMode } from '@/types/map';

function makeRouteData() {
  return {
    startPoint: [55.7558123, 37.6176234] as [number, number],
    startPointName: 'Точка старта',
    startPointAddress: 'Должен быть отброшен',
    startTransport: 'pedestrian' as RoutingMode,
    waypoints: [
      {
        id: 'wp-1',
        type: 'category',
        value: 'cafe',
        originalCategory: 'cafe',
        resolvedName: 'Кафе №1',
        coords: [55.7559, 37.618] as [number, number],
        address: 'Улица Пушкина 1',
        duration: 60,
        modeToNext: 'pedestrian' as RoutingMode,
        selectedAlternativeIndex: 1,
        alternatives: [
          { id: 1, name: 'Alt1', category: 'cafe', coordinates: [55.75591, 37.61801] as [number, number], address: 'a1' },
          { id: 2, name: 'Alt2', category: 'cafe', coordinates: [55.75592, 37.61802] as [number, number], address: 'a2' },
        ],
      },
      {
        id: 'wp-2',
        type: 'address',
        value: 'Текст адреса',
        resolvedName: 'Фактическое имя',
        coords: [55.7561, 37.619] as [number, number],
        duration: 15,
        modeToNext: 'auto' as RoutingMode,
      },
    ],
    endPoint: [55.7568123, 37.6206234] as [number, number],
    endPointType: 'category',
    endPointCategory: 'park',
    endPointName: 'Парк',
    endPointAddress: 'Должен быть отброшен',
  };
}

describe('routeCodec v2', () => {
  it('encodes to v2 prefix and decodes required fields', () => {
    const data = makeRouteData();

    const encoded = encodeRouteToUrl(data);
    expect(encoded.startsWith('2.')).toBe(true);

    const decoded = decodeRouteFromUrl(encoded);
    expect(decoded).toBeTruthy();

    expect(decoded.startPoint).toEqual(expect.any(Array));
    expect(decoded.startPointName).toBe('Точка старта');
    expect(decoded.startTransport).toBe('pedestrian');

    expect(decoded.endPointType).toBe('category');
    expect(decoded.endPointCategory).toBe('park');
    expect(decoded.endPointName).toBe('Парк');

    expect(decoded.waypoints).toHaveLength(2);
    expect(decoded.waypoints[0].type).toBe('category');
    expect(decoded.waypoints[0].originalCategory).toBe('cafe');
    expect(decoded.waypoints[0].modeToNext).toBe('pedestrian');
    expect(decoded.waypoints[0].selectedAlternativeIndex).toBe(1);

    // address fields are intentionally not present in v2
    expect(decoded.startPointAddress).toBeUndefined();
    expect(decoded.endPointAddress).toBeUndefined();
    expect(decoded.waypoints[0].address).toBeUndefined();
  });

  it('quantizes coordinates close to original (~1e-5)', () => {
    const data = makeRouteData();
    const encoded = encodeRouteToUrl(data);
    const decoded = decodeRouteFromUrl(encoded);

    const [lat, lon] = decoded.startPoint as [number, number];
    expect(Math.abs(lat - data.startPoint[0])).toBeLessThanOrEqual(1e-5);
    expect(Math.abs(lon - data.startPoint[1])).toBeLessThanOrEqual(1e-5);

    const wp0 = decoded.waypoints[0];
    expect(Math.abs(wp0.coords[0] - data.waypoints[0].coords[0])).toBeLessThanOrEqual(1e-5);
    expect(Math.abs(wp0.coords[1] - data.waypoints[0].coords[1])).toBeLessThanOrEqual(1e-5);
  });

  it('keeps alternatives as placeholders (coords only)', () => {
    const data = makeRouteData();
    const encoded = encodeRouteToUrl(data);
    const decoded = decodeRouteFromUrl(encoded);

    const alts = decoded.waypoints[0].alternatives;
    expect(alts).toBeTruthy();
    expect(alts).toHaveLength(2);
    expect(alts[0].name).toMatch(/^Вариант 1/);
    expect(alts[0].coordinates).toEqual(expect.any(Array));
  });
});
