// src/lib/walk/memoPort.ts
// Мемоизирующая обёртка над WalkRoutingPort. Движок строит до 3 вариантов
// плана с перекрывающимися зонами отбора и повторяет обход кольца зеркалом
// при провале гейта улиц — пары точек между попытками совпадают, а каждый
// ports.route() это отдельный HTTP-запрос к роутеру. Ключи направленные
// (A→B ≠ B→A): пешая сеть почти симметрична, но гарантий нет — лучше
// пересчитать, чем показать чужую геометрию. Кэш живёт в пределах одного
// вызова движка; сквозной кэш между вызовами даёт синглтон-провайдер,
// а переживает перезапуск — дисковый слой (portDiskCache): вчерашние
// прогулки по тому же району не жгут суточную квоту ORS заново.
import type { WalkMatrixCell, WalkRouteSegment, WalkRoutingPort } from './ports';
import type { WalkLatLng } from './types';
import {
  readMatrixCache,
  readRouteCache,
  writeMatrixCache,
  writeRouteCache,
} from './portDiskCache';

/** Ёмкости кэшей: один план — это ≤3 матрицы и ≤42 ног, с запасом. */
const ROUTE_CACHE_MAX = 128;
const MATRIX_CACHE_MAX = 8;

function pointKey(p: WalkLatLng): string {
  return `${p[0].toFixed(5)},${p[1].toFixed(5)}`;
}

/** FIFO-вытеснение: переполнился — забываем самую старую запись. */
function putFifo<T>(cache: Map<string, T>, max: number, key: string, value: T): void {
  if (cache.size >= max) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

export function memoizeRoutingPort(port: WalkRoutingPort): WalkRoutingPort {
  const routes = new Map<string, Promise<WalkRouteSegment>>();
  const matrices = new Map<string, Promise<WalkMatrixCell[]>>();

  return {
    route(req) {
      const key = req.waypoints.map(pointKey).join('->');
      const hit = routes.get(key);
      if (hit) return hit;
      // Дисковый слой до сети: вчерашние зоны города не жгут квоту ORS.
      const pending = readRouteCache(req.waypoints)
        .then((disk) => {
          if (disk) return disk;
          return port.route(req).then((segment) => {
            writeRouteCache(req.waypoints, segment);
            return segment;
          });
        })
        .catch((e) => {
          routes.delete(key);
          throw e;
        });
      putFifo(routes, ROUTE_CACHE_MAX, key, pending);
      return pending;
    },
    matrix(sources, targets) {
      const key = `${sources.map(pointKey).join(';')}#${targets.map(pointKey).join(';')}`;
      const hit = matrices.get(key);
      if (hit) return hit;
      const pending = readMatrixCache(sources, targets)
        .then((disk) => {
          if (disk) return disk;
          return port
            .matrix(sources, targets)
            .then((cells) => {
              writeMatrixCache(sources, targets, cells);
              return cells;
            });
        })
        .catch((e) => {
          matrices.delete(key);
          throw e;
        });
      putFifo(matrices, MATRIX_CACHE_MAX, key, pending);
      return pending;
    },
  };
}
