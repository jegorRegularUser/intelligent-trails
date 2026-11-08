// src/lib/geo/cloud/overpass-places.ts
// POI-адаптер облачного тира: поиск мест категории через Overpass.
// Переиспользует идеи services/osm.ts и services/overpassClient.ts (зеркала,
// эскалация радиуса, коридорный поиск), но живёт внутри контракта GeoProvider
// и маппит теги из constants/categories.ts.

import { GeoError } from '../types';
import { GeoPlace, LatLng, SearchPlacesOptions } from '../types';
import { PLACE_CATEGORIES, CategoryId } from '@/constants/categories';
import { getDistanceInMeters } from '@/utils/geo';
import { fetchJson, UpstreamFailureCause } from '../http';
import { assertValidPoint } from './validate';
import { roundPoint } from '../cache';

/** Дефолтный потолок выдачи, если opts.limit не задан. */
const DEFAULT_LIMIT = 50;
/** Стоп эскалации радиуса внутри одной точки поиска. */
const MIN_RESULTS_PER_CENTER = 8;
/** Стоп коридорного поиска. */
const MIN_RESULTS_TOTAL = 12;

export interface OverpassAdapterOptions {
  mirrors: readonly string[];
  userAgent: string;
  fetchImpl?: typeof fetch;
  timeoutMs: number;
}

interface OverpassElement {
  type?: unknown;
  id?: unknown;
  lat?: unknown;
  lon?: unknown;
  center?: { lat?: unknown; lon?: unknown };
  tags?: Record<string, unknown>;
}

interface OverpassResponse {
  elements?: unknown;
}

// ---------------------------------------------------------------------------
// Overpass-запрос
// ---------------------------------------------------------------------------

function buildQuery(center: LatLng, osmTag: string, category: string, radius: number): string {
  const [lat, lon] = center;
  if (category === 'park') {
    // Парк — это и garden:type=public; «скверы» отсеиваются маппингом ниже.
    return [
      '[out:json][timeout:12];',
      '(',
      `  nwr["leisure"="park"](around:${radius},${lat},${lon});`,
      `  nwr["leisure"="garden"]["garden:type"="public"](around:${radius},${lat},${lon});`,
      ');',
      'out center;',
    ].join('\n');
  }
  return [
    '[out:json][timeout:12];',
    `nwr${osmTag}(around:${radius},${lat},${lon});`,
    'out center;',
  ].join('\n');
}

/** Точки коридорного поиска: от центра к цели через середину (идея osm.ts). */
export function corridorSearchPoints(from: LatLng, toward?: LatLng): LatLng[] {
  if (!toward) return [from];
  // Середину тоже округляем — в апстрим уходят координаты ≤5 знаков.
  const midpoint: LatLng = roundPoint([(from[0] + toward[0]) / 2, (from[1] + toward[1]) / 2]);
  return [from, midpoint, toward];
}

// ---------------------------------------------------------------------------
// Маппинг элементов Overpass → GeoPlace
// ---------------------------------------------------------------------------

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function elementPoint(element: OverpassElement): LatLng | undefined {
  if (isFiniteNumber(element.lat) && isFiniteNumber(element.lon)) {
    return [element.lat, element.lon];
  }
  if (isFiniteNumber(element.center?.lat) && isFiniteNumber(element.center?.lon)) {
    return [element.center.lat, element.center.lon];
  }
  return undefined;
}

function stringTagsOf(tags: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(tags)) {
    if (typeof value === 'string') result[key] = value;
  }
  return result;
}

function mapElements(
  elements: unknown[],
  category: string,
  searchCenter: LatLng,
  radiusMeters: number,
): GeoPlace[] {
  const places: GeoPlace[] = [];
  for (const raw of elements) {
    const element = raw as OverpassElement;
    if (!element.tags || typeof element.tags !== 'object') continue;
    const name = element.tags.name;
    if (typeof name !== 'string' || name.length === 0) continue;

    const point = elementPoint(element);
    if (!point) continue;
    if (getDistanceInMeters(searchCenter, point) > radiusMeters) continue;

    const tags = stringTagsOf(element.tags);

    // Парк: имя-«сквер» без слова «парк» — мимо (эвристика из osm.ts).
    if (category === 'park') {
      const isPark =
        tags.leisure === 'park' ||
        (tags.leisure === 'garden' && tags['garden:type'] === 'public');
      const nameLower = name.toLowerCase();
      if (!isPark || (nameLower.includes('сквер') && !nameLower.includes('парк'))) continue;
    }

    // Элемент без числового id не собираем — стабильный id нужен карточкам.
    if (!isFiniteNumber(element.id)) continue;
    const elementType = typeof element.type === 'string' ? element.type : 'node';
    const rating = parseFloat(tags.rating || tags.stars || '');
    places.push({
      id: `${elementType}/${element.id}`,
      name,
      category,
      coordinates: point,
      address:
        tags['addr:street'] && tags['addr:housenumber']
          ? `${tags['addr:street']}, ${tags['addr:housenumber']}`
          : undefined,
      rating: Number.isFinite(rating) && rating > 0 ? rating : undefined,
      tags,
      indoor: tags.indoor === 'yes' || tags.level !== undefined ? true : undefined,
    });
  }
  return places;
}

