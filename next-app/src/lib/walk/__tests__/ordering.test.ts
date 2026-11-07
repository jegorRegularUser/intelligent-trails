// src/lib/walk/__tests__/ordering.test.ts
// Свойства порядка обхода: 2-opt не хуже NN; обход null-рёбер.

import { describe, it, expect } from 'vitest';
import { nearestNeighborOrder, solveWalkOrder } from '@/lib/walk/ordering';
import { mulberry32 } from '@/lib/walk/internal/rng';

describe('ordering: NN + 2-opt', () => {
  it('2-opt не хуже NN на случайных матрицах (петля и А→Б, асимметрия и Inf)', () => {
    for (let seed = 0; seed < 30; seed++) {
      const rng = mulberry32(seed * 104729 + 17);
      const stopsCount = 1 + Math.floor(rng() * 6); // 1..6 остановок
      const size = stopsCount + 2; // 0 — старт, size-1 — финиш
      const times: number[][] = [];
      for (let i = 0; i < size; i++) {
        times.push(Array.from({ length: size }, (_, j) => (i === j ? 0 : 1 + rng() * 59)));
      }
      // 10% недостижимых рёбер: NN может завести в тупик, 2-opt обязан не ухудшать.
      for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
          if (i !== j && rng() < 0.1) times[i][j] = Infinity;
        }
      }
      const stops = Array.from({ length: stopsCount }, (_, i) => i + 1);
      for (const isLoop of [true, false]) {
        const opts = { isLoop, endIndex: size - 1 };
        const nn = nearestNeighborOrder(times, stops, opts);
        const solved = solveWalkOrder(times, stops, opts);
        expect(solved.walkMinutes).toBeLessThanOrEqual(nn.walkMinutes + 1e-9);
      }
    }
  });

  it('обходит null-ребро, если существует конечный обход', () => {
    // Кольцо 0→1→2→0: ребро 1→2 недостижимо; обратный порядок конечен.
    const times = [
      [0, 4, 5],
      [5, 0, Infinity],
      [5, 6, 0],
    ];
    const opts = { isLoop: true, endIndex: 2 };
    const nn = nearestNeighborOrder(times, [1, 2], opts);
    expect(nn.walkMinutes).toBe(Infinity); // NN пошёл в дешёвый тупик

    const solved = solveWalkOrder(times, [1, 2], opts);
    expect(solved.sequence).toEqual([2, 1]); // 0→2→1→0 = 5+6+5
    expect(solved.walkMinutes).toBe(16);
  });

  it('петля и А→Б уважают фиксированные концы', () => {
    // Квадрат: старт(0), точки 1..3, финиш(4). А→Б: последовательность не
    // содержит ни 0, ни 4, а стоимость считается 0→…→4.
    const times = [
      [0, 5, 9, 9, 20],
      [5, 0, 5, 9, 9],
      [9, 5, 0, 5, 9],
      [9, 9, 5, 0, 5],
      [20, 9, 9, 5, 0],
    ];
    const stops = [1, 2, 3];
    const ab = solveWalkOrder(times, stops, { isLoop: false, endIndex: 4 });
    expect(ab.sequence).toHaveLength(3);
    expect(ab.sequence).not.toContain(0);
    expect(ab.sequence).not.toContain(4);
    // Монотонный путь 0→1→2→3→4 = 5+5+5+5 = 20 оптимален на этой сетке.
    expect(ab.walkMinutes).toBe(20);

    const loop = solveWalkOrder(times, stops, { isLoop: true, endIndex: 4 });
    expect(loop.sequence).toHaveLength(3);
    // Лучшее кольцо 0→1→2→3→0 = 5+5+5+9 = 24 (или обратное, столько же).
    expect(loop.walkMinutes).toBe(24);
  });
});
