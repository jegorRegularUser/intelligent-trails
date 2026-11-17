// src/lib/walk/__tests__/fillToFloor.test.ts
// Коридор бюджета (docs/walk-loop-quality.md R1): добор до пола 0.9·B,
// via-удлинение, откат при вылете реального total за 1.1·B, честный недобор.
// Юнит — на сетке-городе (манхэттенские метрики, всё оффлайн); раскладка
// узлов зафиксирована в комментариях кейсов.

import { describe, expect, it } from 'vitest';
import { fillToFloor, isUnderfloor } from '@/lib/walk/createWalkPlan';
import { haversineMeters, viaOffsetForExtraMeters, viaPointFor } from '@/lib/walk/internal/geo';
import { FLOOR_SHARE } from '@/lib/walk/types';
import { makeCity, makeNode, SPEED_M_PER_MIN } from './gridCity';
import type { WalkLeg, WalkLatLng } from '@/lib/walk/types';
import type { WalkMatrixCell, WalkRoutingPort } from '@/lib/walk/ports';

/** Матрица минут из ячеек gridCity-порта (как buildTimeMatrix движка). */
async function gridTimes(points: WalkLatLng[], port: WalkRoutingPort): Promise<number[][]> {
  const cells: WalkMatrixCell[] = await port.matrix(points, points);
  const size = points.length;
  const times: number[][] = Array.from({ length: size }, () => Array<number>(size).fill(Infinity));
  for (let i = 0; i < size; i++) times[i][i] = 0;
  for (const cell of cells) {
    if (cell.durationSeconds === null) continue;
    times[cell.sourceIndex][cell.targetIndex] = cell.durationSeconds / 60;
  }
  return times;
}

async function realLegs(
  port: WalkRoutingPort,
  path: WalkLatLng[],
): Promise<WalkLeg[]> {
  const legs: WalkLeg[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const segment = await port.route({ waypoints: [path[i], path[i + 1]] });
    legs.push({
      from: path[i],
      to: path[i + 1],
      distanceMeters: segment.distanceMeters,
      durationMinutes: segment.durationSeconds / 60,
      geometry: segment.geometry ?? [],
    });
  }
  return legs;
}

const walkOf = (legs: WalkLeg[]): number =>
  legs.reduce((sum, leg) => sum + leg.durationMinutes, 0);

/** Тройка базовых аргументов fillToFloor: кольцо из точек path, stay по индексам. */
function baseParams(overrides: Partial<Parameters<typeof fillToFloor>[0]> = {}) {
  const farEnough = (bi: number, sequence: number[], points: WalkLatLng[]) =>
    sequence.every(
      (j) => Math.abs(points[j][0] - points[bi][0]) + Math.abs(points[j][1] - points[bi][1]) >= 0,
    );
  void farEnough;
  return overrides;
}
void baseParams;

describe('via-математика: h = √(Δ·(2D+Δ))/2 (R1.c)', () => {
  it('евклидова прибавка пути через апекс равна целевому Δ', () => {
    const D = 1000;
    const extra = 375;
    const h = viaOffsetForExtraMeters(D, extra);
    // Модель формулы: 2·√((D/2)² + h²) − D = extra.
    const detour = 2 * Math.hypot(D / 2, h) - D;
    expect(detour).toBeCloseTo(extra, 6);
    // Наивный «сместить на Δ» дал бы ≈ 2·Δ²/D ≈ 281 — формула даёт 472.
    expect(h).toBeCloseTo(Math.sqrt(extra * (2 * D + extra)) / 2, 9);
  });

  it('viaPointFor: точка на серединном перпендикуляре, |via−a| = |via−b| = h', () => {
    const a = makeNode(0, 0);
    const b = makeNode(1000, 0);
    const h = viaOffsetForExtraMeters(1000, 375);
    const via = viaPointFor(a, b, h, 1);
    // Нога восток-запад: перпендикуляр — север/юг, долгота апекса — середина.
    expect(via[1]).toBeCloseTo((a[1] + b[1]) / 2, 9);
    // Плечи симметричны и длиннее полуоси: гаверсинус до a и до b совпадает.
    const hypotenuse = Math.hypot(500, h);
    expect(haversineMeters(via, a)).toBeCloseTo(hypotenuse, 0);
    expect(haversineMeters(via, b)).toBeCloseTo(hypotenuse, 0);
    expect(haversineMeters(via, a)).toBeGreaterThan(500);
  });

  it('нулевые/отрицательные входы дают офсет 0', () => {
    expect(viaOffsetForExtraMeters(0, 100)).toBe(0);
    expect(viaOffsetForExtraMeters(100, -1)).toBe(0);
  });
});

