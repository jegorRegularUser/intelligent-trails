// src/lib/walk/portDiskCache.ts
// Дисковый слой кэша роутинга: маршрут между двумя точками не меняется
// неделями (пешая сеть стабильна), метрики матрицы — днями. Суточная квота
// ORS — главный ресурс процесса: переживая перезапуск, кэш делает повторные
// прогулки по уже изведанным районам бесплатными. Отказы диска глотаются
// молча: кэш опционален, без него всё работает как раньше (только медленнее
// и дороже по квоте). Формат записи: JSON {v, at, payload}, имя — sha1 ключа.

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { WalkMatrixCell, WalkRouteSegment } from './ports';
import type { WalkLatLng } from './types';

/** Дни жизни записи: ноги — сеть улиц почти не меняется, матрица — короче. */
const ROUTE_TTL_DAYS = 30;
const MATRIX_TTL_DAYS = 3;

function cacheDir(): string {
  return process.env.IT_GEO_CACHE_DIR || join(homedir(), '.intelligent-trails', 'geo-cache');
}

function hashKey(kind: 'route' | 'matrix', key: string): string {
  return `${kind}_${createHash('sha1').update(key).digest('hex').slice(0, 24)}`;
}

interface DiskEntry<T> {
  v: 1;
  at: number;
  payload: T;
}

let dirReady = false;

async function ensureDir(): Promise<void> {
  if (dirReady) return;
  await mkdir(cacheDir(), { recursive: true });
  dirReady = true;
}

async function readEntry<T>(file: string, ttlDays: number): Promise<T | null> {
  try {
    await ensureDir();
    const raw = await readFile(join(cacheDir(), file), 'utf-8');
    const entry = JSON.parse(raw) as DiskEntry<T>;
    if (entry.v !== 1) return null;
    if (Date.now() - entry.at > ttlDays * 24 * 3600_000) return null;
    return entry.payload;
  } catch {
    return null; // нет файла / битый JSON / нет прав — просто промах
  }
}

async function writeEntry<T>(file: string, payload: T): Promise<void> {
  try {
    await ensureDir();
    const entry: DiskEntry<T> = { v: 1, at: Date.now(), payload };
    await writeFile(join(cacheDir(), file), JSON.stringify(entry), 'utf-8');
  } catch {
    // запись не удалась — кэш деградирует в in-memory, не падаем
  }
}

function routeKey(waypoints: WalkLatLng[]): string {
  return waypoints.map((p) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`).join('->');
}

function matrixKey(sources: WalkLatLng[], targets: WalkLatLng[]): string {
  return `${sources.map((p) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`).join(';')}#${targets
    .map((p) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`)
    .join(';')}`;
}

export async function readRouteCache(waypoints: WalkLatLng[]): Promise<WalkRouteSegment | null> {
  return readEntry<WalkRouteSegment>(hashKey('route', routeKey(waypoints)), ROUTE_TTL_DAYS);
}

export function writeRouteCache(waypoints: WalkLatLng[], segment: WalkRouteSegment): void {
  void writeEntry(hashKey('route', routeKey(waypoints)), segment);
}

export async function readMatrixCache(
  sources: WalkLatLng[],
  targets: WalkLatLng[],
): Promise<WalkMatrixCell[] | null> {
  return readEntry<WalkMatrixCell[]>(hashKey('matrix', matrixKey(sources, targets)), MATRIX_TTL_DAYS);
}

export function writeMatrixCache(
  sources: WalkLatLng[],
  targets: WalkLatLng[],
  cells: WalkMatrixCell[],
): void {
  void writeEntry(hashKey('matrix', matrixKey(sources, targets)), cells);
}
