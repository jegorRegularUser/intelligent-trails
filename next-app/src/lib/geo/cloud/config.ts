// src/lib/geo/cloud/config.ts
// Конфигурация облачного тира. Все значения имеют дефолты; в тесты инъектится
// fetchImpl и endpoints. Ключ ORS по умолчанию берётся из окружения на уровне
// CloudProvider (config.orsApiKey ?? process.env.OPENROUTESERVICE_API_KEY).

export interface CloudProviderConfig {
  /**
   * Ключ OpenRouteService. Пустая строка = «ключа нет» — детерминированный
   * способ в тестах отсечь зависимость от окружения.
   */
  orsApiKey?: string;
  orsBaseUrl: string;
  photonBaseUrl: string;
  nominatimBaseUrl: string;
  overpassMirrors: readonly string[];
  /** Nominatim публично требует опознаваемый User-Agent (политика 1 rps). */
  userAgent: string;
  /** Минимальный интервал между стартами запросов к Nominatim, мс. */
  nominatimMinIntervalMs: number;
  fetchImpl?: typeof fetch;
  timeouts?: Partial<UpstreamTimeouts>;
}

export interface UpstreamTimeouts {
  /** POST /v2/directions/foot-walking/geojson */
  orsRouteMs: number;
  /** POST /v2/matrix/foot-walking (чанк ≤40 источников + все цели) */
  orsMatrixMs: number;
  photonMs: number;
  nominatimMs: number;
  overpassMs: number;
}

export const UPSTREAM_TIMEOUTS: UpstreamTimeouts = {
  orsRouteMs: 12_000,
  orsMatrixMs: 15_000,
  photonMs: 6_000,
  nominatimMs: 6_000,
  overpassMs: 12_000,
};

/** Зеркала Overpass — тот же набор, что использует services/overpassClient.ts. */
export const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
  'https://overpass.nch-plaza.com/api/interpreter',
] as const;

export const DEFAULT_USER_AGENT =
  'IntelligentTrails/1.0 (geo-provider; https://github.com/intelligent-trails)';

export function resolveCloudConfig(partial: Partial<CloudProviderConfig> = {}): CloudProviderConfig {
  return {
    orsBaseUrl: 'https://api.openrouteservice.org',
    photonBaseUrl: 'https://photon.komoot.io',
    nominatimBaseUrl: 'https://nominatim.openstreetmap.org',
    overpassMirrors: OVERPASS_MIRRORS,
    userAgent: DEFAULT_USER_AGENT,
    nominatimMinIntervalMs: 1000,
    ...partial,
  };
}

export function resolveTimeouts(partial?: Partial<UpstreamTimeouts>): UpstreamTimeouts {
  return { ...UPSTREAM_TIMEOUTS, ...partial };
}
