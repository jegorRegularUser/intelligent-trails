// src/lib/vibes/__tests__/streetInterest.test.ts
// Интерес-модель улиц (docs/street-interest-wave.md S2): детерминизм,
// нормировка на максимум, архетипные множители, разложение по вершинам,
// attractionPoint как проекция на контур, пустой сет → hasData=false.

import { describe, expect, it } from 'vitest';
import type { StreetFeature } from '@/lib/geo/types';
import { GREEN, RAINY, SURPRISE } from '@/lib/vibes/archetypes';
import { scoreSectors, type StreetHints } from '@/lib/vibes/streetInterest';

const START: [number, number] = [55.751244, 37.618423];
const RAD = Math.PI / 180;
const LAT_PER_M = 1 / (6371008.8 * RAD);

/** Точка на компасном азимуте deg (север = 0°, восток = 90°) на дистанции meters. */
function atAzimuth(deg: number, meters = 300): [number, number] {
  const a = deg * RAD;
  return [
    START[0] + Math.cos(a) * meters * LAT_PER_M,
    START[1] + Math.sin(a) * meters * (LAT_PER_M / Math.cos(START[0] * RAD)),
  ];
}

/**
 * Квадратный контур со стороной sizeDeg вокруг центра на полярных координатах
 * (азимут, дистанция). При sizeDeg ≤ 0.0004 и дистанции ≥ 300 м все вершины
 * сидят внутри одного 45°-сектора — фикстура «парк целиком в секторе».
 */
function parkAt(
  azimuthDeg: number,
  distanceMeters = 300,
  sizeDeg = 0.0004,
  overrides: Partial<StreetFeature> = {},
): StreetFeature {
  const center = atAzimuth(azimuthDeg, distanceMeters);
  const half = sizeDeg / 2;
  const ring: [number, number][] = [
    [center[0] - half, center[1] - half],
    [center[0] - half, center[1] + half],
    [center[0] + half, center[1] + half],
    [center[0] + half, center[1] - half],
    [center[0] - half, center[1] - half],
  ];
  return { kind: 'green', geometry: ring, name: 'Парк', areaMeters: sizeDeg * sizeDeg * 8e9, ...overrides };
}

function pointFeature(kind: StreetFeature['kind'], at: [number, number], extra: Partial<StreetFeature> = {}): StreetFeature {
  return { kind, geometry: [at], areaMeters: 0, ...extra };
}

const sectorOf = (hints: StreetHints, i: number) => hints.sectors[i];
const NORTH = 0; // [0°, 45°)
const SOUTH = 4; // [180°, 225°)

describe('scoreSectors: базовые свойства', () => {
  it('пустой сет → hasData=false, все интересы 0, points null', () => {
    const hints = scoreSectors([], START, SURPRISE);
    expect(hints.hasData).toBe(false);
    expect(hints.sectors).toHaveLength(8);
    expect(hints.sectors.every((s) => s.interest === 0 && s.point === null)).toBe(true);
    expect(hints.sectors[0].azimuthDeg).toBe(22.5);
  });

  it('фичи без геометрии — hasData=false (максимум вкладов нулевой)', () => {
    const hints = scoreSectors([pointFeature('green', atAzimuth(0), { geometry: [] })], START, SURPRISE);
    expect(hints.hasData).toBe(false);
  });

  it('детерминизм: тот же вход → бит-в-бит тот же выход', () => {
    const input = [parkAt(22.5), pointFeature('viewpoint', atAzimuth(120), { name: 'Панорама' })];
    expect(scoreSectors(input, START, GREEN)).toEqual(scoreSectors(input, START, GREEN));
  });

  it('нормировка: максимум по розе = 1, слабые сектора — относительно него', () => {
    const hints = scoreSectors(
      [parkAt(22.5), pointFeature('art', atAzimuth(202.5), { name: 'Фонтан' })],
      START,
      SURPRISE,
    );
    expect(sectorOf(hints, NORTH).interest).toBe(1);
    expect(sectorOf(hints, SOUTH).interest).toBeGreaterThan(0);
    expect(sectorOf(hints, SOUTH).interest).toBeLessThan(1);
    expect(hints.hasData).toBe(true);
  });
});

