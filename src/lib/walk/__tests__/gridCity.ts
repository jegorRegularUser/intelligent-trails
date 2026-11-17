// src/lib/walk/__tests__/gridCity.ts
// СИНТЕТИЧЕСКИЙ ГОРОД для оффлайн-тестов движка (docs/walk-engine.md §14).
//
// Топология: манхэттенская сетка улиц с шагом 500 м, центр — BASE.
// Тесты ставят точки только в узлы сетки (makeNode), поэтому:
//  - время ноги = манхэттенское расстояние / 75 м в минуту (4.5 км/ч);
//  - полилиния ноги — Г-образный путь: сначала по долготе, затем по широте.
// Реальный город отличается от сетки длиной, кривизной и асимметрией ног,
// но не топологией задачи: отбор зоны, NN/2-opt, бюджетные гейты и деградация
// по null-ячейкам ведут себя одинаково.
//
// «Острова» (island: true) не связаны с сетью: все их ячейки матрицы — null,
// route() бросает. Так проверяется честная деградация движка.

import type { WalkLatLng, WalkPlace } from '@/lib/walk/types';
import type { WalkMatrixCell, WalkRouteSegment, WalkRoutingPort } from '@/lib/walk/ports';

const EARTH_M_PER_DEG = 6371008.8 * (Math.PI / 180); // ≈ 111 194.9 м на градус широты
const BASE: WalkLatLng = [55.75, 37.62];

/** Скорость по умолчанию движка: 4.5 км/ч = 75 м/мин. */
export const SPEED_M_PER_MIN = 75;

/** Узел сетки: east/north в метрах на восток/север от BASE (кратно 500). */
export function makeNode(eastM: number, northM: number): WalkLatLng {
  const lngPerMeter = 1 / (EARTH_M_PER_DEG * Math.cos(BASE[0] * (Math.PI / 180)));
  return [BASE[0] + northM / EARTH_M_PER_DEG, BASE[1] + eastM * lngPerMeter];
}

function meterDeltas(a: WalkLatLng, b: WalkLatLng): { east: number; north: number } {
  const lngPerMeter = 1 / (EARTH_M_PER_DEG * Math.cos(BASE[0] * (Math.PI / 180)));
  return {
    east: (b[1] - a[1]) / lngPerMeter,
    north: (b[0] - a[0]) * EARTH_M_PER_DEG,
  };
}

function manhattanMeters(a: WalkLatLng, b: WalkLatLng): number {
  const d = meterDeltas(a, b);
  return Math.abs(d.east) + Math.abs(d.north);
}

function samePoint(a: WalkLatLng, b: WalkLatLng): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

/** Г-образная полилиния: сначала по долготе, затем по широте. */
function lPath(a: WalkLatLng, b: WalkLatLng): WalkLatLng[] {
  return [a, [a[0], b[1]], b];
}

function concatPaths(paths: WalkLatLng[][]): WalkLatLng[] {
  const out: WalkLatLng[] = [];
  for (const path of paths) {
    for (const p of path) {
      const last = out[out.length - 1];
      if (!last || !samePoint(last, p)) out.push(p);
    }
  }
  return out;
}

function keyOf(p: WalkLatLng): string {
  return `${p[0]}|${p[1]}`;
}

export interface CityPlaceDef {
  id: string;
  name: string;
  category: string;
  east: number;
  north: number;
  rating?: number;
  /** Остров: не связан с сетью, все ячейки матрицы null. */
  island?: boolean;
}

export interface FakeCityOptions {
  /**
   * Порт умеет routeAlternatives (R3): основной Г-путь «сначала долгота»
   * (как в route) и зеркало «сначала широта» через (b.lat, a.lng). Оба идут
   * по сетке, метрики совпадают, перекрытие — только стыки в точках a/b.
   * Опция выключена по умолчанию: существующие сценарии проверяют движение
   * на одиночных ногах, альтернативный выбор — отдельные тесты.
   */
  alternatives?: boolean;
}

export interface FakeCity {
  port: WalkRoutingPort;
  places: WalkPlace[];
}

/** Детерминированный фейковый порт маршрутизации по сетке-городу. */
export function makeCity(defs: CityPlaceDef[], options: FakeCityOptions = {}): FakeCity {
  const places: WalkPlace[] = defs.map((def) => ({
    id: def.id,
    name: def.name,
    category: def.category,
    coordinates: makeNode(def.east, def.north),
    ...(def.rating !== undefined ? { rating: def.rating } : {}),
  }));
  const islandKeys = new Set(
    defs.filter((d) => d.island).map((d) => keyOf(makeNode(d.east, d.north))),
  );
  const isIsland = (p: WalkLatLng): boolean => islandKeys.has(keyOf(p));

  const buildSegment = (paths: WalkLatLng[][]): WalkRouteSegment => {
    // Метрики по манхэттенской длине плеч — так честно и для одиночного
    // Г-путя, и для цепочки (петли L2/via режут её же по вейпоинтам).
    const geometry = concatPaths(paths);
    let totalMeters = 0;
    for (let i = 1; i < geometry.length; i++) {
      totalMeters += manhattanMeters(geometry[i - 1], geometry[i]);
    }
    return {
      distanceMeters: totalMeters,
      durationSeconds: (totalMeters / SPEED_M_PER_MIN) * 60,
      geometry,
      source: 'pack',
    };
  };

  const routeSegmentFor = (waypoints: WalkLatLng[]): WalkRouteSegment => {
    const paths: WalkLatLng[][] = [];
    for (let i = 0; i < waypoints.length - 1; i++) {
      const a = waypoints[i];
      const b = waypoints[i + 1];
      if (samePoint(a, b)) continue;
      if (isIsland(a) || isIsland(b)) {
        throw new Error(`NO_ROUTE: нога ${i + 1} проходит через остров`);
      }
      paths.push(lPath(a, b));
    }
    return buildSegment(paths);
  };

  const port: WalkRoutingPort = {
    async route(req) {
      return routeSegmentFor(req.waypoints);
    },

    ...(options.alternatives
      ? {
          async routeAlternatives(req: { waypoints: WalkLatLng[] }) {
            const [a, b] = req.waypoints;
            if (!a || !b || req.waypoints.length !== 2) {
              return [routeSegmentFor(req.waypoints)];
            }
            // Островность проверяется тем же route: упал — альтернатив нет,
            // деградация честная (наверх бросает — движок откатится на route,
            // который бросит тот же NO_ROUTE).
            const primary = routeSegmentFor([a, b]);
            const mirror = routeSegmentFor([a, [b[0], a[1]], b]);
            return [primary, mirror];
          },
        }
      : {}),

    async matrix(sources, targets) {
      const cells: WalkMatrixCell[] = [];
      for (let si = 0; si < sources.length; si++) {
        for (let ti = 0; ti < targets.length; ti++) {
          const s = sources[si];
          const t = targets[ti];
          if (samePoint(s, t)) {
            cells.push({ sourceIndex: si, targetIndex: ti, distanceMeters: 0, durationSeconds: 0 });
          } else if (isIsland(s) || isIsland(t)) {
            cells.push({ sourceIndex: si, targetIndex: ti, distanceMeters: null, durationSeconds: null });
          } else {
            const meters = manhattanMeters(s, t);
            cells.push({
              sourceIndex: si,
              targetIndex: ti,
              distanceMeters: meters,
              durationSeconds: (meters / SPEED_M_PER_MIN) * 60,
            });
          }
        }
      }
      return cells;
    },
  };

  return { port, places };
}
