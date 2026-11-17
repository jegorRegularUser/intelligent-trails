// src/lib/walk/__tests__/memoPort.test.ts
// Мемо-порт: проброс routeAlternatives (docs/walk-loop-quality.md R3.b) —
// без него альтернативы мертвы на всех продовых call-site (экшен отдаёт в
// движок именно мемо-порт). Плюс деградация на портах без метода и
// дисковый слой kind route-alt.
//
// Дисковый слой изолируется в temp-каталог на ВЕСЬ файл: без этого тесты
// читают реальные записи ~/.intelligent-trails/geo-cache и пишут туда же
// синтетические ключи.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { memoizeRoutingPort } from '@/lib/walk/memoPort';
import { readRouteAltCache } from '@/lib/walk/portDiskCache';
import type { WalkLatLng } from '@/lib/walk/types';
import type { WalkRouteSegment, WalkRoutingPort } from '@/lib/walk/ports';

// Пара точек СВОЯ в каждом тесте: диск общий на файл, ключи не должны пересекаться.
const A: WalkLatLng = [55.75, 37.6];
const B: WalkLatLng = [55.76, 37.61];
const C: WalkLatLng = [55.751, 37.601];
const D: WalkLatLng = [55.761, 37.611];
const E: WalkLatLng = [55.752, 37.602];
const F: WalkLatLng = [55.762, 37.612];
const G: WalkLatLng = [55.753, 37.603];
const H: WalkLatLng = [55.763, 37.613];

function segment(meters: number, tag: string): WalkRouteSegment {
  return {
    distanceMeters: meters,
    durationSeconds: (meters / 75) * 60,
    geometry: [A, B],
    // tag различает маршруты-альтернативы в ассертах.
    source: tag ? `pack:${tag}` : 'pack',
  };
}

/**
 * Проброс routeAlternatives — часть контракта мемо-порта (R3.b): его
 * отсутствие убивает фичу на всех продовых call-site. Ассерт заодно
 * снимает опциональность типа для вызовов в тесте.
 */
function altsOf(port: WalkRoutingPort) {
  if (typeof port.routeAlternatives !== 'function') {
    throw new Error('мемо-порт обязан пробрасывать routeAlternatives (R3.b)');
  }
  return port.routeAlternatives.bind(port);
}

// Дисковая изоляция на ВЕСЬ файл: каждый успешный вызов routeAlternatives
// пишет запись, и без общего temp-каталога тесты читали бы реальные записи
// ~/.intelligent-trails/geo-cache и мусорили бы в них.
let originalDir: string | undefined;
let cacheDir: string;

beforeAll(async () => {
  originalDir = process.env.IT_GEO_CACHE_DIR;
  cacheDir = await mkdtemp(join(tmpdir(), 'it-memoport-test-'));
  process.env.IT_GEO_CACHE_DIR = cacheDir;
});

afterAll(async () => {
  if (originalDir === undefined) delete process.env.IT_GEO_CACHE_DIR;
  else process.env.IT_GEO_CACHE_DIR = originalDir;
  await rm(cacheDir, { recursive: true, force: true });
});

describe('memoPort: проброс routeAlternatives', () => {
  it('порт с методом: массив альтернатив возвращается, сеть дёргается один раз', async () => {
    let calls = 0;
    const underlying: WalkRoutingPort = {
      route: async () => segment(100, 'plain'),
      routeAlternatives: async () => {
        calls += 1;
        return [segment(100, 'main'), segment(140, 'alt')];
      },
      matrix: async () => [],
    };
    const memo = memoizeRoutingPort(underlying);
    const alternatives = altsOf(memo);

    const first = await alternatives({ waypoints: [A, B] });
    const second = await alternatives({ waypoints: [A, B] });

    expect(calls).toBe(1);
    expect(first).toHaveLength(2);
    expect(first[0].source).toBe('pack:main'); // основной первым
    expect(second).toEqual(first);
  });

  it('порт без метода: деградация честная — [основной] тем же route', async () => {
    let routeCalls = 0;
    const underlying: WalkRoutingPort = {
      route: async () => {
        routeCalls += 1;
        return segment(100, 'plain');
      },
      matrix: async () => [],
    };
    const memo = memoizeRoutingPort(underlying);
    const alternatives = altsOf(memo);

    const segments = await alternatives({ waypoints: [C, D] });

    expect(segments).toHaveLength(1);
    expect(segments[0].source).toBe('pack:plain');
    expect(routeCalls).toBe(1);
    // Повтор — из кэша, route больше не зовётся.
    await alternatives({ waypoints: [C, D] });
    expect(routeCalls).toBe(1);
  });

  it('ошибка не кэшируется: после отказа следующий вызов идёт в порт снова', async () => {
    let calls = 0;
    const underlying: WalkRoutingPort = {
      route: async () => segment(100, 'plain'),
      routeAlternatives: async () => {
        calls += 1;
        if (calls === 1) throw new Error('ORS упал');
        return [segment(100, 'main')];
      },
      matrix: async () => [],
    };
    const memo = memoizeRoutingPort(underlying);
    const alternatives = altsOf(memo);

    await expect(alternatives({ waypoints: [E, F] })).rejects.toThrow('ORS упал');
    const retry = await alternatives({ waypoints: [E, F] });
    expect(calls).toBe(2);
    expect(retry[0].source).toBe('pack:main');
  });
});

describe('memoPort: дисковый слой route-alt', () => {
  it('первый вызов пишет диск; новый мемо-порт над бросающим подложкой читает его', async () => {
    const underlying: WalkRoutingPort = {
      route: async () => segment(100, 'plain'),
      routeAlternatives: async () => [segment(100, 'main'), segment(140, 'alt')],
      matrix: async () => [],
    };
    const first = memoizeRoutingPort(underlying);
    const segments = await altsOf(first)({ waypoints: [G, H] });
    expect(segments).toHaveLength(2);

    // Запись fire-and-forget — ждём появления файла (кэш опционален, но
    // в тесте обязателен: без записи второй порт ушёл бы в сеть).
    let disk: WalkRouteSegment[] | null = null;
    for (let i = 0; i < 40 && !disk; i++) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      disk = await readRouteAltCache([G, H]);
    }
    expect(disk).not.toBeNull();
    expect(disk).toHaveLength(2);

    // Новый мемо-порт над подложкой, которая при сети бросает: попадём в диск.
    const throwing: WalkRoutingPort = {
      route: async () => {
        throw new Error('сеть недоступна');
      },
      routeAlternatives: async () => {
        throw new Error('сеть недоступна');
      },
      matrix: async () => [],
    };
    const second = memoizeRoutingPort(throwing);
    const cached = await altsOf(second)({ waypoints: [G, H] });
    expect(cached).toEqual(segments);
  });
});
