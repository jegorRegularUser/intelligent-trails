// src/lib/geo/cloud/ors.ts
// OpenRouteService foot-walking: роутинг и матрица (ADR-001, тир 1).
// ORS принимает пары [lng, lat] и ключ в заголовке Authorization;
// бесплатные квоты/отсутствие ключа для маршрутов честно маппятся в NO_ROUTE.

import { GeoError } from '../types';
import { LatLng, MatrixCell, RouteSegment } from '../types';
import { roundPoint, pointKey, TtlLruCache } from '../cache';
import { fetchJson, upstreamStatus, UpstreamFailureCause } from '../http';
import { toLngLat } from './validate';
import { OrsKeyPool } from './orsKeyPool';

/** Лимит источников в одном матричном запросе (бюджет бесплатного тира). */
export const MATRIX_SOURCES_PER_REQUEST = 40;

/**
 * Контракт alternative_routes OpenRouteService (docs/walk-loop-quality.md R3.a):
 * работает только на запросах из 2 координат, target_count ≤ 3 (включая
 * основной), дистанция ≤ 100 км. Когда параметры неудовлетворимы, ORS отвечает
 * HTTP 400 с кодом 2011 в теле, а не пустым FeatureCollection; фич может
 * вернуться меньше target_count (ORS issue #2475).
 */
export const ORS_MAX_ALTERNATIVES = 2;
/** Явные share/weight — дефолты ORS не гарантированы контрактом. */
const ORS_ALTERNATIVES_SHARE_FACTOR = 0.6;
const ORS_ALTERNATIVES_WEIGHT_FACTOR = 1.3;

export interface OrsAdapterOptions {
  /** Одиночный ключ (обратная совместимость). Для пула используйте apiKeys. */
  apiKey?: string;
  /** Пул ключей: квоты размазываются round-robin'ом, исчерпанные исключаются. */
  apiKeys?: string[];
  baseUrl: string;
  fetchImpl?: typeof fetch;
  routeTimeoutMs: number;
  matrixTimeoutMs: number;
}

// ---------------------------------------------------------------------------
// Типы ответов ORS (парсим строго — мусор это UPSTREAM_INVALID)
// ---------------------------------------------------------------------------

interface OrsGeoJsonResponse {
  type?: unknown;
  features?: unknown;
}

interface OrsMatrixResponse {
  durations?: unknown;
  distances?: unknown;
}

// ---------------------------------------------------------------------------
// Ошибки
// ---------------------------------------------------------------------------

/**
 * Донастройка http-маппинга под семантику роутинга:
 * - нет ключа / ключ отклонён / квота исчерпана → NO_ROUTE («маршрут не построился»,
 *   движок честно деградирует, а не показывает «сервис упал»);
 * - 422 от ORS («не смогли найти маршрут») → NO_ROUTE;
 * - лежка/таймаут/мусор остаются UPSTREAM_*.
 */
function mapOrsError(error: unknown, action: string): unknown {
  if (!(error instanceof GeoError)) {
    return new GeoError('UPSTREAM_UNAVAILABLE', `ORS упал при «${action}»`, error);
  }
  const status = upstreamStatus(error);
  // cause пробрасываем как есть (UpstreamFailureCause со статусом): mapOrsError
  // может вызываться дважды на одну ошибку (внутри requestMatrix и в ротации
  // withKeyRotation) — без прокидывания статус теряется и ротация слепнет.
  if (error.code === 'NOT_FOUND') {
    return new GeoError('NO_ROUTE', `ORS не построил ${action}: ${error.message}`, error.cause);
  }
  if (status === 401 || status === 403) {
    return new GeoError('NO_ROUTE', `ORS отклонил ключ OPENROUTESERVICE_API_KEY (HTTP ${status})`, error.cause);
  }
  if (status === 429) {
    return new GeoError('NO_ROUTE', 'Квота OpenRouteService исчерпана — попробуйте позже', error.cause);
  }
  return error;
}

/**
 * «ORS не смог построить альтернативные маршруты» — легальный отказ режима, а
 * не лежка: 400 с кодом 2011 в теле (statusToCode маппит его в
 * UPSTREAM_INVALID) и 422 «маршрут не нашли». Квота/ключ/лежка сюда не входят:
 * там честный throw, который обработает лестница деградации выше.
 */
