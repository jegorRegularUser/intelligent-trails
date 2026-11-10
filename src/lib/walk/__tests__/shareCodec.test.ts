import { describe, expect, it } from 'vitest';
import { decodeRouteFromUrl } from '@/utils/routeCodec';
import { quickWalkToEncodedRoute, quickWalkToYandexMapsUrl, sampleLoopGeometry } from '../shareCodec';
import type { WalkPlan as UiWalkPlan } from '@/components/walk/types';

function makeUiPlan(type: 'loop' | 'point_to_point' = 'loop'): UiWalkPlan {
  return {
    id: 'walk-1',
    type,
    budgetMin: 60,
    stops: [
      {
        id: '11',
        name: 'Парк Горького',
        kind: 'park',
        stayMin: 15,
        reason: 'лучший скор категории',
        coordinates: [55.731, 37.601],
      },
      {
        id: '12',
        name: 'Кофейня X',
        kind: 'cafe',
        stayMin: 20,
        reason: 'высокий рейтинг',
        coordinates: [55.734, 37.595],
      },
    ],
    legs: [{ walkMin: 10 }, { walkMin: 12 }, { walkMin: 8 }],
    totals: { walkMin: 30, stayMin: 35, totalMin: 65 },
  };
}

const START: [number, number] = [55.7298, 37.5996];

describe('shareCodec: быстрая прогулка → исторический формат', () => {
  it('round-trip: кодек возвращает те же точки, имена и категории', () => {
    const encoded = quickWalkToEncodedRoute(makeUiPlan(), START);
    const decoded = decodeRouteFromUrl(encoded);
    expect(decoded).toBeTruthy();
    expect(decoded.startTransport).toBe('pedestrian');
    expect(decoded.waypoints).toHaveLength(2);
    expect(decoded.waypoints[0].resolvedName).toBe('Парк Горького');
    expect(decoded.waypoints[0].originalCategory).toBe('park');
    expect(decoded.waypoints[1].originalCategory).toBe('cafe');
    expect(Math.abs(decoded.waypoints[0].coords[0] - 55.731)).toBeLessThan(1e-4);
    expect(decoded.waypoints[0].duration).toBe(15);
  });

  it('петля кодируется с финишем в старте', () => {
    const encoded = quickWalkToEncodedRoute(makeUiPlan('loop'), START);
    const decoded = decodeRouteFromUrl(encoded);
    expect(Math.abs(decoded.endPoint[0] - START[0])).toBeLessThan(1e-4);
    expect(Math.abs(decoded.endPoint[1] - START[1])).toBeLessThan(1e-4);
  });

  it('формат v2: код начинается с «2.» и декодируется только через v2-ветку', () => {
    // V2_PREFIX в routeCodec — «2.»; ссылка = маршрут, декодер обязан понять её.
    const encoded = quickWalkToEncodedRoute(makeUiPlan(), START);
    expect(encoded.startsWith('2.')).toBe(true);
    expect(decodeRouteFromUrl(encoded)).toBeTruthy();
  });

  it('остановка без координат — деградация в старт, не мусор в ссылке', () => {
    const plan = makeUiPlan();
    const [withCoords, ...rest] = plan.stops;
    plan.stops = [
      { ...withCoords, coordinates: undefined },
      ...rest.map((s) => ({ ...s, coordinates: undefined })),
    ];
    const decoded = decodeRouteFromUrl(quickWalkToEncodedRoute(plan, START));
    for (const waypoint of decoded.waypoints) {
      expect(Math.abs(waypoint.coords[0] - START[0])).toBeLessThan(1e-4);
      expect(Math.abs(waypoint.coords[1] - START[1])).toBeLessThan(1e-4);
    }
  });

  it('UTF-8 и спецсимволы имени переживают lz-string и URL-кодирование', () => {
    const plan = makeUiPlan();
    plan.stops = [
      ...plan.stops,
      {
        id: '13',
        name: 'Кафе «У Петровича» & Co ~50% 100%#привет',
        kind: 'cafe',
        stayMin: 10,
        reason: 'колорит',
        coordinates: [55.74, 37.59],
      },
    ];
    const decoded = decodeRouteFromUrl(quickWalkToEncodedRoute(plan, START));
    expect(decoded.waypoints[2].resolvedName).toBe('Кафе «У Петровича» & Co ~50% 100%#привет');
  });

  it('мусорная строка — decodeRouteFromUrl возвращает null, а не падает', () => {
    expect(decodeRouteFromUrl('2.garbage-not-lzstring')).toBeNull();
    expect(decodeRouteFromUrl('')).toBeNull();
  });

  it('ссылка Яндекс.Карт: пешеходный режим, старт+остановки, петля замыкается', () => {
    const url = quickWalkToYandexMapsUrl(makeUiPlan('loop'), START);
    expect(url).toContain('rtt=pd');
    expect(url).toContain('mode=routes');
    // старт + 2 остановки + возврат к старту = 4 точки
    expect(url.match(/~/g)).toHaveLength(3);
    expect(url.startsWith('https://yandex.ru/maps/?')).toBe(true);
  });
});