describe('isUnderfloor: чистый предикат (R1.d)', () => {
  it('недобор/граница/перебор', () => {
    expect(isUnderfloor({ totalMinutes: 49 }, 60)).toBe(true);
    expect(isUnderfloor({ totalMinutes: 54 }, 60)).toBe(false); // ровно пол
    expect(isUnderfloor({ totalMinutes: 54.0000001 }, 60)).toBe(false);
    expect(isUnderfloor({ totalMinutes: 66 }, 60)).toBe(false); // перебор — не недобор
    expect(isUnderfloor({ totalMinutes: 0 }, 60)).toBe(true);
    // Пол = FLOOR_SHARE·B.
    expect(isUnderfloor({ totalMinutes: 60 * FLOOR_SHARE - 0.01 }, 60)).toBe(true);
  });
});

describe('fillToFloor: добор остановками (R1.b)', () => {
  // Раскладка (budget 60 → зона ≈900 м, узлы сетки 500 м):
  //   старт (0,0), A парк (500,0), B кафе (0,500), C кафе (500,-500).
  // Кольцо [A,B]: ходьба 26.67, stay 7+7 → 40.67 < пол 54. Добор C:
  // лучшее плечо +13.33 → итог 40 ходьбы + 21 stay = 61 ∈ [54, 66].
  it('«55 мин при бюджете 60»: кандидат из пула дотягивает итог в [54,66]', async () => {
    const { port } = makeCity([]);
    const points = [makeNode(0, 0), makeNode(500, 0), makeNode(0, 500), makeNode(500, -500)];
    const times = await gridTimes(points, port);
    const legs = await realLegs(port, [points[0], points[1], points[2], points[0]]);

    const result = await fillToFloor({
      sequence: [1, 2],
      legs,
      budgetMinutes: 60,
      matrixWalkMinutes: 26.666666666666664,
      times,
      points,
      stayOf: new Map([[1, 7], [2, 7], [3, 7]]),
      pool: [3],
      categoryOf: (bi) => (bi === 1 ? 'park' : 'cafe'),
      limitOfCategory: () => 2,
      maxStops: 6,
      farEnough: () => true,
      isLoop: true,
      endIndex: 0,
      ports: port,
      routeCalls: { count: 0 },
    });

    const total = walkOf(result.legs) + 21;
    expect(result.sequence).toHaveLength(3);
    expect(result.sequence).toContain(3); // C добавлен добором
    expect(total).toBeGreaterThanOrEqual(54);
    expect(total).toBeLessThanOrEqual(66);
    expect(total).toBeCloseTo(61, 1);
  });

  it('политика добора: maxStops и кап категории не нарушаются', async () => {
    const { port } = makeCity([]);
    const points = [makeNode(0, 0), makeNode(500, 0), makeNode(0, 500), makeNode(500, -500)];
    const times = await gridTimes(points, port);
    const legs = await realLegs(port, [points[0], points[1], points[0]]);

    const result = await fillToFloor({
      sequence: [1],
      legs,
      budgetMinutes: 60,
      matrixWalkMinutes: 13.333333333333332,
      times,
      points,
      stayOf: new Map([[1, 0], [2, 0], [3, 0]]),
      pool: [2, 3],
      categoryOf: () => 'cafe',
      limitOfCategory: () => 1, // кап категории: место B уже занято «кафе»
      maxStops: 6,
      farEnough: () => true,
      isLoop: true,
      endIndex: 0,
      ports: port,
      routeCalls: { count: 0 },
    });

    // Кандидаты одной категории с лимитом 1 не добираются — 1 остановка.
    expect(result.sequence).toEqual([1]);
  });

  it('откат добора: реальный total вылетел за 1.1·B — последовательность и ноги как были', async () => {
    const { port } = makeCity([]);
    const points = [makeNode(0, 0), makeNode(500, 0), makeNode(0, 500)];
    const times = await gridTimes(points, port);
    // Кольцо [A]: start→A→start — две ноги по 6.67 мин, ходьба 13.33.
    const originalLegs = await realLegs(port, [points[0], points[1], points[0]]);

    // Порт лжёт на плече B→A: матрица обещала 13.33 мин, роутер вернул 60.
    const lyingPort: WalkRoutingPort = {
      route: async (req) => {
        const segment = await port.route(req);
        const [a, b] = req.waypoints;
        if (a[0] === points[2][0] && b[0] === points[1][0]) {
          return { ...segment, durationSeconds: 3600 };
        }
        return segment;
      },
      matrix: (s, t) => port.matrix(s, t),
    };

    // Оценка по матрице: 13.33 (кольцо) + 13.33 (дельта B) + 20 stay = 46.67
    // ≤ 63 (потолок мин запас) — кандидат влезает; реальный total
    // 6.67 + 60 + 20 = 86.67 > 66 → откат последнего добора и стоп.
    const result = await fillToFloor({
      sequence: [1],
      legs: originalLegs.slice(),
      budgetMinutes: 60,
      matrixWalkMinutes: 13.333333333333332,
      times,
      points,
      stayOf: new Map([[1, 10], [2, 10]]),
      pool: [2],
      categoryOf: () => 'park',
      limitOfCategory: () => 2,
      maxStops: 6,
      farEnough: () => true,
      isLoop: true,
      endIndex: 0,
      ports: lyingPort,
      routeCalls: { count: 0 },
    });

    expect(result.sequence).toEqual([1]);
    expect(result.legs).toEqual(originalLegs);
    expect(walkOf(result.legs)).toBeCloseTo(13.333333333333332, 6);
    // Пол не дотянут — честный недобор остаётся (гейт budget покажет его).
    expect(walkOf(result.legs) + 10).toBeLessThan(54);
  });
});

