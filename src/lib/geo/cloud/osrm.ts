// src/lib/geo/cloud/osrm.ts
// OSRM routed-foot на публичном инстансе FOSSGIS (routing.openstreetmap.de,
// тот же, что обслуживает openstreetmap.org): роутинг и матрица БЕЗ КЛЮЧА.
// Роль — фолбэк роутинга облачного тира (ADR-004): единственный живой роутер,
// когда ключа ORS нет вообще; с ключом ORS — одна запасная попытка после
// отказа ORS. Публичный инстанс — fair use: 15 с таймаут, не больше одного
// запроса в полёте на примитив, ретраев нет (свой кэш + мемо-порт волны 1
// режут повторы), чанки матрицы режутся по бюджету длины URL.

import { GeoError } from '../types';
import { LatLng, MatrixCell, RouteSegment } from '../types';
import { pointKey, roundPoint, TtlLruCache } from '../cache';
import { fetchJson } from '../http';
import { toLngLat } from './validate';

/**
 * Бюджет длины URL одного запроса (OSRM — GET, POST у него нет). Координата
 * «37.61842,55.75124» — ~18 символов, поэтому при 8000 символов в чанк
 * помещается пара сотен точек — чанкинг по длине, а не фиксированным числом.
 * Планирование чанков считает worst-case строку «179.99999,89.99999», так что
 * любой реальный чанк гарантированно короче бюджета.
 */
export const OSRM_MAX_URL_LENGTH = 8000;

export interface OsrmAdapterOptions {
  /** Например https://routing.openstreetmap.de/routed-foot (профиль /foot в пути). */
  baseUrl: string;
  fetchImpl?: typeof fetch;
  routeTimeoutMs: number;
  matrixTimeoutMs: number;
  /** Инъекция для тестов: бюджет длины URL вместо OSRM_MAX_URL_LENGTH. */
  maxUrlLength?: number;
}

// ---------------------------------------------------------------------------
// Очередь на 1 запрос в полёте (fair use публичного инстанса, ADR-004)
// ---------------------------------------------------------------------------

/**
 * Простая сериализующая очередь: каждая задача стартует только после
 * завершения предыдущей. Отдельный инстанс на примитив — route и matrix не
 * блокируют друг друга, но два route подряд идут строго один за другим.
 */
export class SerialQueue {
  private tail: Promise<void> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const gate = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    return gate.then(task).finally(release);
  }
}

// ---------------------------------------------------------------------------
// Типы ответов OSRM (парсим строго — мусор это UPSTREAM_INVALID)
// ---------------------------------------------------------------------------

interface OsrmRouteResponse {
  code?: unknown;
  routes?: unknown;
}

interface OsrmTableResponse {
  code?: unknown;
  durations?: unknown;
  distances?: unknown;
}

interface OsrmRouteEntry {
  duration?: unknown;
  distance?: unknown;
  legs?: unknown;
  geometry?: { coordinates?: unknown };
}

// ---------------------------------------------------------------------------
// Ошибки
// ---------------------------------------------------------------------------

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * OSRM при HTTP 200 сигнализирует отказ полем code ('NoRoute', 'NoSegment',
 * 'TooBig', …). NoRoute/NoSegment — «между точками не построилось» → NO_ROUTE;
 * прочие коды и отсутствие code — сломанный запрос/инстанс → UPSTREAM_INVALID.
 * HTTP-статусы (4xx/5xx) до сюда не доносят смысл — их уже смаппил fetchJson.
 */
function assertOk(code: unknown, action: string): void {
  if (code === 'Ok') return;
  if (code === 'NoRoute' || code === 'NoSegment') {
    throw new GeoError('NO_ROUTE', `OSRM не построил ${action}: ${code}`);
  }
  const shown = typeof code === 'string' ? code : '(нет code в ответе)';
  throw new GeoError('UPSTREAM_INVALID', `OSRM: ${action} ответил кодом ${shown}`);
}

// ---------------------------------------------------------------------------
// Парсинг
// ---------------------------------------------------------------------------

/** OSRM принимает [lng, lat] — координата для пути URL, 5 знаков (ключи кэша). */
function coordParam(point: LatLng): string {
  const [lng, lat] = toLngLat(point);
  return `${lng.toFixed(5)},${lat.toFixed(5)}`;
}

/**
 * Метрика маршрута: верхнеуровневые duration/distance OSRM отдаёт всегда, но
 * контракт доверяем как сумме ног — если верхний уровень не число, суммируем
 * legs; ни того, ни другого нет → null (мусорный ответ).
 */
function routeMetric(total: unknown, legs: unknown, name: 'duration' | 'distance'): number | null {
  if (isFiniteNumber(total) && total >= 0) return total;
  if (!Array.isArray(legs) || legs.length === 0) return null;
  let sum = 0;
  for (const leg of legs) {
    const value = (leg as { [key: string]: unknown })[name];
    if (!isFiniteNumber(value) || value < 0) return null;
    sum += value;
  }
  return sum;
}

