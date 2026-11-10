import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEGRADED_NOTES, enginePlanToUiPlan, uiKindForCategory } from '../uiAdapter';
import { quickWalkToYandexMapsUrl } from '../shareCodec';
import type { WalkLatLng } from '../types';
import type { WalkLeg, WalkPlan as EnginePlan, WalkStop } from '../types';

function makeEnginePlan(overrides: Partial<EnginePlan> = {}): EnginePlan {
  const stop = (id: number, name: string, category: string, stay: number): WalkStop => ({
    place: { id, name, category, coordinates: [55.75 + id * 0.001, 37.61 + id * 0.001] },
    stayMinutes: stay,
    reason: 'лучший скор категории в коридоре',
  });
  const leg = (fromIdx: number, toIdx: number, minutes: number): WalkLeg => ({
    from: [55.75 + fromIdx * 0.001, 37.61 + fromIdx * 0.001],
    to: [55.75 + toIdx * 0.001, 37.61 + toIdx * 0.001],
    distanceMeters: minutes * 75,
    durationMinutes: minutes,
    geometry: [],
  });

  return {
    stops: [stop(1, 'Парк Горького', 'park', 15), stop(2, 'Кофейня X', 'cafe', 20)],
    legs: [leg(0, 1, 10), leg(1, 2, 12), leg(2, 0, 8)],
    totalWalkMinutes: 30,
    totalStayMinutes: 35,
    totalMinutes: 65,
    score: 1.7,
    gates: [{ gate: 'budget', pass: true, detail: '65 ≤ 66' }],
    allGatesPass: true,
    ...overrides,
  };
}

describe('uiAdapter: движок → карточка UI', () => {
  it('петля: legs.length === stops.length + 1 → type "loop", totals из округлённых минут', () => {
    const ui = enginePlanToUiPlan(makeEnginePlan(), 60);
    expect(ui.type).toBe('loop');
    expect(ui.legs).toHaveLength(3);
    expect(ui.stops).toHaveLength(2);
    expect(ui.totals).toEqual({ walkMin: 30, stayMin: 35, totalMin: 65 });
  });

  it('A→B: legs.length === stops.length → type "point_to_point"', () => {
    const engine = makeEnginePlan();
    engine.legs = engine.legs.slice(0, 2); // без замыкающей ноги
    const ui = enginePlanToUiPlan(engine, 60);
    expect(ui.type).toBe('point_to_point');
    expect(ui.legs).toHaveLength(2);
  });

  it('категории маппятся в словарь карточек, неизвестные — "other"', () => {
    expect(uiKindForCategory('cafe')).toBe('cafe');
    expect(uiKindForCategory('restaurant')).toBe('food');
    expect(uiKindForCategory('shopping')).toBe('shop');
    expect(uiKindForCategory('viewpoint')).toBe('viewpoint');
    expect(uiKindForCategory('cinema')).toBe('other');
    expect(uiKindForCategory('водоём')).toBe('other');
  });

  it('id строки, имя и причина переносятся как есть; дробный stay округляется', () => {
    const engine = makeEnginePlan();
    engine.stops[0].stayMinutes = 14.6;
    const ui = enginePlanToUiPlan(engine, 60);
    expect(ui.stops[0].id).toBe('1');
    expect(ui.stops[0].name).toBe('Парк Горького');
    expect(ui.stops[0].stayMin).toBe(15);
    expect(ui.stops[1].reason).toContain('коридор');
  });
});

describe('uiAdapter: скоринговые причины и сырьё замены', () => {
  it('scoreReasons мержатся по id места; без карты поле не появляется', () => {
    const engine = makeEnginePlan();
    const map = new Map([
      ['1', { ru: ['рейтинг 4.8 из 5', 'работает сейчас'], en: ['rated 4.8 out of 5', 'open right now'] }],
    ]);
    const withMap = enginePlanToUiPlan(engine, 60, 'ru', map);
    expect(withMap.stops[0].scoreReasons).toEqual({
      ru: ['рейтинг 4.8 из 5', 'работает сейчас'],
      en: ['rated 4.8 out of 5', 'open right now'],
    });
    // Место не из карты — поле не рисуется, старые планы деградируют честно.
    expect(withMap.stops[1].scoreReasons).toBeUndefined();
    const withoutMap = enginePlanToUiPlan(engine, 60);
    expect(withoutMap.stops[0].scoreReasons).toBeUndefined();
  });

  it('якорная причина остаётся главной строкой, скоринговые — вторичное поле', () => {
    const engine = makeEnginePlan();
    const map = new Map([['1', { ru: ['ядро вайба'], en: ['core of the vibe'] }]]);
    const ui = enginePlanToUiPlan(engine, 60, 'ru', map);
    expect(ui.stops[0].reason).toContain('коридор');
    expect(ui.stops[0].scoreReasons?.ru).toEqual(['ядро вайба']);
  });

  it('категория, рейтинг, теги и часы работы едут в карточку для замены без пересборки', () => {
    const engine = makeEnginePlan();
    engine.stops[0].place.rating = 4.7;
    engine.stops[0].place.tags = { opening_hours: 'Mo-Fr 10:00-20:00', website: 'https://example.ru' };
    const ui = enginePlanToUiPlan(engine, 60);
    expect(ui.stops[0].category).toBe('park');
    expect(ui.stops[0].rating).toBe(4.7);
    expect(ui.stops[0].openingHours).toBe('Mo-Fr 10:00-20:00');
    expect(ui.stops[0].tags).toEqual({ opening_hours: 'Mo-Fr 10:00-20:00', website: 'https://example.ru' });
    // Пустые/отсутствующие факты не оставляют мусорных полей.
    expect(ui.stops[1].rating).toBeUndefined();
    expect(ui.stops[1].tags).toBeUndefined();
    expect(ui.stops[1].openingHours).toBeUndefined();
  });
});