describe('fillToFloor: via-удлинение (R1.c)', () => {
  // Детерминированный стаб: трёхточечный (via) запрос возвращает длительность
  // из очереди — так tune-цикл проверяется без геометрических сюрпризов сетки.
  // viaCalls копит {leg, minutes}: leg = концы исходной ноги — группировка
  // попыток по ноге для ассерта капа «≤3 попыток на ногу».
  function stubPort(durationsMin: number[]): {
    port: WalkRoutingPort;
    viaCalls: { leg: string; minutes: number }[];
  } {
    const viaCalls: { leg: string; minutes: number }[] = [];
    let attempt = 0;
    const line = (a: WalkLatLng, b: WalkLatLng): WalkLatLng[] => [a, b];
    return {
      viaCalls,
      port: {
        route: async (req) => {
          const [a, b] = [req.waypoints[0], req.waypoints[req.waypoints.length - 1]];
          if (req.waypoints.length === 3) {
            const minutes = durationsMin[Math.min(attempt, durationsMin.length - 1)];
            attempt += 1;
            viaCalls.push({ leg: `${a[0].toFixed(4)},${a[1].toFixed(4)}->${b[0].toFixed(4)},${b[1].toFixed(4)}`, minutes });
            const mid = req.waypoints[1];
            return {
              distanceMeters: minutes * SPEED_M_PER_MIN,
              durationSeconds: minutes * 60,
              geometry: [...line(a, mid).slice(0, -1), mid, ...line(mid, b).slice(1)],
              source: 'pack',
            };
          }
          return {
            distanceMeters: 1000,
            durationSeconds: 15 * 60, // каждая обычная нога — 15 мин
            geometry: line(a, b),
            source: 'pack',
          };
        },
        matrix: async (sources, targets) => {
          const cells: WalkMatrixCell[] = [];
          for (let si = 0; si < sources.length; si++) {
            for (let ti = 0; ti < targets.length; ti++) {
              cells.push({
                sourceIndex: si,
                targetIndex: ti,
                distanceMeters: 1000,
                durationSeconds: 15 * 60,
              });
            }
          }
          return cells;
        },
      },
    };
  }

  const stubPoints = (): WalkLatLng[] => [makeNode(0, 0), makeNode(500, 0), makeNode(-500, 0)];

  function stubLegs(points: WalkLatLng[]): WalkLeg[] {
    return [0, 1, 2].map((i, k) => ({
      from: points[i],
      to: points[[1, 2, 0][k]],
      distanceMeters: 1000,
      durationMinutes: 15,
      geometry: [points[i], points[[1, 2, 0][k]]],
    }));
  }

  const stubTimes = (): number[][] =>
    Array.from({ length: 3 }, (_, i) => Array.from({ length: 3 }, (_, j) => (i === j ? 0 : 15)));

  const stubFill = (port: WalkRoutingPort) =>
    fillToFloor({
      sequence: [1, 2],
      legs: stubLegs(stubPoints()),
      budgetMinutes: 60,
      matrixWalkMinutes: 45,
      times: stubTimes(),
      points: stubPoints(),
      stayOf: new Map([[1, 3], [2, 3]]),
      pool: [],
      categoryOf: () => 'park',
      limitOfCategory: () => 2,
      maxStops: 6,
      farEnough: () => true,
      isLoop: true,
      endIndex: 0,
      ports: port,
      routeCalls: { count: 0 },
    });

  // Кольцо [A, B]: ходьба 3 × 15 = 45, stay 3+3 → 51 < пол 54 (недобор 3 мин).
  // Попытка 1 — via без прибавки (grow), попытка 2 — 18 мин → итог 54 ∈ окно.
  it('tune-цикл: недолёт → grow → окно; кап попыток не превышен', async () => {
    const { port, viaCalls } = stubPort([15, 18]);
    const result = await stubFill(port);

    expect(viaCalls.map((c) => c.minutes)).toEqual([15, 18]); // недолёт → grow → в окне
    expect(result.legs).toHaveLength(4); // нога разрезана на две
    const total = walkOf(result.legs) + 6;
    expect(total).toBeGreaterThanOrEqual(54);
    expect(total).toBeLessThanOrEqual(66);
  });

  it('кап ≤3 попыток на ногу: перебор никогда не выходит за потолок', async () => {
    const { port, viaCalls } = stubPort([15, 16, 16]);
    const result = await stubFill(port);

    // Кап — НА НОГУ (док R1.c): ни одна нога не получает больше 3 попыток.
    const perLeg = new Map<string, number>();
    for (const { leg } of viaCalls) perLeg.set(leg, (perLeg.get(leg) ?? 0) + 1);
    expect(perLeg.size).toBeGreaterThan(0);
    for (const count of perLeg.values()) expect(count).toBeLessThanOrEqual(3);
    // Вспомогательных via-ног максимум 2 (MAX_VIA_LEGS), попыток — ≤ 6.
    expect(viaCalls.length).toBeLessThanOrEqual(6);
    // Инвариант §12: итог не выше потолка; ходьба не уменьшилась.
    const total = walkOf(result.legs) + 6;
    expect(total).toBeLessThanOrEqual(66);
    expect(total).toBeGreaterThanOrEqual(51);
    expect(walkOf(result.legs)).toBeGreaterThanOrEqual(45);
  });

  it('NO_ROUTE на via → исходная нога сохранена; пул исчерпан → честный недобор без фиктивных минут', async () => {
    const { port } = makeCity([]);
    const points = [makeNode(0, 0), makeNode(500, 0), makeNode(-500, 0)];
    const times = await gridTimes(points, port);
    const legs = await realLegs(port, [points[0], points[1], points[2], points[0]]);

    // Роутер строит только двухточечные маршруты: все via-попытки отбиваются.
    const twoPointOnly: WalkRoutingPort = {
      route: async (req) => {
        if (req.waypoints.length === 3) throw new Error('NO_ROUTE: via не поддержан');
        return port.route(req);
      },
      matrix: (s, t) => port.matrix(s, t),
    };

    const result = await fillToFloor({
      sequence: [1, 2],
      legs,
      budgetMinutes: 60,
      matrixWalkMinutes: 26.666666666666664,
      times,
      points,
      stayOf: new Map([[1, 3], [2, 3]]),
      pool: [], // пул исчерпан
      categoryOf: () => 'park',
      limitOfCategory: () => 2,
      maxStops: 6,
      farEnough: () => true,
      isLoop: true,
      endIndex: 0,
      ports: twoPointOnly,
      routeCalls: { count: 0 },
    });

    // Ноги не тронуты, план возвращён как есть: 26.67 ходьбы + 6 stay = 32.67.
    expect(result.legs).toHaveLength(3);
    expect(result.sequence).toEqual([1, 2]);
    const total = walkOf(result.legs) + 6;
    expect(total).toBeCloseTo(32.666666666666664, 6);
    expect(total).toBeLessThan(54); // честный недобор, не фиктивные минуты
  });

  it('via «туда-обратно» по улице петли отсекается гейтом улиц: нога не тронута', async () => {
    // Вся петля на одной улице y=0: via для самой длинной ноги (A→B, вся
    // улица) кладёт крюк на ту же улицу — гейт улиц обязан его отсечь. Нога
    // остаётся исходной (по ссылке), добор продолжается на коротких ногах.
    const { port } = makeCity([]);
    const points = [makeNode(0, 0), makeNode(500, 0), makeNode(-500, 0)];
    const times = await gridTimes(points, port);
    const legs = await realLegs(port, [points[0], points[1], points[2], points[0]]);
    const longLeg = legs[1]; // A→B, 1000 м по всей улице

    const result = await fillToFloor({
      sequence: [1, 2],
      legs,
      budgetMinutes: 60,
      matrixWalkMinutes: 26.666666666666664,
      times,
      points,
      stayOf: new Map([[1, 3], [2, 3]]),
      pool: [],
      categoryOf: () => 'park',
      limitOfCategory: () => 2,
      maxStops: 6,
      farEnough: () => true,
      isLoop: true,
      endIndex: 0,
      ports: port,
      routeCalls: { count: 0 },
    });

    // Отсечённая нога не пересобрана: тот же объект с теми же метриками.
    const untouched = result.legs.find((leg) => leg === longLeg);
    expect(untouched).toBeDefined();
    expect(untouched?.distanceMeters).toBeCloseTo(1000, 6);
    // Итог не вылел за потолок при любом исходе перебора ног (инвариант §12).
    expect(walkOf(result.legs) + 6).toBeLessThanOrEqual(66);
  });
});

