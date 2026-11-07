// src/lib/walk/ordering.ts
// Порядок обхода остановок: NN + 2-opt по матрице ВРЕМЁН ходьбы
// (docs/walk-engine.md §7).
//
// Вершины матрицы: 0 — старт, далее индексы остановок, для А→Б последняя —
// финиш (фиксирован). Infinity = недостижимый переход (null-ячейка порта).
//
// 2-opt оценивает разворот сегмента полным пересчётом стоимости: матрицы
// пеших времени асимметричны (светофоры, переходы), дельта-формула классического
// 2-opt верна только для симметричных. k ≤ 6 делает пересчёт дешевле анализа.

export type TimeMatrix = number[][];

export interface OrderResult {
  /** Порядок обхода остановок — индексы точек (старт не включён). */
  sequence: number[];
  /** Σ времени ног, минуты; Infinity, если обойти не удалось. */
  walkMinutes: number;
}

export interface OrderOptions {
  isLoop: boolean;
  /** Индекс финиша в матрице (А→Б). В петле замыкание — в старт (0). */
  endIndex: number;
}

const EPS = 1e-9;

export function nearestNeighborOrder(
  times: TimeMatrix,
  stops: number[],
  opts: OrderOptions,
): OrderResult {
  const remaining = stops.slice();
  const sequence: number[] = [];
  let current = 0;
  let total = 0;
  while (remaining.length > 0) {
    let best = 0;
    for (let i = 1; i < remaining.length; i++) {
      if (times[current][remaining[i]] < times[current][remaining[best]]) best = i;
    }
    const next = remaining.splice(best, 1)[0];
    sequence.push(next);
    total += times[current][next];
    current = next;
  }
  total += times[current][opts.isLoop ? 0 : opts.endIndex];
  return { sequence, walkMinutes: total };
}

/** NN + 2-opt; принимает только строгое улучшение ⇒ результат не хуже NN. */
export function solveWalkOrder(
  times: TimeMatrix,
  stops: number[],
  opts: OrderOptions,
): OrderResult {
  const nn = nearestNeighborOrder(times, stops, opts);
  const sequence = nn.sequence;
  twoOptImprove(times, sequence, opts);
  return { sequence, walkMinutes: ringCost(times, sequence, opts) };
}

/** Σ времени ног кольца/пути, минуты. Экспортирован для зеркальной пробы (§7). */
export function ringCost(times: TimeMatrix, sequence: number[], opts: OrderOptions): number {
  let total = 0;
  let current = 0;
  for (const stop of sequence) {
    total += times[current][stop];
    current = stop;
  }
  total += times[current][opts.isLoop ? 0 : opts.endIndex];
  return total;
}

function twoOptImprove(times: TimeMatrix, sequence: number[], opts: OrderOptions): void {
  let best = ringCost(times, sequence, opts);
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < sequence.length - 1 && !improved; i++) {
      for (let j = i + 1; j < sequence.length && !improved; j++) {
        const trial = [
          ...sequence.slice(0, i),
          ...sequence.slice(i, j + 1).reverse(),
          ...sequence.slice(j + 1),
        ];
        const cost = ringCost(times, trial, opts);
        if (cost < best - EPS) {
          sequence.splice(0, sequence.length, ...trial);
          best = cost;
          improved = true;
        }
      }
    }
  }
}
