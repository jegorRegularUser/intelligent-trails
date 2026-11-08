import { describe, expect, it } from 'vitest';

import { evaluateOpeningHours } from '@/lib/places/hours';

/** 2024-01-15 — понедельник, 2024-01-20 — суббота, 2024-01-21 — воскресенье. */
const at = (iso: string) => new Date(iso);
const UTC = 'UTC';
const MOSCOW = 'Europe/Moscow';

describe('evaluateOpeningHours — границы интервала', () => {
  const hours = 'Mo-Fr 09:00-18:00';

  it('закрыто за минуту до открытия', () => {
    expect(evaluateOpeningHours(hours, at('2024-01-15T08:59:00Z'), UTC)).toBe('closed');
  });

  it('открыто ровно в момент открытия (включительно)', () => {
    expect(evaluateOpeningHours(hours, at('2024-01-15T09:00:00Z'), UTC)).toBe('open');
  });

  it('открыто за минуту до закрытия', () => {
    expect(evaluateOpeningHours(hours, at('2024-01-15T17:59:00Z'), UTC)).toBe('open');
  });

  it('закрыто ровно в момент закрытия (исключительно)', () => {
    expect(evaluateOpeningHours(hours, at('2024-01-15T18:00:00Z'), UTC)).toBe('closed');
  });

  it('23:59 при 09:00-24:00 — открыто', () => {
    expect(evaluateOpeningHours('Mo-Fr 09:00-24:00', at('2024-01-15T23:59:00Z'), UTC)).toBe('open');
  });

  it('полночь после 09:00-24:00 — уже закрыто', () => {
    expect(evaluateOpeningHours('Mo-Fr 09:00-24:00', at('2024-01-16T00:00:00Z'), UTC)).toBe('closed');
  });
});

describe('evaluateOpeningHours — ночь через полночь', () => {
  const hours = 'Sa 22:00-04:00';

  it('закрыто в 21:59 субботы', () => {
    expect(evaluateOpeningHours(hours, at('2024-01-20T21:59:00Z'), UTC)).toBe('closed');
  });

  it('открыто в 22:00 субботы', () => {
    expect(evaluateOpeningHours(hours, at('2024-01-20T22:00:00Z'), UTC)).toBe('open');
  });

  it('открыто в 03:59 воскресенья (хвост субботнего интервала)', () => {
    expect(evaluateOpeningHours(hours, at('2024-01-21T03:59:00Z'), UTC)).toBe('open');
  });

  it('закрыто в 04:00 воскресенья', () => {
    expect(evaluateOpeningHours(hours, at('2024-01-21T04:00:00Z'), UTC)).toBe('closed');
  });

  it('закрыто в 22:00 воскресенья — правило только для субботы', () => {
    expect(evaluateOpeningHours(hours, at('2024-01-21T22:00:00Z'), UTC)).toBe('closed');
  });

  it('интервал через границу недели (Su 22:00-02:00) достаётся понедельнику', () => {
    const weekWrap = 'Su 22:00-02:00';
    expect(evaluateOpeningHours(weekWrap, at('2024-01-22T01:00:00Z'), UTC)).toBe('open');
    expect(evaluateOpeningHours(weekWrap, at('2024-01-22T02:00:00Z'), UTC)).toBe('closed');
  });
});

describe('evaluateOpeningHours — селекторы дней', () => {
  it('24/7 открыто всегда, даже ночью в воскресенье', () => {
    expect(evaluateOpeningHours('24/7', at('2024-01-21T03:17:00Z'), UTC)).toBe('open');
  });

  it('off — всегда закрыто', () => {
    expect(evaluateOpeningHours('off', at('2024-01-15T12:00:00Z'), UTC)).toBe('closed');
  });

  it('список Sa,Su: суббота открыта, понедельник закрыт', () => {
    const hours = 'Sa,Su 10:00-22:00';
    expect(evaluateOpeningHours(hours, at('2024-01-20T12:00:00Z'), UTC)).toBe('open');
    expect(evaluateOpeningHours(hours, at('2024-01-15T12:00:00Z'), UTC)).toBe('closed');
  });

  it('диапазон дней Fr-Mo через границу недели', () => {
    const hours = 'Fr-Mo 08:00-20:00';
    expect(evaluateOpeningHours(hours, at('2024-01-21T10:00:00Z'), UTC)).toBe('open'); // Su
    expect(evaluateOpeningHours(hours, at('2024-01-18T10:00:00Z'), UTC)).toBe('closed'); // Th
    expect(evaluateOpeningHours(hours, at('2024-01-19T07:59:00Z'), UTC)).toBe('closed'); // Fr до открытия
  });

  it('время без дней — все дни', () => {
    expect(evaluateOpeningHours('09:00-18:00', at('2024-01-20T12:00:00Z'), UTC)).toBe('open');
  });

  it('регистр дней не важен', () => {
    expect(evaluateOpeningHours('mo-fr 09:00-18:00', at('2024-01-15T10:00:00Z'), UTC)).toBe('open');
  });

  it('несколько правил через ";"', () => {
    const hours = 'Mo-Fr 09:00-18:00; Sa,Su 10:00-22:00';
    expect(evaluateOpeningHours(hours, at('2024-01-20T10:00:00Z'), UTC)).toBe('open');
    expect(evaluateOpeningHours(hours, at('2024-01-20T09:59:00Z'), UTC)).toBe('closed');
    expect(evaluateOpeningHours(hours, at('2024-01-15T09:00:00Z'), UTC)).toBe('open');
  });
});