function isAlternativesRefusal(error: unknown): boolean {
  if (!(error instanceof GeoError)) return false;
  return upstreamStatus(error) === 400 || error.code === 'NOT_FOUND';
}

// ---------------------------------------------------------------------------
// Парсинг
// ---------------------------------------------------------------------------

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

interface OrsFeature {
  geometry?: { coordinates?: unknown };
  properties?: { summary?: { distance?: unknown; duration?: unknown } };
}

function parseRouteFeature(feature: unknown): RouteSegment {
  const f = feature as OrsFeature;
  const summary = f.properties?.summary;
  if (!isFiniteNumber(summary?.distance) || !isFiniteNumber(summary?.duration)) {
    throw new GeoError('UPSTREAM_INVALID', 'ORS: в ответе нет summary.distance/duration');
  }
  let geometry: LatLng[] = [];
  const coordinates = f.geometry?.coordinates;
  if (coordinates !== undefined) {
    if (!Array.isArray(coordinates)) {
      throw new GeoError('UPSTREAM_INVALID', 'ORS: geometry.coordinates не массив');
    }
    geometry = coordinates.map((pair): LatLng => {
      if (!Array.isArray(pair) || !isFiniteNumber(pair[0]) || !isFiniteNumber(pair[1])) {
        throw new GeoError('UPSTREAM_INVALID', 'ORS: битая точка в geometry.coordinates');
      }
      // ORS отдаёт [lng, lat] — возвращаем к порядку приложения.
      return [pair[1], pair[0]];
    });
  }
  return {
    distanceMeters: summary.distance as number,
    durationSeconds: summary.duration as number,
    geometry,
    source: 'cloud',
  };
}

function parseGeojsonRoute(data: OrsGeoJsonResponse): RouteSegment {
  if (data.type !== 'FeatureCollection' || !Array.isArray(data.features) || data.features.length === 0) {
    throw new GeoError('NO_ROUTE', 'ORS вернул пустой набор маршрутов');
  }
  return parseRouteFeature(data.features[0]);
}

/**
 * Разбор multi-feature ответа (alternative_routes, R3.a): цикл по ВСЕМ фичам,
 * основной — первая. Ломаная вторичная фича даёт «маршрутов меньше» (ORS
 * issue #2475 и соседние причуды), а не падение; ломаная ПЕРВАЯ фича или ни
 * одной годной — пустой массив: вызывающая сторона деградирует на обычный
 * route, лег всё равно получит честные метрики.
 */
function parseGeojsonRoutes(data: OrsGeoJsonResponse): RouteSegment[] {
  if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
    throw new GeoError('UPSTREAM_INVALID', 'ORS: ответ не FeatureCollection');
  }
  if (data.features.length === 0) return [];
  const first = parseRouteFeatureSafe(data.features[0]);
  if (!first) return [];
  const segments: RouteSegment[] = [first];
  for (let i = 1; i < data.features.length; i++) {
    const segment = parseRouteFeatureSafe(data.features[i]);
    if (segment) segments.push(segment);
  }
  return segments;
}

function parseRouteFeatureSafe(feature: unknown): RouteSegment | null {
  try {
    return parseRouteFeature(feature);
  } catch {
    return null;
  }
}

/** ORS кладёт null в ячейки матрицы для недостижимых пар; мусор трактуем так же. */
function cellValue(value: unknown): number | null {
  return isFiniteNumber(value) && value >= 0 ? value : null;
}

function parseMatrixRows(
  data: OrsMatrixResponse,
  sourceCount: number,
  targetCount: number,
): { durations: (number | null)[][]; distances: (number | null)[][] } {
  const parse = (raw: unknown, name: string): (number | null)[][] => {
    if (!Array.isArray(raw) || raw.length !== sourceCount) {
      throw new GeoError('UPSTREAM_INVALID', `ORS matrix: поле ${name} не матрица ${sourceCount}×${targetCount}`);
    }
    return raw.map((row, rowIndex) => {
      if (!Array.isArray(row) || row.length !== targetCount) {
        throw new GeoError('UPSTREAM_INVALID', `ORS matrix: строка ${rowIndex} ${name} не длины ${targetCount}`);
      }
      return row.map(cellValue);
    });
  };
  return {
    durations: parse(data.durations, 'durations'),
    distances: parse(data.distances, 'distances'),
  };
}