function parseRoute(route: unknown): RouteSegment {
  const entry = route as OsrmRouteEntry;
  const duration = routeMetric(entry.duration, entry.legs, 'duration');
  const distance = routeMetric(entry.distance, entry.legs, 'distance');
  if (duration === null || distance === null) {
    throw new GeoError('UPSTREAM_INVALID', 'OSRM: в маршруте нет duration/distance');
  }

  let geometry: LatLng[] = [];
  const coordinates = entry.geometry?.coordinates;
  if (coordinates !== undefined) {
    if (!Array.isArray(coordinates)) {
      throw new GeoError('UPSTREAM_INVALID', 'OSRM: geometry.coordinates не массив');
    }
    geometry = coordinates.map((pair): LatLng => {
      if (!Array.isArray(pair) || !isFiniteNumber(pair[0]) || !isFiniteNumber(pair[1])) {
        throw new GeoError('UPSTREAM_INVALID', 'OSRM: битая точка в geometry.coordinates');
      }
      // OSRM отдаёт [lng, lat] — возвращаем к порядку приложения.
      return [pair[1], pair[0]];
    });
  }

  return {
    distanceMeters: distance,
    durationSeconds: duration,
    geometry,
    source: 'osrm',
  };
}

/** OSRM кладёт null в ячейки матрицы для недостижимых пар; мусор трактуем так же. */
function cellValue(value: unknown): number | null {
  return isFiniteNumber(value) && value >= 0 ? value : null;
}

