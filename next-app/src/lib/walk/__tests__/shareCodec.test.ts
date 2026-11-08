import { describe, expect, it } from 'vitest';
import { decodeRouteFromUrl } from '@/utils/routeCodec';
import { quickWalkToEncodedRoute, quickWalkToYandexMapsUrl } from '../shareCodec';
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

  it('ссылка Яндекс.Карт: пешеходный режим, старт+остановки, петля замыкается', () => {
    const url = quickWalkToYandexMapsUrl(makeUiPlan('loop'), START);
    expect(url).toContain('rtt=pd');
    expect(url).toContain('mode=routes');
    // старт + 2 остановки + возврат к старту = 4 точки
    expect(url.match(/~/g)).toHaveLength(3);
    expect(url.startsWith('https://yandex.ru/maps/?')).toBe(true);
  });
});
