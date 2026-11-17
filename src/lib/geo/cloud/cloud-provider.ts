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
/**
 * Сколько маршрутов просит routeAlternatives без явного alternatives:
 * максимум контракта ORS — 3 включая основной (движок выбирает из трёх,
 * квота платит одним запросом).
 */
const ROUTE_ALTERNATIVES_DEFAULT = 2;
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
  /** Ответы routeAlternatives: массив маршрутов, основной первым (R3.a). */
  private readonly routeAltCache = new TtlLruCache<RouteSegment[]>({ maxEntries: 100, defaultTtlMs: ROUTE_TTL_MS });
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
    // Пул: env OPENROUTESERVICE_API_KEYS (через запятую) + ключи из конфига.
    // Одиночный ключ — частный случай пула из одного.
    const orsApiKeys = [
      ...(this.config.orsApiKeys ?? []),
      ...(orsApiKey ? [orsApiKey] : []),
      ...(process.env.OPENROUTESERVICE_API_KEYS ?? '')
        .split(',')
        .map((key) => key.trim())
        .filter(Boolean),
    ];

    this.ors = new OrsRoutingAdapter({
      apiKeys: orsApiKeys,
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

    // Кэш-ключ включает alternatives (R3.a): без него первый ответ с
    // альтернативами закэшировался бы для всех последующих запросов без них.
    const alternatives = req.alternatives ?? 0;
    const cacheKey = `route:${req.waypoints.map(pointKey).join('|')}:${alternatives}`;
    const cached = this.routeCache.get(cacheKey);
    if (cached) return cached;

    // Ошибки не кэшируются: севшая квота не должна «отравить» маршрут на TTL.
    const segment = await this.ors.route(req.waypoints, alternatives);
    this.routeCache.set(cacheKey, segment);
    return segment;
  }

  /**
   * Альтернативные маршруты, основной первым (R3.a): до 3 одним
   * directions-запросом — это 1 запрос на ногу, не 3. Отдельный кэш: ответ
   * шире одиночного route, смешивать ключи нельзя.
   */
  async routeAlternatives(req: RouteRequest): Promise<RouteSegment[]> {
    assertValidWaypoints(req.waypoints);
    assertValidAlternatives(req.alternatives);

    const alternatives = req.alternatives ?? ROUTE_ALTERNATIVES_DEFAULT;
    const cacheKey = `route-alt:${req.waypoints.map(pointKey).join('|')}:${alternatives}`;
    const cached = this.routeAltCache.get(cacheKey);
    if (cached) return cached;

    const segments = await this.ors.routeWithAlternatives(req.waypoints, alternatives);
    this.routeAltCache.set(cacheKey, segments);
    return segments;
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