describe('scoreSectors: архетипные множители (S2)', () => {
  // Точки с areaMeters=0 — размер и близость нейтральны, множитель решает сам.
  const greenGrove = () => pointFeature('green', atAzimuth(22.5), { name: 'Роща' });
  const waterPond = () => pointFeature('water', atAzimuth(202.5), { name: 'Пруд' });

  it('green: зелень перевешивает воду; без множителя (surprise) — наоборот', () => {
    const withGreen = scoreSectors([greenGrove(), waterPond()], START, GREEN);
    expect(sectorOf(withGreen, NORTH).interest).toBe(1);
    // 1.56/1.6 = 0.975; точность 5 знаков — haversine двух точек чуть различается.
    expect(sectorOf(withGreen, SOUTH).interest).toBeCloseTo(1.56 / 1.6, 5);

    const neutral = scoreSectors([greenGrove(), waterPond()], START, SURPRISE);
    // База water 1.2 > green 1.0 — при равных прочих вода впереди (0.833);
    // точность 5 знаков — haversine двух точек чуть различается.
    expect(sectorOf(neutral, SOUTH).interest).toBe(1);
    expect(sectorOf(neutral, NORTH).interest).toBeCloseTo(1.0 / 1.2, 5);
  });

  it('rainy: вся среда ×0.3 — соотношение секторов сохраняется (нормировка нейтральна к общему множителю)', () => {
    const rainy = scoreSectors([greenGrove(), waterPond()], START, RAINY);
    const neutral = scoreSectors([greenGrove(), waterPond()], START, SURPRISE);
    expect(sectorOf(rainy, SOUTH).interest / sectorOf(rainy, NORTH).interest).toBeCloseTo(
      sectorOf(neutral, SOUTH).interest / sectorOf(neutral, NORTH).interest,
      9,
    );
  });
});

describe('scoreSectors: разложение по вершинам и attractionPoint (S2)', () => {
  it('крупный контур накрывает два несмежных сектора — вклад в обоих по вершинам', () => {
    // Вершины на азимутах 30° (сектор 0) и 100° (сектор 2); сектор 1 пуст —
    // вклад раскладывается по ВЕРШИНАМ, без интерполяции рёбер.
    const big: StreetFeature = {
      kind: 'green',
      geometry: [
        atAzimuth(30, 400),
        atAzimuth(100, 400),
        atAzimuth(100, 700),
        atAzimuth(30, 700),
        atAzimuth(30, 400),
      ],
      areaMeters: 200000,
    };
    const hints = scoreSectors([big], START, SURPRISE);
    expect(sectorOf(hints, NORTH).interest).toBeGreaterThan(0);
    expect(sectorOf(hints, 2).interest).toBeGreaterThan(0);
    expect(sectorOf(hints, 1).interest).toBe(0);
    // Один контур — attractionPoint в обоих секторах один и тот же.
    expect(sectorOf(hints, NORTH).point).toEqual(sectorOf(hints, 2).point);
  });

  it('attractionPoint — проекция на КОНТУР (середина южной грани), не ближайшая вершина', () => {
    const park = parkAt(0, 300, 0.002);
    const hints = scoreSectors([park], START, SURPRISE);
    const point = sectorOf(hints, NORTH).point!;
    // Нижняя грань квадрата: широта центральной точки грани (half — в градусах).
    expect(point[0]).toBeCloseTo(START[0] + 300 * LAT_PER_M - 0.001, 9);
    // Проекция легла на грань по долготе старта (старт точно под центром).
    expect(point[1]).toBeCloseTo(START[1], 9);
  });

  it('точечная фича — attractionPoint совпадает с самой точкой', () => {
    const viewpoint = atAzimuth(30, 500);
    const hints = scoreSectors([pointFeature('viewpoint', viewpoint, { name: 'Панорама' })], START, SURPRISE);
    expect(sectorOf(hints, 0).point).toEqual(viewpoint);
    expect(sectorOf(hints, 0).interest).toBe(1);
  });
});

describe('scoreSectors: близость и размер (S2)', () => {
  it('близость: одинаковый парк ближе к старту даёт больший интерес своему сектору', () => {
    const near = parkAt(22.5, 300);
    const far = parkAt(202.5, 1900); // та же площадь, дальше в ~6 раз
    const hints = scoreSectors([near, far], START, SURPRISE);
    expect(sectorOf(hints, NORTH).interest).toBe(1);
    expect(sectorOf(hints, SOUTH).interest).toBeLessThan(0.8);
  });

  it('размер полигона (лог-шкала): крупный парк перевешивает маленький того же класса', () => {
    const big = parkAt(22.5, 1000, 0.004);
    const small = parkAt(202.5, 1900, 0.0005);
    const hints = scoreSectors([big, small], START, SURPRISE);
    expect(sectorOf(hints, NORTH).interest).toBe(1);
    expect(sectorOf(hints, SOUTH).interest).toBeLessThan(0.8);
  });
});
