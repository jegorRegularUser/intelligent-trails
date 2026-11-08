"use server";

// «Оптимизировать порядок» для эксперт-режима: матрица пешеходных времён
// через CloudProvider + NN/2-opt из движка прогулок. Старт фиксирован, опциональный
// финиш фиксирован, промежуточные точки переупорядочиваются.
import { CloudProvider } from '@/lib/geo';
import { solveWalkOrder, type TimeMatrix } from '@/lib/walk/ordering';

export interface OptimizeOrderInput {
  start: [number, number];
  /** Промежуточные точки в текущем порядке. */
  points: { id: string; coords: [number, number] }[];
  /** Финиш (А→Б); null/undefined — петля. */
  end?: [number, number] | null;
}

export type OptimizeOrderResult =
  | { ok: true; orderedIds: string[]; totalMinutes: number }
  | { ok: false; error: string };

const INF = Number.POSITIVE_INFINITY;

export async function optimizeRouteOrderAction(input: OptimizeOrderInput): Promise<OptimizeOrderResult> {
  if (input.points.length < 2) {
    return { ok: false, error: 'Нужно минимум две промежуточные точки' };
  }
  const all = [input.start, ...input.points.map((p) => p.coords), ...(input.end ? [input.end] : [])];
  const n = all.length;
  const endIndex = input.end ? n - 1 : 0;
  if (!input.end && endIndex !== 0) return { ok: false, error: 'Некорректные параметры' };

  try {
    const provider = new CloudProvider({ orsApiKey: process.env.OPENROUTESERVICE_API_KEY ?? '' });
    const cells = await provider.matrix(all, all);

    const times: TimeMatrix = Array.from({ length: n }, () => Array(n).fill(INF));
    for (const cell of cells) {
      if (cell.durationSeconds != null) {
        times[cell.sourceIndex][cell.targetIndex] = cell.durationSeconds / 60;
      }
    }
    // Диагональ и петля-старт — нулевые стоимости (нет переезда)
    for (let i = 0; i < n; i++) times[i][i] = 0;

    const stops = input.points.map((_, i) => i + 1);
    const result = solveWalkOrder(
      times,
      stops,
      input.end ? { isLoop: false, endIndex } : { isLoop: true, endIndex: 0 },
    );

    // Недостижимые связности: INF в стоимости — честный отказ
    if (!Number.isFinite(result.walkMinutes)) {
      return { ok: false, error: 'Некоторые точки недостижимы пешком — проверьте маршрут' };
    }

    return {
      ok: true,
      orderedIds: result.sequence.map((idx) => input.points[idx - 1].id),
      totalMinutes: Math.round(result.walkMinutes),
    };
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'GeoError' && error.message.includes('NO_ROUTE')
        ? 'Роутинг недоступен — нужен OPENROUTESERVICE_API_KEY'
        : 'Не удалось построить матрицу расстояний — попробуйте позже';
    return { ok: false, error: message };
  }
}