function parseMatrixRows(
  data: OsrmTableResponse,
  sourceCount: number,
  targetCount: number,
): { durations: (number | null)[][]; distances: (number | null)[][] } {
  const parse = (raw: unknown, name: string): (number | null)[][] => {
    if (!Array.isArray(raw) || raw.length !== sourceCount) {
      throw new GeoError('UPSTREAM_INVALID', `OSRM matrix: поле ${name} не матрица ${sourceCount}×${targetCount}`);
    }
    return raw.map((row, rowIndex) => {
      if (!Array.isArray(row) || row.length !== targetCount) {
        throw new GeoError('UPSTREAM_INVALID', `OSRM matrix: строка ${rowIndex} ${name} не длины ${targetCount}`);
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
// Чанкинг матрицы по URL-бюджету
// ---------------------------------------------------------------------------

/** Worst-case строка координаты: планирование чанка не зависит от реальных точек. */
const WORST_COORD_LENGTH = '179.99999,89.99999'.length; // 18

/** Длина списка индексов «a;a+1;…» — суммарное число цифр + разделители. */
function indexListLength(from: number, count: number): number {
  let length = 0;
  for (let i = 0; i < count; i++) length += String(from + i).length;
  return length + Math.max(0, count - 1); // ';'
}

/** Список индексов «0;1;2» — OSRM ждёт разделитель ';', НЕ URLSearchParams
 *  (тот закодировал бы ';' в %3B; живой запрос проверен с сырым ';'). */
function indexList(from: number, count: number): string {
  const parts: string[] = [];
  for (let i = 0; i < count; i++) parts.push(String(from + i));
  return parts.join(';');
}

// ---------------------------------------------------------------------------
// Адаптер
// ---------------------------------------------------------------------------

export class OsrmRoutingAdapter {
  /** Кэш ответов матрицы — ключ по округлённым точкам обоих чанков (ADR-001, правило 3). */
  private readonly matrixCache = new TtlLruCache<{
    durations: (number | null)[][];
    distances: (number | null)[][];
  }>({ maxEntries: 200, defaultTtlMs: 10 * 60_000 });

  /** Fair use FOSSGIS: максимум один запрос в полёте на примитив (ADR-004). */
  private readonly routeQueue = new SerialQueue();
  private readonly matrixQueue = new SerialQueue();

  constructor(private readonly options: OsrmAdapterOptions) {}

  async route(waypoints: LatLng[]): Promise<RouteSegment> {
    return this.routeQueue.run(() => this.requestRoute(waypoints));
  }

  /**
   * Матрица источник×цель. OSRM table — GET, лимит — длина URL (см.
   * OSRM_MAX_URL_LENGTH), поэтому чанки режутся по бюджету: сначала цели
   * (блок целей обязан влезать в запрос хотя бы с 1 источником), затем под
   * каждый блок целей — источники. Склейка как в ORS: локации запроса =
   * [чанк источников, …, блок целей], sources/destinations — относительные
   * индексы, глобальный sourceIndex = chunkStart + локальная строка.
   */
  async matrix(sources: LatLng[], targets: LatLng[]): Promise<MatrixCell[]> {
    if (sources.length === 0 || targets.length === 0) return [];

    const roundedSources = sources.map(roundPoint);
    const roundedTargets = targets.map(roundPoint);
    const cells: MatrixCell[] = [];

    const targetChunkSize = this.maxFitCount(
      (count) => this.plannedUrlLength(1, count),
      roundedTargets.length,
    );
    for (let tStart = 0; tStart < roundedTargets.length; tStart += targetChunkSize) {
      const tChunk = roundedTargets.slice(tStart, tStart + targetChunkSize);
      const tCount = tChunk.length;
      const sourceChunkSize = this.maxFitCount(
        (count) => this.plannedUrlLength(count, tCount),
        roundedSources.length,
      );
      for (let sStart = 0; sStart < roundedSources.length; sStart += sourceChunkSize) {
        const sChunk = roundedSources.slice(sStart, sStart + sourceChunkSize);
        const cacheKey = `matrix:${sChunk.map(pointKey).join('|')}#${tChunk.map(pointKey).join('|')}`;
        const cached = this.matrixCache.get(cacheKey);
        const rows = cached ?? (await this.matrixQueue.run(() => this.requestTable(sChunk, tChunk)));
        if (!cached) this.matrixCache.set(cacheKey, rows);

        for (let localRow = 0; localRow < sChunk.length; localRow++) {
          for (let col = 0; col < tCount; col++) {
            cells.push({
              sourceIndex: sStart + localRow,
              targetIndex: tStart + col,
              distanceMeters: rows.distances[localRow][col],
              durationSeconds: rows.durations[localRow][col],
            });
          }
        }
      }
    }

    return cells;
  }

  /**
   * Максимум точек, чей запрос влезает в URL-бюджет (монотонно по count —
   * бинарный поиск корректен). Ноль — даже одна точка не влезает: конфиг
   * baseUrl/бюджета сломан, честный INVALID_INPUT вместо сетевого мусора.
   */
  private maxFitCount(planned: (count: number) => number, total: number): number {
    const budget = this.options.maxUrlLength ?? OSRM_MAX_URL_LENGTH;
    let lo = 1;
    let hi = total;
    let best = 0;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (planned(mid) <= budget) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (best === 0) {
      throw new GeoError(
        'INVALID_INPUT',
        `OSRM matrix: запрос даже из одной точки не влезает в бюджет URL ${budget}`,
      );
    }
    return best;
  }

  /**
   * Плановая длина URL table-запроса: координаты считаем worst-case строкой
   * (18 символов), индексы — точными. Любой реальный чанк с теми же count
   * даёт URL не длиннее запланированного.
   */
  private plannedUrlLength(sourceCount: number, targetCount: number): number {
    const coordCount = sourceCount + targetCount;
    const coordsLength = coordCount * WORST_COORD_LENGTH + Math.max(0, coordCount - 1);
    const prefix = `${this.options.baseUrl}/table/v1/foot/`.length;
    const queryLength =
      '?sources='.length +
      indexListLength(0, sourceCount) +
      '&destinations='.length +
      indexListLength(sourceCount, targetCount) +
      '&annotations=duration,distance'.length;
    return prefix + coordsLength + queryLength;
  }

  private async requestRoute(waypoints: LatLng[]): Promise<RouteSegment> {
    const coords = waypoints.map(roundPoint).map(coordParam).join(';');
    const url =
      `${this.options.baseUrl}/route/v1/foot/${coords}?overview=full&geometries=geojson`;
    const data = await fetchJson<OsrmRouteResponse>({
      url,
      timeoutMs: this.options.routeTimeoutMs,
      fetchImpl: this.options.fetchImpl,
    });
    assertOk(data.code, 'роутинг');

    if (!Array.isArray(data.routes) || data.routes.length === 0) {
      throw new GeoError('NO_ROUTE', 'OSRM вернул пустой список маршрутов');
    }
    return parseRoute(data.routes[0]);
  }

  private async requestTable(
    sChunk: LatLng[],
    tChunk: LatLng[],
  ): Promise<{ durations: (number | null)[][]; distances: (number | null)[][] }> {
    // Локации запроса = [чанк источников, …, блок целей]; индексы относительные
    // (sources 0..k-1, destinations k..k+T-1) — склейка с глобальными индексами
    // в matrix(). Параметр destinations, не targets: FOSSGIS-инстанс отвечает
    // 400 InvalidQuery на 'targets' (проверено живым запросом 2026-11-17).
    const coords = [...sChunk, ...tChunk].map(coordParam).join(';');
    const query =
      `?sources=${indexList(0, sChunk.length)}` +
      `&destinations=${indexList(sChunk.length, tChunk.length)}` +
      '&annotations=duration,distance';
    const url = `${this.options.baseUrl}/table/v1/foot/${coords}${query}`;

    const data = await fetchJson<OsrmTableResponse>({
      url,
      timeoutMs: this.options.matrixTimeoutMs,
      fetchImpl: this.options.fetchImpl,
    });
    assertOk(data.code, 'матрица расстояний');
    return parseMatrixRows(data, sChunk.length, tChunk.length);
  }
}