// ---------------------------------------------------------------------------
// Адаптер
// ---------------------------------------------------------------------------

export class OrsRoutingAdapter {
  /** Кэш ответов матрицы — ключ по округлённым locations чанка (ADR-001, правило 3). */
  private readonly matrixCache = new TtlLruCache<{
    durations: (number | null)[][];
    distances: (number | null)[][];
  }>({ maxEntries: 200, defaultTtlMs: 10 * 60_000 });

  /** Пул ключей: одиночный apiKey считается пулом из одного. */
  private readonly keyPool: OrsKeyPool;

  constructor(private readonly options: OrsAdapterOptions) {
    const keys = options.apiKeys && options.apiKeys.length > 0
      ? options.apiKeys
      : options.apiKey
        ? [options.apiKey]
        : [];
    this.keyPool = new OrsKeyPool(keys);
  }

  /**
   * Выполнить запрос ORS с ротацией ключей: 403/429 — квота исчерпана,
   * ключ помечается до сброса, запрос мгновенно уходит на следующий живой.
   * Пустой пул — прежняя семантика requireKey (NO_ROUTE «ключ не задан»).
   */
  private async withKeyRotation<T>(
    action: string,
    run: (apiKey: string) => Promise<T>,
  ): Promise<T> {
    if (this.keyPool.size === 0) {
      throw new GeoError(
        'NO_ROUTE',
        `OPENROUTESERVICE_API_KEY не задан — ${action} на облачном тире недоступно`,
      );
    }
    for (let attempt = 0; attempt < this.keyPool.size; attempt++) {
      const apiKey = this.keyPool.current();
      try {
        return await run(apiKey);
      } catch (error) {
        const status = upstreamStatus(error);
        if (status === 403 || status === 429) {
          const next = this.keyPool.markExhausted(apiKey);
          if (next) continue; // квота этого ключа кончилась — пробуем соседний
        }
        throw mapOrsError(error, action);
      }
    }
    throw new GeoError('UPSTREAM_UNAVAILABLE', `ORS: все ключи ушли в отказ при «${action}»`);
  }

  async route(waypoints: LatLng[], alternatives = 0): Promise<RouteSegment> {
    const segments = await this.requestRoutes(waypoints, alternatives);
    return segments[0];
  }

  /**
   * Альтернативные маршруты по ДВУМ вейпоинтам, основной первым (R3.a).
   * Деградация = «альтернатив нет», не NO_ROUTE: 400/2011, пустой набор,
   * одна фича — лег строится обычным route; наверх не бросается. Реальные
   * лежки/квоты (429/5xx/таймаут) бросаются как есть — их лечит лестница выше.
   */
  async routeWithAlternatives(waypoints: LatLng[], alternatives: number): Promise<RouteSegment[]> {
    const alts = Math.max(0, Math.min(Math.floor(alternatives), ORS_MAX_ALTERNATIVES));
    if (alts <= 0 || waypoints.length !== 2) {
      // Контракт ORS: alternative_routes только на запросах из 2 координат.
      return [await this.route(waypoints)];
    }
    try {
      const data = await this.requestDirections(waypoints, alts);
      const segments = parseGeojsonRoutes(data);
      if (segments.length > 0) return segments;
    } catch (error) {
      if (!isAlternativesRefusal(error)) throw error;
    }
    // 400/2011 («не смогли удовлетворить параметры») или пустой набор —
    // альтернатив нет, но сам маршрут между точками существует.
    return [await this.route(waypoints)];
  }

  private async requestRoutes(waypoints: LatLng[], alternatives: number): Promise<RouteSegment[]> {
    if (alternatives <= 0 || waypoints.length !== 2) {
      const data = await this.requestDirections(waypoints, 0);
      return [parseGeojsonRoute(data)];
    }
    return this.routeWithAlternatives(waypoints, alternatives);
  }