function mergePlaces(
  target: GeoPlace[],
  incoming: GeoPlace[],
  seenIds: Set<string>,
  seenNames: Set<string>,
): void {
  for (const place of incoming) {
    const id = String(place.id);
    const nameKey = place.name.toLowerCase().trim();
    if (seenIds.has(id) || seenNames.has(nameKey)) continue;
    seenIds.add(id);
    seenNames.add(nameKey);
    target.push(place);
  }
}

// ---------------------------------------------------------------------------
// Адаптер
// ---------------------------------------------------------------------------

export class OverpassPlacesAdapter {
  private preferredMirror: string | null = null;

  constructor(private readonly options: OverpassAdapterOptions) {}

  async searchPlaces(
    center: LatLng,
    category: string,
    opts?: SearchPlacesOptions,
  ): Promise<GeoPlace[]> {
    assertValidPoint(center, 'center');
    if (opts?.toward) assertValidPoint(opts.toward, 'toward');

    const categoryConfig = PLACE_CATEGORIES[category as CategoryId];
    if (!categoryConfig) {
      throw new GeoError('INVALID_INPUT', `Категория «${category}» не поддерживается облачным тиром`);
    }

    const limit = opts?.limit ?? DEFAULT_LIMIT;
    const radiuses: readonly number[] =
      opts?.radiusMeters !== undefined ? [opts.radiusMeters] : categoryConfig.radiuses;
    // В апстрим уходят округлённые до 5 знаков координаты — как в ключах кэша.
    const searchCenters = corridorSearchPoints(roundPoint(center), opts?.toward ? roundPoint(opts.toward) : undefined);

    const places: GeoPlace[] = [];
    const seenIds = new Set<string>();
    const seenNames = new Set<string>();
    let lastError: GeoError | null = null;

    outer: for (const searchCenter of searchCenters) {
      for (const radius of radiuses) {
        const query = buildQuery(searchCenter, categoryConfig.osmTag, category, radius);
        let elements: unknown[];
        try {
          elements = await this.fetchElements(query);
        } catch (error) {
          // Частичный результат честнее ошибки, но «ничего не нашли + зеркала
          // упали» — это лежка апстрима, отдаём её наверх.
          lastError = error instanceof GeoError
            ? error
            : new GeoError('UPSTREAM_UNAVAILABLE', 'Overpass упал', error);
          break outer;
        }
        mergePlaces(places, mapElements(elements, category, searchCenter, radius), seenIds, seenNames);
        if (places.length >= Math.min(limit, MIN_RESULTS_PER_CENTER)) break;
      }
      if (places.length >= Math.min(limit, MIN_RESULTS_TOTAL)) break outer;
    }

    if (places.length === 0 && lastError) throw lastError;

    const sorted = [...places].sort(
      (a, b) => getDistanceInMeters(center, a.coordinates) - getDistanceInMeters(center, b.coordinates),
    );
    return sorted.slice(0, limit);
  }

  /**
   * Один запрос: сначала sticky-зеркало, при падении — один круг по остальным
   * (Promise.any). Победитель круга становится sticky; вместо ретраев —
   * только смена зеркала, POST не повторяется (ADR-001, правило 4).
   */
  private async fetchElements(query: string): Promise<unknown[]> {
    const { mirrors } = this.options;
    const first =
      this.preferredMirror && mirrors.includes(this.preferredMirror) ? this.preferredMirror : mirrors[0];
    const rest = mirrors.filter((mirror) => mirror !== first);

    try {
      return await this.fetchOnce(first, query);
    } catch (firstError) {
      try {
        const winner = await Promise.any(
          rest.map(async (mirror) => ({ mirror, elements: await this.fetchOnce(mirror, query) })),
        );
        this.preferredMirror = winner.mirror;
        return winner.elements;
      } catch (raceError) {
        const cause: UpstreamFailureCause | undefined =
          firstError instanceof GeoError
            ? (firstError.cause as UpstreamFailureCause | undefined)
            : undefined;
        // Мусор с первого зеркала → UPSTREAM_INVALID; лежка → UPSTREAM_UNAVAILABLE.
        const code =
          firstError instanceof GeoError && firstError.code === 'UPSTREAM_INVALID'
            ? 'UPSTREAM_INVALID'
            : 'UPSTREAM_UNAVAILABLE';
        throw new GeoError(
          code,
          `Все зеркала Overpass недоступны (${rest.length + 1} шт.)`,
          { firstError, raceError, ...cause },
        );
      }
    }
  }

  private async fetchOnce(mirror: string, query: string): Promise<unknown[]> {
    const data = await fetchJson<OverpassResponse>({
      url: mirror,
      timeoutMs: this.options.timeoutMs,
      fetchImpl: this.options.fetchImpl,
      init: {
        method: 'POST',
        headers: {
          'User-Agent': this.options.userAgent,
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `data=${encodeURIComponent(query)}`,
      },
    });
    if (!Array.isArray(data.elements)) {
      throw new GeoError('UPSTREAM_INVALID', `Overpass (${mirror}): elements не массив`);
    }
    return data.elements;
  }
}
