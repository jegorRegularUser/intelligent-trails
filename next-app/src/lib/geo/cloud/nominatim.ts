// src/lib/geo/cloud/nominatim.ts
// Nominatim public — fallback-геокодер (после Photon). Политика публичного
// инстанса: строго 1 запрос/сек и опознаваемый User-Agent. Лимитер резервирует
// слоты по времени старта запроса, поэтому параллельные вызовы выстраиваются.

import { GeoError } from '../types';
import { LatLng, ReverseGeocodeResult, SuggestItem } from '../types';
import { roundPoint } from '../cache';
import { fetchJson } from '../http';

export const NOMINATIM_SUGGEST_LIMIT = 8;
/** Радиус viewbox-bias для подсказок, м (bias, не ограничение). */
const SUGGEST_BIAS_RADIUS_M = 3000;

export interface NominatimAdapterOptions {
  baseUrl: string;
  userAgent: string;
  minIntervalMs: number;
  fetchImpl?: typeof fetch;
  timeoutMs: number;
  /** Инъекции для тестов. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

// ---------------------------------------------------------------------------
// Rate limiter: интервал между СТАРТАМИ запросов ≥ minIntervalMs
// ---------------------------------------------------------------------------

export type SleepFn = (ms: number) => Promise<void>;

const defaultSleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class RateLimiter {
  private lastSlotStart = -Infinity;

  constructor(
    private readonly minIntervalMs: number,
    private readonly sleep: SleepFn = defaultSleep,
    private readonly now: () => number = Date.now,
  ) {}

  async acquire(): Promise<void> {
    const t = this.now();
    const slotStart = Math.max(t, this.lastSlotStart + this.minIntervalMs);
    this.lastSlotStart = slotStart;
    // sleep вызывается всегда (и с нулём) — детерминированная запись слотов в тестах.
    await this.sleep(slotStart - t);
  }
}

// ---------------------------------------------------------------------------
// Ответы Nominatim (format=jsonv2)
// ---------------------------------------------------------------------------

interface NominatimPlace {
  [key: string]: unknown;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseOsmType(value: unknown): 'N' | 'W' | 'R' | undefined {
  if (value === 'N' || value === 'W' || value === 'R') return value;
  if (value === 'node') return 'N';
  if (value === 'way') return 'W';
  if (value === 'relation') return 'R';
  return undefined;
}

/** Первый сегмент display_name — обычно самое короткое узнаваемое имя. */
function titleFromDisplayName(displayName: string): string {
  return displayName.split(',')[0].trim() || displayName.trim();
}

function viewboxOf(center: LatLng): string {
  // Запад, север, восток, юг — формат Nominatim (lon,lat,lon,lat).
  const [lat, lng] = center;
  const latDelta = SUGGEST_BIAS_RADIUS_M / 111_320;
  const lngDelta = SUGGEST_BIAS_RADIUS_M / (111_320 * Math.cos((lat * Math.PI) / 180));
  return `${lng - lngDelta},${lat + latDelta},${lng + lngDelta},${lat - latDelta}`;
}

// ---------------------------------------------------------------------------
// Адаптер
// ---------------------------------------------------------------------------

export class NominatimAdapter {
  private readonly limiter: RateLimiter;

  constructor(private readonly options: NominatimAdapterOptions) {
    this.limiter = new RateLimiter(options.minIntervalMs, options.sleep, options.now);
  }

  async reverse(point: LatLng): Promise<ReverseGeocodeResult | null> {
    const [lat, lng] = roundPoint(point);
    const params = new URLSearchParams({
      format: 'jsonv2',
      lat: lat.toFixed(5),
      lon: lng.toFixed(5),
      zoom: '18',
    });
    const data = await this.request<NominatimPlace>('/reverse', params);

    // Nominatim отвечает 200 и {"error": "Unable to geocode"} — это честное «пусто».
    if (data && typeof data === 'object' && 'error' in data) return null;

    const displayName = asString(data.display_name);
    if (!displayName) {
      throw new GeoError('UPSTREAM_INVALID', 'Nominatim: в ответе нет display_name');
    }
    const tags: Record<string, string> = {};
    if (data.address && typeof data.address === 'object') {
      for (const [key, value] of Object.entries(data.address as Record<string, unknown>)) {
        if (typeof value === 'string') tags[key] = value;
      }
    }
    return {
      name: asString(data.name),
      address: displayName,
      kind: asString(data.type) ?? asString(data.category),
      osmId: isFiniteNumber(data.osm_id) ? data.osm_id : undefined,
      osmType: parseOsmType(data.osm_type),
      tags,
    };
  }

  async suggest(query: string, near?: LatLng): Promise<SuggestItem[]> {
    const params = new URLSearchParams({
      format: 'jsonv2',
      q: query,
      limit: String(NOMINATIM_SUGGEST_LIMIT),
    });
    if (near) params.set('viewbox', viewboxOf(roundPoint(near)));
    const data = await this.request<NominatimPlace[]>('/search', params);

    if (!Array.isArray(data)) {
      throw new GeoError('UPSTREAM_INVALID', 'Nominatim: ответ search не массив');
    }
    return data
      .map((item): SuggestItem | null => {
        const lat = Number(item.lat);
        const lng = Number(item.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        const displayName = asString(item.display_name);
        if (!displayName) return null;
        return {
          title: asString(item.name) ?? titleFromDisplayName(displayName),
          subtitle: displayName,
          coordinates: [lat, lng],
        };
      })
      .filter((item): item is SuggestItem => item !== null);
  }

  private async request<T>(path: string, params: URLSearchParams): Promise<T> {
    // Слот лимитера резервируем до каждого запроса: пауза между СТАРТАМИ
    // запросов к публичному Nominatim ≥ minIntervalMs, независимо от того,
    // как быстро отвечают предыдущие.
    await this.limiter.acquire();
    return fetchJson<T>({
      url: `${this.options.baseUrl}${path}?${params.toString()}`,
      timeoutMs: this.options.timeoutMs,
      fetchImpl: this.options.fetchImpl,
      init: { headers: { 'User-Agent': this.options.userAgent } },
    });
  }
}