describe('evaluateOpeningHours — вычитания (off-правила)', () => {
  it('Tu off выкидывает вторник целиком', () => {
    const hours = 'Mo-Fr 09:00-18:00; Tu off';
    expect(evaluateOpeningHours(hours, at('2024-01-16T12:00:00Z'), UTC)).toBe('closed');
    expect(evaluateOpeningHours(hours, at('2024-01-15T12:00:00Z'), UTC)).toBe('open');
  });

  it('обеденный перерыв вычитается из интервала', () => {
    const hours = 'Mo-Su 10:00-20:00; We 14:00-16:00 off';
    expect(evaluateOpeningHours(hours, at('2024-01-17T13:59:00Z'), UTC)).toBe('open');
    expect(evaluateOpeningHours(hours, at('2024-01-17T14:00:00Z'), UTC)).toBe('closed');
    expect(evaluateOpeningHours(hours, at('2024-01-17T16:00:00Z'), UTC)).toBe('open');
  });
});

describe('evaluateOpeningHours — таймзона', () => {
  const hours = 'Mo-Fr 09:00-18:00';

  it('один и тот же момент — разные ответы в разных зонах', () => {
    // 2024-01-15T15:00:00Z = 18:00 в Москве (закрыто) и 15:00 в UTC (открыто).
    expect(evaluateOpeningHours(hours, at('2024-01-15T15:00:00Z'), UTC)).toBe('open');
    expect(evaluateOpeningHours(hours, at('2024-01-15T15:00:00Z'), MOSCOW)).toBe('closed');
  });

  it('за минуту до московского закрытия — открыто', () => {
    expect(evaluateOpeningHours(hours, at('2024-01-15T14:59:00Z'), MOSCOW)).toBe('open');
  });

  it('неизвестная таймзона → unknown, не closed', () => {
    expect(evaluateOpeningHours(hours, at('2024-01-15T10:00:00Z'), 'Mars/Olympus')).toBe('unknown');
  });
});

describe('evaluateOpeningHours — честный unknown', () => {
  it('пустая строка и отсутствие строки', () => {
    expect(evaluateOpeningHours('', at('2024-01-15T10:00:00Z'), UTC)).toBe('unknown');
    expect(evaluateOpeningHours('   ', at('2024-01-15T10:00:00Z'), UTC)).toBe('unknown');
    expect(evaluateOpeningHours(undefined, at('2024-01-15T10:00:00Z'), UTC)).toBe('unknown');
    expect(evaluateOpeningHours(null, at('2024-01-15T10:00:00Z'), UTC)).toBe('unknown');
  });

  it.each([
    ['PH 09:00-18:00'], // праздничный модификатор не поддержан
    ['Mo-Fr 09:00+'], // «и дальше без известного конца»
    ['Mo-Fr 09:00-28:00'], // часы за пределами суток
    ['week 6 Mo 09:00-18:00'], // номера недель
    ['Mo-Fr sunrise-sunset'], // астрономические события
    ['Mo-Fr 09:00-18:00; PH off'], // одно непонятное правило портит всю строку
    ['Mo-Fr 09:00-09:00'], // нулевой интервал
    ['Mo-Fr 9:00-18:00-ish'], // мусор
  ])('непарсируемое «%s» → unknown', (raw) => {
    expect(evaluateOpeningHours(raw, at('2024-01-15T10:00:00Z'), UTC)).toBe('unknown');
  });
});