  private async requestDirections(waypoints: LatLng[], alternatives: number): Promise<OrsGeoJsonResponse> {
    const url = `${this.options.baseUrl}/v2/directions/foot-walking/geojson`;
    const body: Record<string, unknown> = {
      // Округление до 5 знаков (~1.1 м) — согласовано с ключами кэша выше по стеку.
      coordinates: waypoints.map((point) => toLngLat(roundPoint(point))),
      elevation: false,
      instructions: false,
    };
    if (alternatives > 0) {
      // target_count включает ОСНОВНОЙ маршрут; weight_factor явный —
      // дефолт ORS не гарантирован (R3.a).
      body.alternative_routes = {
        target_count: Math.min(alternatives + 1, ORS_MAX_ALTERNATIVES + 1),
        share_factor: ORS_ALTERNATIVES_SHARE_FACTOR,
        weight_factor: ORS_ALTERNATIVES_WEIGHT_FACTOR,
      };
    }

    return this.withKeyRotation('роутинг', (apiKey) =>
      fetchJson<OrsGeoJsonResponse>({
        url,
        timeoutMs: this.options.routeTimeoutMs,
        fetchImpl: this.options.fetchImpl,
        init: {
          method: 'POST',
          headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      }));
  }

  /**
   * Матрица источник×цель. Чанкинг: источников ≤40 на запрос, ВСЕ цели в
   * каждом запросе. Локации запроса = [чанк источников, …, все цели],
   * sources/targets — индексы ОТНОСИТЕЛЬНО этого массива (баг со смешением
   * глобальных и локальных индексов уже ловили — тесты фиксируют склейку).
   */
  async matrix(sources: LatLng[], targets: LatLng[]): Promise<MatrixCell[]> {
    if (sources.length === 0 || targets.length === 0) return [];

    const roundedTargets = targets.map(roundPoint);
    const targetCount = roundedTargets.length;
    const cells: MatrixCell[] = [];

    for (let chunkStart = 0; chunkStart < sources.length; chunkStart += MATRIX_SOURCES_PER_REQUEST) {
      const chunk = sources
        .slice(chunkStart, chunkStart + MATRIX_SOURCES_PER_REQUEST)
        .map(roundPoint);
      const sourceCount = chunk.length;
      const locations = [...chunk.map(toLngLat), ...roundedTargets.map(toLngLat)];

      const cacheKey = `matrix:${[...chunk, ...roundedTargets].map(pointKey).join('|')}`;
      const cached = this.matrixCache.get(cacheKey);
      // Каждый чанк — свой запрос с ротацией: исчерпание квоты может случиться
      // посреди матрицы, трафик доедет на соседнем ключе.
      const rows = cached
        ?? (await this.withKeyRotation('матрица расстояний', (apiKey) =>
          this.requestMatrix(apiKey, locations, sourceCount, targetCount)));
      if (!cached) this.matrixCache.set(cacheKey, rows);

      for (let localRow = 0; localRow < sourceCount; localRow++) {
        for (let col = 0; col < targetCount; col++) {
          cells.push({
            sourceIndex: chunkStart + localRow,
            targetIndex: col,
            distanceMeters: rows.distances[localRow][col],
            durationSeconds: rows.durations[localRow][col],
          });
        }
      }
    }

    return cells;
  }

  private async requestMatrix(
    apiKey: string,
    locations: [number, number][],
    sourceCount: number,
    targetCount: number,
  ): Promise<{ durations: (number | null)[][]; distances: (number | null)[][] }> {
    const body = {
      locations,
      sources: Array.from({ length: sourceCount }, (_, index) => index),
      // В API ORS параметр называется destinations, не targets (проверено
      // живым запросом: с 'targets' ORS отвечает 6011 Unknown parameter)
      destinations: Array.from({ length: targetCount }, (_, index) => sourceCount + index),
      metrics: ['distance', 'duration'],
    };

    let data: OrsMatrixResponse;
    try {
      data = await fetchJson<OrsMatrixResponse>({
        url: `${this.options.baseUrl}/v2/matrix/foot-walking`,
        timeoutMs: this.options.matrixTimeoutMs,
        fetchImpl: this.options.fetchImpl,
        init: {
          method: 'POST',
          headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      });
    } catch (error) {
      throw mapOrsError(error, 'матрица расстояний');
    }
    return parseMatrixRows(data, sourceCount, targetCount);
  }
}

// Экспорт для тестов: в cause ошибки уровень статуса нужен и снаружи.
export type { UpstreamFailureCause };
