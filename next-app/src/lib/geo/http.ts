// src/lib/geo/http.ts
// Обёртка над fetch для всех апстримов geo-слоя (ADR-001, правило 4):
// явный таймаут на каждый запрос, ретраев нет, ответ парсится строго,
// любая ошибка — GeoError со стабильным кодом и статусом апстрима в cause.

import { GeoError, GeoErrorCode } from './types';

export interface FetchJsonOptions {
  url: string;
  init?: RequestInit;
  /** Полный бюджет запроса (connect + read): у fetch нет переносимого раздельного таймаута. */
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

/** Статус апстрима и тело ошибки — чтобы адаптер мог донастроить маппинг. */
export interface UpstreamFailureCause {
  status: number;
  bodyText: string;
}

export function upstreamStatus(error: unknown): number | undefined {
  if (error instanceof GeoError) {
    const cause = error.cause as UpstreamFailureCause | undefined;
    return cause?.status;
  }
  return undefined;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function statusToCode(status: number): GeoErrorCode {
  // «Валидный запрос, ничего не нашли» — семантика 404/422.
  if (status === 404 || status === 422) return 'NOT_FOUND';
  // Квоты и лежка провайдера — 429/5xx.
  if (status === 429 || status >= 500) return 'UPSTREAM_UNAVAILABLE';
  // Прочие 4xx (400, 401, 403, …): апстрим считает наш запрос/ключ плохими.
  return 'UPSTREAM_INVALID';
}

export async function fetchJson<T = unknown>(options: FetchJsonOptions): Promise<T> {
  const { url, init, timeoutMs } = options;
  const fetchImpl = options.fetchImpl ?? fetch;
  const host = hostOf(url);

  const controller = new AbortController();
  // Реальный fetch прерывается сигналом, но fetchImpl в тестах сигнал может
  // игнорировать — поэтому на abort ещё и явно реджектим гонку.
  const timeoutReject = new Promise<never>((_, reject) => {
    controller.signal.addEventListener(
      'abort',
      () => reject(new GeoError('UPSTREAM_TIMEOUT', `${host} не ответил за ${timeoutMs} мс`)),
      { once: true },
    );
  });

  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response: Response;
    try {
      response = await Promise.race([
        fetchImpl(url, { ...init, cache: 'no-store', signal: controller.signal }),
        timeoutReject,
      ]);
    } catch (error) {
      if (error instanceof GeoError) throw error; // таймаут — уже классифицирован
      throw new GeoError('UPSTREAM_UNAVAILABLE', `${host} недоступен: сеть упала`, error);
    }

    if (!response.ok) {
      // Тело ошибки читаем по возможности — оно уходит в cause для адаптеров и логов.
      const bodyText = await response.text().catch(() => '');
      throw new GeoError(
        statusToCode(response.status),
        `${host}: HTTP ${response.status}${bodyText ? ` — ${bodyText.slice(0, 200)}` : ''}`,
        { status: response.status, bodyText } satisfies UpstreamFailureCause,
      );
    }

    try {
      return (await Promise.race([response.json(), timeoutReject])) as T;
    } catch (error) {
      if (error instanceof GeoError) throw error; // таймаут во время чтения тела
      if (controller.signal.aborted) {
        throw new GeoError('UPSTREAM_TIMEOUT', `${host} не ответил за ${timeoutMs} мс`, error);
      }
      throw new GeoError('UPSTREAM_INVALID', `${host} вернул не-JSON ответ`, error);
    }
  } finally {
    clearTimeout(timer);
  }
}
