// Общие фейки для юнит-тестов geo-слоя: фейковый fetch с записью вызовов,
// ноль живой сети (ADR-001, правило 6).

export interface RecordedCall {
  url: string;
  init?: RequestInit;
}

export interface FakeFetch {
  fetch: typeof fetch;
  calls: RecordedCall[];
}

export type FakeHandler = (url: string, init?: RequestInit) => Response | Promise<Response>;

/** Фейковый fetch: синхронные throw превращает в reject (как сеть), всё записывает. */
export function createFakeFetch(handler: FakeHandler): FakeFetch {
  const calls: RecordedCall[] = [];
  const fetchImpl = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });
    return Promise.resolve().then(() => handler(url, init));
  }) as typeof fetch;
  return { fetch: fetchImpl, calls };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Response-подобный объект с заданным json() — для веток строгого парсинга. */
export function responseWithJson(payload: () => Promise<unknown>, ok = true, status = 200): Response {
  return { ok, status, json: payload } as unknown as Response;
}

export function parseBody(init?: RequestInit): Record<string, unknown> {
  if (!init?.body || typeof init.body !== 'string') {
    throw new Error('у запроса нет строкового body');
  }
  return JSON.parse(init.body) as Record<string, unknown>;
}

/** Точки в центре Москвы — живые координаты, но сеть в юнит-тестах не дёргается. */
export const MOSCOW: [number, number] = [55.751244, 37.618423];
export const ZARYADYE: [number, number] = [55.751032, 37.629789];
