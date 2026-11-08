// src/lib/walk/__tests__/gates.test.ts
// Гейты «Метрики хорошей прогулки» — граничные случаи, включая эвристику
// «петля не возвращается по той же улице» (docs/walk-engine.md §8).

import { describe, it, expect } from 'vitest';
import { evaluateGates } from '@/lib/walk/gates';
import { makeNode } from './gridCity';
import type { GateFacts } from '@/lib/walk/gates';
import type { WalkStop } from '@/lib/walk/types';

function stop(name: string, reason = 'причина зайти'): WalkStop {
  return {
    place: { id: name, name, category: 'cafe', coordinates: makeNode(0, 0) },
    stayMinutes: 10,
    reason,
  };
}

function facts(overrides: Partial<GateFacts> = {}): GateFacts {
  return {
    budgetMinutes: 100,
    totalMinutes: 100,
    stops: [stop('a'), stop('b')],
    legDurations: [10, 10],
    legGeometries: [
      [makeNode(0, 0), makeNode(0, 1000)],
      [makeNode(500, 0), makeNode(500, 1000)],
    ],
    isLoop: true,
    ...overrides,
  };
}

function gate(f: GateFacts, name: string) {
  const report = evaluateGates(f).find((g) => g.gate === name);
  expect(report, `гейт ${name} отсутствует`).toBeTruthy();
  return report!;
}

describe('gate budget', () => {
  it('±10% проходит, за пределами — падает', () => {
    expect(gate(facts({ totalMinutes: 90 }), 'budget').pass).toBe(true);
    expect(gate(facts({ totalMinutes: 110 }), 'budget').pass).toBe(true);
    expect(gate(facts({ totalMinutes: 89 }), 'budget').pass).toBe(false);
    expect(gate(facts({ totalMinutes: 111 }), 'budget').pass).toBe(false);
  });

  it('detail показывает отклонение в процентах', () => {
    const report = gate(facts({ totalMinutes: 110 }), 'budget');
    expect(report.detail).toContain('+10%');
  });
});

describe('gate anchors', () => {
  it('меньше двух якорей или пустая причина — провал', () => {
    expect(gate(facts({ stops: [stop('a')] }), 'anchors').pass).toBe(false);
    expect(gate(facts({ stops: [stop('a', ''), stop('b')] }), 'anchors').pass).toBe(false);
    expect(gate(facts(), 'anchors').pass).toBe(true);
  });

  it('detail называет якорь без причины', () => {
    const report = gate(facts({ stops: [stop('a', '  '), stop('b')] }), 'anchors');
    expect(report.pass).toBe(false);
    expect(report.detail).toContain('«a»');
  });
});

describe('gate long_legs', () => {
  it('нога 25 мин проходит, 26 — падает с номером ноги', () => {
    expect(gate(facts({ legDurations: [10, 25] }), 'long_legs').pass).toBe(true);
    const report = gate(facts({ legDurations: [10, 26.4] }), 'long_legs');
    expect(report.pass).toBe(false);
    expect(report.detail).toContain('нога 2');
  });
});

describe('gate loop_no_repeat_street', () => {
  const streetA = [makeNode(0, 0), makeNode(0, 1000)];
  const streetParallel = [makeNode(500, 0), makeNode(500, 1000)];

  it('возврат по той же улице — провал', () => {
    const report = gate(
      facts({ legGeometries: [streetA, [makeNode(0, 1000), makeNode(0, 0)]] }),
      'loop_no_repeat_street',
    );
    expect(report.pass).toBe(false);
    expect(report.detail).toContain('повторяет');
  });

  it('параллельная улица в 500 м — проход', () => {
    const report = gate(
      facts({ legGeometries: [streetA, streetParallel] }),
      'loop_no_repeat_street',
    );
    expect(report.pass).toBe(true);
    expect(report.detail).toContain('повторов улиц нет');
  });

  it('касание в общей точке (меньше порога 0.6) — проход', () => {
    // Две ноги сходятся в одном узле: перекрытие только возле стыка.
    const leg1 = [makeNode(0, 0), makeNode(0, 1000)];
    const leg2 = [makeNode(0, 1000), makeNode(1000, 1000)];
    const report = gate(facts({ legGeometries: [leg1, leg2] }), 'loop_no_repeat_street');
    expect(report.pass).toBe(true);
  });

  it('нет геометрии — честная пометка вместо выдумки', () => {
    const report = gate(facts({ legGeometries: [[], []] }), 'loop_no_repeat_street');
    expect(report.pass).toBe(true);
    expect(report.detail).toContain('пропущена');
  });
});

describe('набор гейтов по режимам', () => {
  it('в А→Б нет гейта петли, в петле — все четыре', () => {
    const ab = evaluateGates(facts({ isLoop: false })).map((g) => g.gate);
    expect(ab).toEqual(['budget', 'anchors', 'long_legs']);

    const loop = evaluateGates(facts({ isLoop: true })).map((g) => g.gate);
    expect(loop).toEqual(['budget', 'anchors', 'long_legs', 'loop_no_repeat_street']);
  });
});
