// src/lib/walk/__tests__/sectorConvention.test.ts
// Pinned-тест конвенции азимутных секторов (docs/street-interest-wave.md S2/S4).
// Конвенция держится на двух фактах: проекция даёт x=восток/y=север
// (internal/geo.localProjection), сектор = floor((atan2(x,y) mod 2π)/45°).
// Нюанс, который и pins этот файл: угловой параметр розы streetLoop
// (sin→lat, cos→lng) — НЕ компасный азимут (точка розы на угле a сидит на
// азимуте π/2−a), поэтому и диверсификация, и интерес-модель, и снап петли
// обязаны считать сектор от СПОЙНТОВОЙ/геометрической ТОЧКИ через azimuthRad,
// а не от углового параметра. Разъехались бы на 90° — снап притянул бы
// вейпоинт в чужой сектор молча; здесь конвенция зафиксирована числами.

import { describe, expect, it } from 'vitest';
import { SECTOR_COUNT } from '@/lib/walk/types';
import { azimuthRad, sectorOfAzimuth } from '@/lib/walk/internal/geo';
import { diversifyByAzimuth } from '@/lib/walk/quickPipeline';

const START: [number, number] = [55.751244, 37.618423];
const RAD = Math.PI / 180;
/** ~100 м в градусах широты/долготы на широте старта. */
const LAT_PER_M = 1 / (6371008.8 * RAD);
const LNG_PER_M = 1 / (6371008.8 * RAD * Math.cos(START[0] * RAD));

/** Точка в `meters` метрах от старта на компасном азимуте `deg` (север = 0°, восток = 90°):
 *  северная составляющая — cos, восточная — sin (в отличие от углового
 *  параметра розы streetLoop, где sin→lat, cos→lng — см. шапку файла). */
function compassPoint(deg: number, meters = 100): [number, number] {
  const a = deg * RAD;
  return [START[0] + Math.cos(a) * meters * LAT_PER_M, START[1] + Math.sin(a) * meters * LNG_PER_M];
}

describe('pinned: конвенция азимутных секторов', () => {
  it('SECTOR_COUNT = 8: роза 45° покрывает круг, константа едина для всех потребителей', () => {
    expect(SECTOR_COUNT).toBe(8);
  });

  it('азимут от севера по часовой: север 0°, восток 90°, юг 180°, запад 270°', () => {
    expect(azimuthRad(START, compassPoint(0))).toBeCloseTo(0, 6);
    expect(azimuthRad(START, compassPoint(90))).toBeCloseTo(Math.PI / 2, 6);
    expect(azimuthRad(START, compassPoint(180))).toBeCloseTo(Math.PI, 6);
    expect(azimuthRad(START, compassPoint(270))).toBeCloseTo((3 * Math.PI) / 2, 6);
  });

  it('сектор = floor(азимут/45°): границы 0/45/90/…/315 — pinned значения', () => {
    const sectorOf = (deg: number): number => sectorOfAzimuth(deg * RAD, SECTOR_COUNT);
    expect(sectorOf(0)).toBe(0); // север
    expect(sectorOf(44.9)).toBe(0);
    expect(sectorOf(45)).toBe(1);
    expect(sectorOf(90)).toBe(2); // восток
    expect(sectorOf(135)).toBe(3);
    expect(sectorOf(180)).toBe(4); // юг
    expect(sectorOf(225)).toBe(5);
    expect(sectorOf(270)).toBe(6); // запад
    expect(sectorOf(315)).toBe(7);
    expect(sectorOf(359.9)).toBe(7);
  });

  it('отрицательные и перевалившие за 2π азимуты нормируются в [0..8)', () => {
    expect(sectorOfAzimuth(-Math.PI / 2, SECTOR_COUNT)).toBe(6); // −90° = запад
    expect(sectorOfAzimuth(-Math.PI, SECTOR_COUNT)).toBe(4); // −180° = юг
    expect(sectorOfAzimuth(2 * Math.PI + 0.1, SECTOR_COUNT)).toBe(0);
  });

  it('гео-точка на компасном азимуте θ попадает в сектор floor(θ/45°) — та же формула у всех', () => {
    for (let deg = 0; deg < 360; deg += 5) {
      expect(sectorOfAzimuth(azimuthRad(START, compassPoint(deg)), SECTOR_COUNT)).toBe(
        sectorOfAzimuth(deg * RAD, SECTOR_COUNT),
      );
    }
  });

  it('диверсификация R2 сидит на той же конвенции: все 8 направлений выживают под cap', () => {
    // По точке на каждом 45°-границе — если диверсификация и хелпер разъедутся,
    // часть направлений схлопнется в один сектор и вылетит под cap.
    const entries = Array.from({ length: SECTOR_COUNT }, (_, i) => ({
      id: i,
      coordinates: compassPoint(i * 45),
    }));
    const shortlist = diversifyByAzimuth(entries, START, 4);
    expect(shortlist).toHaveLength(4);
    expect(new Set(shortlist.map((e) => e.id)).size).toBe(4);
  });
});