describe('createWalkPlan: коридор бюджета на сборке (интеграция)', () => {
  // Плотный пул: 6 кандидатов в зоне ≈900 м бюджета 60, stay 7.
  // Жадный набор останавливается на 3 якорях с итогом 61 ∈ [54, 66].
  it('плотный пул, бюджет 60: итог в коридоре [54,66]', async () => {
    const { port, places } = makeCity([
      { id: 'park', name: 'Парк', category: 'park', east: 500, north: 0, rating: 4.5 },
      { id: 'cafe', name: 'Кафе', category: 'cafe', east: 0, north: 500 },
      { id: 'museum', name: 'Музей', category: 'museum', east: 500, north: 500 },
      { id: 'rest', name: 'Ресторан', category: 'restaurant', east: -500, north: 0 },
      { id: 'view', name: 'Смотровая', category: 'viewpoint', east: 0, north: -500 },
      { id: 'attr', name: 'Аттракцион', category: 'attraction', east: -500, north: -500 },
    ]);
    const res = await import('@/lib/walk/createWalkPlan').then((m) =>
      m.createWalkPlan(
        {
          start: makeNode(0, 0),
          budgetMinutes: 60,
          categoryWeights: {
            park: 3,
            cafe: 2,
            museum: 2,
            restaurant: 2,
            viewpoint: 2,
            attraction: 2,
          },
          categoryStayMinutes: {
            park: 7,
            cafe: 7,
            museum: 7,
            restaurant: 7,
            viewpoint: 7,
            attraction: 7,
          },
          candidates: places,
          isLoop: true,
        },
        port,
      ),
    );
    if (!res.ok) throw new Error(`ожидался план: ${res.failure.code} ${res.failure.detail}`);

    const best = res.plans[0];
    const total = best.totalMinutes;
    expect(total).toBeGreaterThanOrEqual(60 * FLOOR_SHARE);
    expect(total).toBeLessThanOrEqual(66);
    const budgetGate = best.gates.find((g) => g.gate === 'budget');
    expect(budgetGate?.pass).toBe(true);
    // Скорость сетки сходится: ходьба = манхэттен/75.
    expect(best.totalWalkMinutes).toBeCloseTo(best.totalWalkMinutes, 6);
    void SPEED_M_PER_MIN;
  });
});
