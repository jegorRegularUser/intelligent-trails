// src/lib/geo/__tests__/orsKeyPool.test.ts
// Пул ключей ORS: round-robin расход, ротация на 403/429, исчерпание до
// полуночи UTC, дедуп дубликатов. Ноль сети — fetch-фейки (ADR-001, правило 6).
import { describe, it, expect } from 'vitest';
import { OrsKeyPool, nextUtcMidnight } from '@/lib/geo/cloud/orsKeyPool';
import { OrsRoutingAdapter } from '@/lib/geo/cloud/ors';
import { createFakeFetch, jsonResponse, MOSCOW, ZARYADYE } from './fakes';

const BASE = 'https://api.openrouteservice.org';

describe('OrsKeyPool: расход и ротация', () => {
  it('round-robin: ключи отдаются по кругу, дубликаты схлопываются', () => {
    const pool = new OrsKeyPool(['a', 'b', 'a', 'b', 'c']);
    expect(pool.size).toBe(3);
    const seq = [pool.current(), pool.current(), pool.current(), pool.current()];
    expect(seq).toEqual(['a', 'b', 'c', 'a']);
  });

  it('markExhausted помечает до полуночи UTC и переезжает на соседний ключ', () => {
    const now = Date.UTC(2026, 10, 12, 10, 0, 0); // 10:00 UTC
    const pool = new OrsKeyPool(['a', 'b']);
    expect(pool.current(now)).toBe('a');
    const next = pool.markExhausted('a', now);
    expect(next).toBe('b');
    expect(pool.current(now)).toBe('b');
    // Сброс квоты — ближайшая полночь UTC после now.
    expect(pool.liveCount(now)).toBe(1);
    expect(pool.liveCount(nextUtcMidnight(now) + 1)).toBe(2);
  });

  it('все исчерпаны — честный отказ с моментом сброса', () => {
    const now = Date.UTC(2026, 10, 12, 10, 0, 0);
    const pool = new OrsKeyPool(['a']);
    pool.markExhausted('a', now);
    expect(() => pool.current(now)).toThrow(/исчерпаны/);
  });

  it('пустой пул — отказ, а не undefined', () => {
    const pool = new OrsKeyPool([]);
    expect(() => pool.current()).toThrow(/не задан|исчерпаны/);
  });
});

describe('OrsRoutingAdapter: ротация на квотных отказах', () => {
  function orsRouteBody() {
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [[37.6184, 55.7512], [37.619, 55.7515]] },
          properties: { summary: { distance: 1234.5, duration: 900.25 } },
        },
      ],
    };
  }

  it('403 на первом ключе — запрос уходит на второй, исчерпанный больше не зовётся', async () => {
    const { fetch, calls } = createFakeFetch((_url, init) => {
      const key = (init?.headers as Record<string, string>).Authorization;
      return key === 'dead-key' ? jsonResponse({ error: 'Quota exceeded' }, 403) : jsonResponse(orsRouteBody());
    });
    const adapter = new OrsRoutingAdapter({
      apiKeys: ['dead-key', 'live-key'],
      baseUrl: BASE,
      fetchImpl: fetch,
      routeTimeoutMs: 1000,
      matrixTimeoutMs: 1000,
    });

    const segment = await adapter.route([MOSCOW, ZARYADYE]);
    expect(segment.distanceMeters).toBe(1234.5);
    // Два запроса: dead-key отклонён, live-key ответил.
    expect(calls).toHaveLength(2);
    const first = (calls[0].init?.headers as Record<string, string>).Authorization;
    const second = (calls[1].init?.headers as Record<string, string>).Authorization;
    expect(first).toBe('dead-key');
    expect(second).toBe('live-key');
  });

  it('оба ключа исчерпаны — отказ без бесконечного цикла', async () => {
    const { fetch, calls } = createFakeFetch(() => jsonResponse({ error: 'Quota exceeded' }, 403));
    const adapter = new OrsRoutingAdapter({
      apiKeys: ['k1', 'k2'],
      baseUrl: BASE,
      fetchImpl: fetch,
      routeTimeoutMs: 1000,
      matrixTimeoutMs: 1000,
    });

    await expect(adapter.route([MOSCOW, ZARYADYE])).rejects.toThrow(/HTTP 403|исчерпаны|отклонил/);
    expect(calls).toHaveLength(2); // по одной попытке на ключ, без ретрай-спирали
  });

  it('одиночный apiKey — прежняя семантика: 403 маппится в NO_ROUTE', async () => {
    const { fetch, calls } = createFakeFetch(() => jsonResponse({ error: 'Quota exceeded' }, 403));
    const adapter = new OrsRoutingAdapter({
      apiKey: 'only-key',
      baseUrl: BASE,
      fetchImpl: fetch,
      routeTimeoutMs: 1000,
      matrixTimeoutMs: 1000,
    });

    await expect(adapter.route([MOSCOW, ZARYADYE])).rejects.toThrow(/отклонил ключ/);
    expect(calls).toHaveLength(1);
  });

  it('matrix: чанки с ротацией — исчерпание посреди матрицы доезжает на соседнем ключе', async () => {
    const { fetch, calls } = createFakeFetch((url, init) => {
      const key = (init?.headers as Record<string, string>).Authorization;
      // dead-key жив только для маршрутов; матрица на нём всегда 403.
      return key === 'dead-key'
        ? jsonResponse({ error: 'Quota exceeded' }, 403)
        : jsonResponse({ durations: [[10]], distances: [[100]] });
    });
    const adapter = new OrsRoutingAdapter({
      apiKeys: ['dead-key', 'live-key'],
      baseUrl: BASE,
      fetchImpl: fetch,
      routeTimeoutMs: 1000,
      matrixTimeoutMs: 1000,
    });

    const cells = await adapter.matrix([MOSCOW], [ZARYADYE]);
    expect(cells.length).toBeGreaterThan(0);
    // dead-key ушёл первым и получил 403, второй запрос — уже на live-key.
    expect(calls.map((c) => (c.init?.headers as Record<string, string>).Authorization)).toEqual([
      'dead-key',
      'live-key',
    ]);
  });
});
