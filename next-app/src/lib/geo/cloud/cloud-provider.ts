// src/lib/geo/cloud/cloud-provider.ts
// CloudProvider — тир 1 из ADR-001: универсальный GeoProvider на публичных
// сервисах. Композиция адаптеров: валидация → кэш → ORS/Photon/Nominatim/
// Overpass. Движок прогулки не знает, кто под ним; PackProvider встанет сюда же.

import { GeoProvider, GeoPlace, LatLng, MatrixCell, PlaceCategory, ReverseGeocodeResult, RouteRequest, RouteSegment, SearchPlacesOptions, SuggestItem } from '../types';
import { pointKey, TtlLruCache } from '../cache';
import { CloudProviderConfig, resolveCloudConfig, resolveTimeouts, UPSTREAM_TIMEOUTS, UpstreamTimeouts } from './config';
import { assertValidAlternatives, assertValidPoint, assertValidWaypoints } from './validate';
import { OrsRoutingAdapter } from './ors';
import { PhotonAdapter } from './photon';
import { NominatimAdapter } from './nominatim';
import { OverpassPlacesAdapter } from './overpass-places';

const ROUTE_TTL_MS = 10 * 60_000;
const PLACES_TTL_MS = 10 * 60_000;
const REVERSE_TTL_MS = 60 * 60_000;
/** Пустой ответ reverse кэшим короче: «здесь ничего» устаревает быстрее. */
const REVERSE_NEGATIVE_TTL_MS = 5 * 60_000;
const SUGGEST_TTL_MS = 10 * 60_000;

export class CloudProvider implements GeoProvider {
  readonly id = 'cloud' as const;

  private readonly config: CloudProviderConfig;
  private readonly timeouts: UpstreamTimeouts;
  private readonly fetchImpl: typeof fetch;
  private readonly ors: OrsRoutingAdapter;
  private readonly photon: PhotonAdapter;
  private readonly nominatim: NominatimAdapter;
  private readonly overpass: OverpassPlacesAdapter;

  private readonly routeCache = new TtlLruCache<RouteSegment>({ maxEntries: 200, defaultTtlMs: ROUTE_TTL_MS });
  private readonly placesCache = new TtlLruCache<GeoPlace[]>({ maxEntries: 200, defaultTtlMs: PLACES_TTL_MS });
  /** V может быть null — кэш честного «здесь ничего не нашли». */
  private readonly reverseCache = new TtlLruCache<ReverseGeocodeResult | null>({ maxEntries: 300, defaultTtlMs: REVERSE_TTL_MS });
  private readonly suggestCache = new TtlLruCache<SuggestItem[]>({ maxEntries: 300, defaultTtlMs: SUGGEST_TTL_MS });

  constructor(partialConfig: Partial<CloudProviderConfig> = {}) {
    // Пустая строка = «ключа нет»: детерминированные тесты не зависят от окружения.
    this.config = resolveCloudConfig(partialConfig);
    this.timeouts = resolveTimeouts(partialConfig.timeouts ?? UPSTREAM_TIMEOUTS);
    this.fetchImpl = this.config.fetchImpl ?? fetch;

    const orsApiKey =
      this.config.orsApiKey !== undefined
        ? this.config.orsApiKey || undefined
        : process.env.OPENROUTESERVICE_API_KEY || undefined;

    this.ors = new OrsRoutingAdapter({
      apiKey: orsApiKey,
      baseUrl: this.config.orsBaseUrl,
      fetchImpl: this.fetchImpl,
      routeTimeoutMs: this.timeouts.orsRouteMs,
      matrixTimeoutMs: this.timeouts.orsMatrixMs,
    });
    this.photon = new PhotonAdapter({
      baseUrl: this.config.photonBaseUrl,
      fetchImpl: this.fetchImpl,
      timeoutMs: this.timeouts.photonMs,
    });
    this.nominatim = new NominatimAdapter({
      baseUrl: this.config.nominatimBaseUrl,
      userAgent: this.config.userAgent,
      minIntervalMs: this.config.nominatimMinIntervalMs,
      fetchImpl: this.fetchImpl,
      timeoutMs: this.timeouts.nominatimMs,
    });
    this.overpass = new OverpassPlacesAdapter({
      mirrors: this.config.overpassMirrors,
      userAgent: this.config.userAgent,
      fetchImpl: this.fetchImpl,
      timeoutMs: this.timeouts.overpassMs,
    });
  }

