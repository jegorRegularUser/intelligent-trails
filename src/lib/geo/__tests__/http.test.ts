import { describe, it, expect } from 'vitest';
import { fetchJson, upstreamStatus } from '@/lib/geo/http';
import { GeoError } from '@/lib/geo/types';
import { createFakeFetch, jsonResponse } from './fakes';

describe('fetchJson', () => {
  it('парсит 200-JSON', async () => {
    const { fetch } = createFakeFetch(() => jsonResponse({ hello: 'world' }));
    await expect(fetchJson({ url: 'https://up.example/x', timeoutMs: 500, fetchImpl: fetch })).resolves.toEqual({
      hello: 'world',
    });
  });

  it('маппит статусы: 404/422 → NOT_FOUND', async () => {
    for (const status of [404, 422]) {
      const { fetch } = createFakeFetch(() => jsonResponse({ error: 'nope' }, status));
      const err = await fetchJson({ url: 'https://up.example/x', timeoutMs: 500, fetchImpl: fetch }).catch((e) => e);
      expect(err).toBeInstanceOf(GeoError);
      expect((err as GeoError).code).toBe('NOT_FOUND');
      expect(upstreamStatus(err)).toBe(status);
    }
  });

  it('маппит статусы: 429/5xx → UPSTREAM_UNAVAILABLE', async () => {
    for (const status of [429, 500, 502, 503]) {
      const { fetch } = createFakeFetch(() => jsonResponse({}, status));
      const err = await fetchJson({ url: 'https://up.example/x', timeoutMs: 500, fetchImpl: fetch }).catch((e) => e);
      expect((err as GeoError).code).toBe('UPSTREAM_UNAVAILABLE');
      expect(upstreamStatus(err)).toBe(status);
    }
  });

  it('маппит статусы: прочие 4xx → UPSTREAM_INVALID (401/403 и т.п.)', async () => {
    for (const status of [400, 401, 403]) {
      const { fetch } = createFakeFetch(() => jsonResponse({}, status));
      const err = await fetchJson({ url: 'https://up.example/x', timeoutMs: 500, fetchImpl: fetch }).catch((e) => e);
      expect((err as GeoError).code).toBe('UPSTREAM_INVALID');
      expect(upstreamStatus(err)).toBe(status);
    }
  });

  it('в cause кладёт статус и тело ошибки', async () => {
    const { fetch } = createFakeFetch(() => jsonResponse({ error: 'backoff' }, 429));
    const err = (await fetchJson({ url: 'https://up.example/x', timeoutMs: 500, fetchImpl: fetch }).catch(
      (e) => e,
    )) as GeoError;
    const cause = err.cause as { status: number; bodyText: string };
    expect(cause.status).toBe(429);
    expect(cause.bodyText).toContain('backoff');
  });

  it('бюджет вышел → UPSTREAM_TIMEOUT (fake fetch висит и игнорирует abort)', async () => {
    const { fetch } = createFakeFetch(() => new Promise<Response>(() => undefined));
    const err = (await fetchJson({ url: 'https://up.example/slow', timeoutMs: 40, fetchImpl: fetch }).catch(
      (e) => e,
    )) as GeoError;
    expect(err.code).toBe('UPSTREAM_TIMEOUT');
  });

  it('сеть упала (TypeError от fetch) → UPSTREAM_UNAVAILABLE', async () => {
    const { fetch } = createFakeFetch(() => {
      throw new TypeError('fetch failed');
    });
    const err = (await fetchJson({ url: 'https://down.example/x', timeoutMs: 500, fetchImpl: fetch }).catch(
      (e) => e,
    )) as GeoError;
    expect(err.code).toBe('UPSTREAM_UNAVAILABLE');
  });

  it('не-JSON тело при 200 → UPSTREAM_INVALID', async () => {
    const { fetch } = createFakeFetch(() => new Response('<html>oops</html>', { status: 200 }));
    const err = (await fetchJson({ url: 'https://up.example/html', timeoutMs: 500, fetchImpl: fetch }).catch(
      (e) => e,
    )) as GeoError;
    expect(err.code).toBe('UPSTREAM_INVALID');
  });

  it('мусорный json() у 200-ответа при уже вышедшем бюджете → UPSTREAM_TIMEOUT', async () => {
    // Fake fetch игнорирует сигнал и отвечает ПОСЛЕ таймаута, json() роняется —
    // это таймаут, а не UPSTREAM_INVALID.
    const { fetch } = createFakeFetch(
      () =>
        new Promise<Response>((resolve) =>
          setTimeout(
            () => resolve({ ok: true, status: 200, json: () => Promise.reject(new Error('aborted')) } as unknown as Response),
            60,
          ),
        ),
    );
    const err = (await fetchJson({ url: 'https://up.example/late', timeoutMs: 20, fetchImpl: fetch }).catch(
      (e) => e,
    )) as GeoError;
    expect(err.code).toBe('UPSTREAM_TIMEOUT');
  });

  it('мусорный json() при живом бюджете → UPSTREAM_INVALID', async () => {
    const { fetch } = createFakeFetch(() => ({ ok: true, status: 200, json: () => Promise.reject(new Error('boom')) }) as unknown as Response);
    const err = (await fetchJson({ url: 'https://up.example/x', timeoutMs: 500, fetchImpl: fetch }).catch(
      (e) => e,
    )) as GeoError;
    expect(err.code).toBe('UPSTREAM_INVALID');
  });
});