describe('uiAdapter: деградационные планы', () => {
  it('degraded маппится с параллельной заметкой; строгий план полей не несёт', () => {
    const partial = enginePlanToUiPlan({ ...makeEnginePlan(), degraded: { level: 'partial' } }, 60);
    expect(partial.degraded?.level).toBe('partial');
    expect(partial.degradedNote?.ru).toContain('мало якорей');
    expect(partial.degradedNote?.en).toContain('fewer stops');

    const loopOnly = enginePlanToUiPlan({ ...makeEnginePlan(), degraded: { level: 'loop-only' } }, 60);
    expect(loopOnly.degraded?.level).toBe('loop-only');
    expect(loopOnly.degradedNote?.ru).toContain('петля');

    const strict = enginePlanToUiPlan(makeEnginePlan(), 60);
    expect(strict.degraded).toBeUndefined();
    expect(strict.degradedNote).toBeUndefined();
  });

  it('словарные тексты деградации синхронны с константами адаптера в обеих локалях', () => {
    const walkUi = (lang: string): Record<string, string> =>
      JSON.parse(readFileSync(join(process.cwd(), 'messages', `${lang}.json`), 'utf-8')).WalkUI;
    const ru = walkUi('ru');
    const en = walkUi('en');
    expect(ru.degradedPartial).toBe(DEGRADED_NOTES.partial.ru);
    expect(ru.degradedLoopOnly).toBe(DEGRADED_NOTES['loop-only'].ru);
    expect(en.degradedPartial).toBe(DEGRADED_NOTES.partial.en);
    expect(en.degradedLoopOnly).toBe(DEGRADED_NOTES['loop-only'].en);
  });
});

describe('uiAdapter: тип прогулки из факта замыкания', () => {
  it('треугольная петля K=1 (1 stop, 3 legs) — loop, бейдж partial, «Идти» замыкается в старт', () => {
    const s: WalkLatLng = [55.75, 37.62];
    const c: WalkLatLng = [55.76, 37.62];
    const apex: WalkLatLng = [55.755, 37.63];
    const base = makeEnginePlan();
    const engine: EnginePlan = {
      ...base,
      stops: base.stops.slice(0, 1),
      legs: [
        { from: s, to: c, distanceMeters: 1200, durationMinutes: 16, geometry: [s, c] },
        { from: c, to: apex, distanceMeters: 600, durationMinutes: 8, geometry: [c, apex] },
        { from: apex, to: s, distanceMeters: 700, durationMinutes: 9, geometry: [apex, s] },
      ],
      degraded: { level: 'partial' },
    };
    const ui = enginePlanToUiPlan(engine, 60);
    expect(ui.type).toBe('loop');
    expect(ui.degraded?.level).toBe('partial');
    // «Идти»: loop-план замыкается — последняя точка rtext = старт.
    const url = quickWalkToYandexMapsUrl(ui, s);
    const last = url.split('rtext=')[1].split('&')[0].split('~').pop();
    expect(last).toBe(`${s[0].toFixed(5)},${s[1].toFixed(5)}`);
  });

  it('loop-only (0 stops, 5 legs) — loop: факт замыкания чинит тип и «Идти»', () => {
    const s: WalkLatLng = [55.75, 37.62];
    const ring: WalkLatLng[] = [s, [55.76, 37.62], [55.76, 37.63], [55.75, 37.63], [55.745, 37.62], s];
    const legs = ring.slice(0, -1).map((from, i) => ({
      from,
      to: ring[i + 1],
      distanceMeters: 500,
      durationMinutes: 6.7,
      geometry: [from, ring[i + 1]],
    }));
    const engine: EnginePlan = {
      ...makeEnginePlan(),
      stops: [],
      legs,
      degraded: { level: 'loop-only' },
    };
    const ui = enginePlanToUiPlan(engine, 60);
    expect(ui.type).toBe('loop');
    // loop-only ветка шаринга: сэмпл замкнутой геометрии кончается стартом.
    const url = quickWalkToYandexMapsUrl(ui, s);
    const last = url.split('rtext=')[1].split('&')[0].split('~').pop();
    expect(last).toBe(`${s[0].toFixed(5)},${s[1].toFixed(5)}`);
  });

  it('строгий А→Б с геометрией — point_to_point: последняя нога не приходит в старт', () => {
    const s: WalkLatLng = [55.75, 37.62];
    const mid: WalkLatLng = [55.76, 37.62];
    const e: WalkLatLng = [55.77, 37.64];
    const engine: EnginePlan = {
      ...makeEnginePlan(),
      legs: [
        { from: s, to: mid, distanceMeters: 1000, durationMinutes: 13, geometry: [s, mid] },
        { from: mid, to: e, distanceMeters: 900, durationMinutes: 12, geometry: [mid, e] },
      ],
    };
    expect(enginePlanToUiPlan(engine, 60).type).toBe('point_to_point');
  });

  it('без геометрии — старая арифметика: legs === stops+1 → loop, иначе point_to_point', () => {
    // makeEnginePlan: geometry пустые → фолбэк на counts.
    expect(enginePlanToUiPlan(makeEnginePlan(), 60).type).toBe('loop');
    const ab = makeEnginePlan();
    ab.legs = ab.legs.slice(0, 2);
    expect(enginePlanToUiPlan(ab, 60).type).toBe('point_to_point');
  });
});