  async route(req: RouteRequest): Promise<RouteSegment> {
    assertValidWaypoints(req.waypoints);
    assertValidAlternatives(req.alternatives);

    const cacheKey = `route:${req.waypoints.map(pointKey).join('|')}`;
    const cached = this.routeCache.get(cacheKey);
    if (cached) return cached;

    // Ошибки не кэшируются: севшая квота не должна «отравить» маршрут на TTL.
    const segment = await this.ors.route(req.waypoints);
    this.routeCache.set(cacheKey, segment);
    return segment;
  }

  async matrix(sources: LatLng[], targets: LatLng[]): Promise<MatrixCell[]> {
    if (sources.length === 0 || targets.length === 0) return [];
    sources.forEach((point, index) => assertValidPoint(point, `sources[${index}]`));
    targets.forEach((point, index) => assertValidPoint(point, `targets[${index}]`));
    // Чанкинг ≤40 источников, glue индексов и кэш чанков — в OrsRoutingAdapter.
    return this.ors.matrix(sources, targets);
  }

  async searchPlaces(
    center: LatLng,
    category: PlaceCategory,
    opts?: SearchPlacesOptions,
  ): Promise<GeoPlace[]> {
    const cacheKey = `places:${pointKey(center)}:${category}:${opts?.radiusMeters ?? ''}:${
      opts?.toward ? pointKey(opts.toward) : ''
    }:${opts?.limit ?? ''}`;
    const cached = this.placesCache.get(cacheKey);
    if (cached) return cached;

    // Пустой ответ — настоящий ответ апстрима, кэшим на общий TTL.
    const places = await this.overpass.searchPlaces(center, category, opts);
    this.placesCache.set(cacheKey, places);
    return places;
  }

  async reverseGeocode(point: LatLng): Promise<ReverseGeocodeResult | null> {
    assertValidPoint(point, 'point');

    const cacheKey = `reverse:${pointKey(point)}`;
    const cached = this.reverseCache.get(cacheKey);
    if (cached !== undefined) return cached;

    // Лестница: Photon → Nominatim. «Оба сказали пусто» или «первый пусто,
    // второй упал» → null (честное «не знаем»); «оба упали» → GeoError.
    let photonFailed = false;
    try {
      const fromPhoton = await this.photon.reverse(point);
      if (fromPhoton) {
        this.reverseCache.set(cacheKey, fromPhoton);
        return fromPhoton;
      }
    } catch {
      photonFailed = true;
    }

    try {
      const fromNominatim = await this.nominatim.reverse(point);
      this.reverseCache.set(cacheKey, fromNominatim, fromNominatim ? undefined : REVERSE_NEGATIVE_TTL_MS);
      return fromNominatim;
    } catch (nominatimError) {
      if (photonFailed) throw nominatimError;
      this.reverseCache.set(cacheKey, null, REVERSE_NEGATIVE_TTL_MS);
      return null;
    }
  }

  async suggest(query: string, near?: LatLng): Promise<SuggestItem[]> {
    const trimmed = query.trim();
    if (trimmed.length === 0) return [];
    if (near) assertValidPoint(near, 'near');

    const cacheKey = `suggest:${trimmed.toLowerCase()}:${near ? pointKey(near) : ''}`;
    const cached = this.suggestCache.get(cacheKey);
    if (cached) return cached;

    // Лестница как в reverseGeocode, но результат — список: оба пусто → [].
    let photonFailed = false;
    try {
      const fromPhoton = await this.photon.suggest(trimmed, near);
      if (fromPhoton.length > 0) {
        this.suggestCache.set(cacheKey, fromPhoton);
        return fromPhoton;
      }
    } catch {
      photonFailed = true;
    }

    try {
      const fromNominatim = await this.nominatim.suggest(trimmed, near);
      this.suggestCache.set(cacheKey, fromNominatim);
      return fromNominatim;
    } catch (nominatimError) {
      if (photonFailed) throw nominatimError;
      return [];
    }
  }

  /** Пакетный тир (PackProvider) появится позже — облачный всегда «медленный». */
  async isFastArea(_point: LatLng): Promise<boolean> {
    assertValidPoint(_point, 'point');
    return false;
  }
}
