/**
 * Overpass Turbo (overpass-turbo.eu) — веб-интерфейс; API по умолчанию: overpass-api.de
 */
export const OVERPASS_MIRRORS = [
  'https://overpass.openstreetmap.ru/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.nch-plaza.com/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
] as const;

const USER_AGENT = 'IntelligentTrailsApp/1.0 (https://github.com/intelligent-trails)';

type OverpassMethod = 'POST' | 'GET';

interface PreferredMirror {
  endpoint: string;
  method: OverpassMethod;
}

let preferredMirror: PreferredMirror | null = null;

async function fetchOverpassOnce(
  endpoint: string,
  method: OverpassMethod,
  query: string,
  timeoutMs: number,
  cancelSignal?: AbortSignal
): Promise<{ elements: unknown[] }> {
  const timeout = new AbortController();
  const timeoutId = setTimeout(() => timeout.abort(), timeoutMs);
  const signals = cancelSignal
    ? [timeout.signal, cancelSignal]
    : [timeout.signal];
  const signal = signals.length > 1 ? AbortSignal.any(signals) : timeout.signal;

  try {
    const headers = {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
      Referer: 'https://overpass-turbo.eu/',
      ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    };

    const response = await fetch(
      method === 'POST'
        ? endpoint
        : `${endpoint}?data=${encodeURIComponent(query)}`,
      {
        method,
        headers,
        body: method === 'POST' ? `data=${encodeURIComponent(query)}` : undefined,
        cache: 'no-store',
        signal,
      }
    );

    if (!response.ok) {
      throw new Error(`${method} HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!Array.isArray(data.elements)) {
      throw new Error('invalid overpass response');
    }

    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchOverpassRace(
  query: string,
  timeoutMs: number
): Promise<{ elements: unknown[]; mirror: string; method: OverpassMethod }> {
  const cancelOthers = new AbortController();

  const attempts = OVERPASS_MIRRORS.flatMap((mirror) =>
    (['POST', 'GET'] as const).map((method) => ({ mirror, method }))
  );

  const tasks = attempts.map(async ({ mirror, method }) => {
    const data = await fetchOverpassOnce(mirror, method, query, timeoutMs, cancelOthers.signal);
    cancelOthers.abort();
    console.log(`[OSM] Overpass OK: ${mirror} (${method})`);
    return { elements: data.elements, mirror, method };
  });

  try {
    return await Promise.any(tasks);
  } catch (error) {
    cancelOthers.abort();
    throw error;
  }
}

export async function fetchOverpassQuery(
  query: string,
  timeoutMs = 8000
): Promise<{ elements: unknown[]; mirror: string; method: OverpassMethod }> {
  if (preferredMirror) {
    try {
      const data = await fetchOverpassOnce(
        preferredMirror.endpoint,
        preferredMirror.method,
        query,
        timeoutMs
      );
      return {
        elements: data.elements,
        mirror: preferredMirror.endpoint,
        method: preferredMirror.method,
      };
    } catch {
      preferredMirror = null;
    }
  }

  const result = await fetchOverpassRace(query, timeoutMs);
  preferredMirror = { endpoint: result.mirror, method: result.method };
  return result;
}

/** Сброс предпочитаемого зеркала (для тестов) */
export function resetPreferredOverpassMirror(): void {
  preferredMirror = null;
}