describe('shareCodec: ссылка «Идти» для чистой петли (loop-only)', () => {
  function makeLoopOnlyPlan(legs: UiWalkPlan['legs']): UiWalkPlan {
    return {
      id: 'walk-loop-only',
      type: 'loop',
      budgetMin: 60,
      stops: [],
      legs,
      totals: { walkMin: legs.reduce((sum, l) => sum + l.walkMin, 0), stayMin: 0, totalMin: legs.reduce((sum, l) => sum + l.walkMin, 0) },
      degraded: { level: 'loop-only' },
      degradedNote: { ru: 'петля', en: 'loop' },
    };
  }

  it('rtext строится из сэмпла геометрии (≤10 точек), не старт~старт', () => {
    // Замкнутая петля: 24 точки окружности + замыкание в старт.
    const ring: [number, number][] = Array.from({ length: 24 }, (_, i) => {
      const angle = (i / 24) * Math.PI * 2;
      return [START[0] + Math.sin(angle) * 0.005, START[1] + Math.cos(angle) * 0.005];
    });
    const geometry: [number, number][] = [...ring, START];
    const plan = makeLoopOnlyPlan([{ walkMin: 48, geometry }]);

    const url = quickWalkToYandexMapsUrl(plan, START);
    expect(url).toContain('rtt=pd');
    const rtext = url.split('rtext=')[1].split('&')[0];
    const points = rtext.split('~');
    // ≤10 сэмплов: первая — начало геометрии, последняя — замыкание петли в старте.
    expect(points.length).toBeLessThanOrEqual(10);
    expect(points.length).toBeGreaterThanOrEqual(5);
    expect(points[0]).toBe(`${geometry[0][0].toFixed(5)},${geometry[0][1].toFixed(5)}`);
    expect(points[points.length - 1]).toBe(`${START[0].toFixed(5)},${START[1].toFixed(5)}`);
    // Не «маршрут из точки в ту же точку»: есть промежуточные точки.
    expect(new Set(points).size).toBeGreaterThan(2);
  });

  it('план с остановками — прежний формат (старт+остановки+замыкание), не сэмпл', () => {
    const url = quickWalkToYandexMapsUrl(makeUiPlan('loop'), START);
    // 4 точки = старт + 2 остановки + возврат; сэмпл бы дал 10.
    expect(url.match(/~/g)).toHaveLength(3);
  });

  it('нет геометрии (<2 точек) — деградация в старт~старт', () => {
    const plan = makeLoopOnlyPlan([{ walkMin: 40 }]);
    const url = quickWalkToYandexMapsUrl(plan, START);
    const rtext = url.split('rtext=')[1].split('&')[0];
    expect(rtext.split('~')).toHaveLength(2); // старт~старт
    expect(rtext.startsWith(`${START[0].toFixed(5)},${START[1].toFixed(5)}`)).toBe(true);
  });

  it('sampleLoopGeometry: ≤maxPoints, края на месте, вход не мутируется', () => {
    const line: [number, number][] = Array.from({ length: 50 }, (_, i) => [55.7 + i * 0.001, 37.6]);
    const sampled = sampleLoopGeometry(line, 10);
    expect(sampled).toHaveLength(10);
    expect(sampled[0]).toEqual(line[0]);
    expect(sampled[sampled.length - 1]).toEqual(line[line.length - 1]);
    expect(line).toHaveLength(50);
    // Короче лимита — возвращается копия целиком.
    const short = line.slice(0, 5);
    expect(sampleLoopGeometry(short, 10)).toHaveLength(5);
  });
});
