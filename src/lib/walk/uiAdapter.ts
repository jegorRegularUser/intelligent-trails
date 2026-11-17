// src/lib/walk/uiAdapter.ts
// Мост движок (lib/walk) → UI-карточка (components/walk/types.ts).
// Чистые функции без побочных эффектов — тестируются без сети и React.
import type { WalkGateName, WalkPlan as EngineWalkPlan } from './types';
import { haversineMeters } from './internal/geo';
import type {
  WalkDegradedLevel,
  WalkPlan as UiWalkPlan,
  WalkScoreReasons,
  WalkStopKind,
} from '@/components/walk/types';

/**
 * Честность в UI (docs/walk-loop-quality.md R5): карточка получает отчёты
 * гейтов движка как есть. Поле объявляется аддитивной декларацией здесь —
 * волна не трогает UI-слой (components/**), рендер с guard'ом приходит
 * следующей волной; старые/расшаренные планы без поля деградируют честно.
 */
declare module '@/components/walk/types' {
  interface WalkPlan {
    /** Плоский массив отчётов гейтов движка (не гейт-флаг): что именно упало. */
    gatesSummary?: { name: WalkGateName; pass: boolean; detail?: string }[];
  }
}

/**
 * Человекочитаемые заметки для проваленных гейтов (R5), параллельные ru/en
 * как у DEGRADED_NOTES. Словарь WalkUI.gateNoteUnderfloor / gateNoteWalkShare
 * дублирует эти тексты — тест сверяет синхронность (uiAdapter.test.ts).
 * Рендер решает сам, какую заметку показать (например, заметку бюджета —
 * только при недоборе, не при перерасходе).
 */
export const GATE_NOTES: Partial<Record<WalkGateName, { ru: string; en: string }>> = {
  budget: {
    ru: 'Прогулка вышла короче плана: рядом мало мест',
    en: 'The walk came out shorter than planned: not enough places nearby',
  },
  walk_share: {
    ru: 'Много сидения, мало ходьбы',
    en: 'More sitting than walking',
  },
};

/** «Замкнута» — последняя нога приходит в точку старта первой (±10 м: округление ORS ~1 м). */
const LOOP_CLOSURE_EPS_METERS = 10;

/**
 * Тип прогулки — из ФАКТА замыкания, а не из арифметики counts: треугольная
 * петля K=1 (1 stop, 3 legs) и чистая уличная петля (0 stops, 5 legs) замкнуты
 * геометрически, но старой формулой падали в point_to_point — карточка рисовала
 * «Из А в Б», а шаринг терял возврат к старту. Нет геометрии у краевых ног —
 * фолбэк на старую арифметику (старые планы, деградация без полилиний).
 */
function isClosedLoop(engine: EngineWalkPlan): boolean {
  if (engine.legs.length === 0) return false;
  const first = engine.legs[0];
  const last = engine.legs[engine.legs.length - 1];
  if (first.geometry.length >= 2 && last.geometry.length >= 2) {
    return haversineMeters(last.to, first.from) <= LOOP_CLOSURE_EPS_METERS;
  }
  return engine.legs.length === engine.stops.length + 1;
}

/**
 * Заметки о деградации (PRODUCT: честная деградация, никогда не врём):
 * параллельные ru/en, как у движковых причин. Словарь WalkUI.degradedPartial /
 * degradedLoopOnly дублирует эти тексты для рендера — тест сверяет их
 * синхронность, чтобы тексты не разъехались.
 */
export const DEGRADED_NOTES: Record<WalkDegradedLevel, { ru: string; en: string }> = {
  partial: {
    ru: 'Рядом мало якорей — собрали прогулку с меньшим числом остановок',
    en: 'Not many anchors nearby — the walk has fewer stops than usual',
  },
  'loop-only': {
    ru: 'Интересных мест рядом не нашлось — вот пешеходная петля на всё твоё время',
    en: 'No interesting places nearby — here is a walking loop for your time',
  },
};

/** Категория реестра (constants/categories.ts) → kind карточки UI. */
const CATEGORY_TO_UI_KIND: Record<string, WalkStopKind> = {
  cafe: 'cafe',
  restaurant: 'food',
  bar: 'food',
  park: 'park',
  museum: 'museum',
  cinema: 'other',
  shopping: 'shop',
  viewpoint: 'viewpoint',
  attraction: 'other',
  waterfront: 'waterfront',
  market: 'market',
};

export function uiKindForCategory(category: string): WalkStopKind {
  return CATEGORY_TO_UI_KIND[category] ?? 'other';
}

/** Причина в словаре локали: у движка есть RU-факт и EN-твин. */
function reasonFor(stop: EngineWalkPlan['stops'][number], locale: 'ru' | 'en'): string {
  return locale === 'en' ? (stop.reasonEn ?? stop.reason) : stop.reason;
}

/** Скоринговые причины по id места (quickPipeline.buildScoreReasonsMap). */
export type ScoreReasonsById = ReadonlyMap<string, WalkScoreReasons>;

/**
 * Один план движка → форма для WalkSummaryCard.
 * Легы движка идут от старта через остановки (и замыкают петлю) —
 * ровно семантика legs UI-типа: петля = stops+1, A→B = stops.
 * geometry каждого лега — полилиния [lat,lng] для отрисовки на карте.
 *
 * scoreReasons — опциональная карта скоринговых причин: якорная причина
 * (stop.reason) остаётся главной строкой, скоринговые едут вторичными чипами.
 * Без карты (старые планы, история) карточка рендерится как раньше.
 */
export function enginePlanToUiPlan(
  engine: EngineWalkPlan,
  budgetMin: number,
  locale: 'ru' | 'en' = 'ru',
  scoreReasons?: ScoreReasonsById,
): UiWalkPlan {
  const stops = engine.stops.map((stop) => {
    const place = stop.place;
    const tags = place.tags;
    const openingHours = tags?.opening_hours;
    const reasons = scoreReasons?.get(`${place.id}`);
    return {
      id: `${place.id}`,
      name: place.name,
      kind: uiKindForCategory(place.category),
      stayMin: Math.round(stop.stayMinutes),
      reason: reasonFor(stop, locale),
      coordinates: place.coordinates,
      // Сырьё для локальной замены остановки: категория/рейтинг/теги нужны
      // экшену, чтобы пересобрать сегмент без полной перестройки прогулки.
      category: place.category,
      ...(place.rating !== undefined ? { rating: place.rating } : {}),
      ...(tags && Object.keys(tags).length > 0 ? { tags } : {}),
      ...(openingHours ? { openingHours } : {}),
      ...(reasons ? { scoreReasons: reasons } : {}),
    };
  });

  const legs = engine.legs.map((leg) => ({
    walkMin: Math.round(leg.durationMinutes),
    ...(leg.geometry.length > 0 ? { geometry: leg.geometry } : {}),
  }));

  const walkMin = legs.reduce((sum, l) => sum + l.walkMin, 0);
  const stayMin = stops.reduce((sum, s) => sum + s.stayMin, 0);

  return {
    id: `walk-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    type: isClosedLoop(engine) ? 'loop' : 'point_to_point',
    budgetMin,
    stops,
    legs,
    // Пересчитаны из округлённых минут UI — чтобы шапка совпадала с таймлайном
    totals: { walkMin, stayMin, totalMin: walkMin + stayMin },
    gatesPass: engine.allGatesPass,
    // Сколько гейтов прошло у движкового плана — честная база фолбэка для
    // локальной замены (раньше клиент хардкодил 4, и деградированные планы
    // получали базу 0/4 вразнобой).
    gatesPassedCount: engine.gates.filter((g) => g.pass).length,
    // Отчёты гейтов как есть (R5): клиент видит, ЧТО упало, и шлёт базу
    // фолбэка замены из этого списка, а не хардкод «петля = 4».
    gatesSummary: engine.gates.map((gate) => ({
      name: gate.gate,
      pass: gate.pass,
      detail: gate.detail,
    })),
    // Деградационные планы несут уровень и параллельную заметку: карточка
    // показывает бейдж, сохранённые планы остаются самодостаточными.
    ...(engine.degraded
      ? { degraded: engine.degraded, degradedNote: DEGRADED_NOTES[engine.degraded.level] }
      : {}),
  };
}

/** Все планы движка (движок отдаёт до трёх вариантов). */
export function enginePlansToUiPlans(
  engines: EngineWalkPlan[],
  budgetMin: number,
  locale: 'ru' | 'en' = 'ru',
  scoreReasons?: ScoreReasonsById,
): UiWalkPlan[] {
  return engines.map((plan) => enginePlanToUiPlan(plan, budgetMin, locale, scoreReasons));
}

/** Полная полилиния прогулки для карты: старт + геометрии всех легов подряд. */
export function planPolyline(plan: UiWalkPlan, start: [number, number]): [number, number][] {
  const points: [number, number][] = [start];
  for (const leg of plan.legs) {
    for (const pt of leg.geometry ?? []) {
      const last = points[points.length - 1];
      // стыкуем леги без дублей узла на границе
      if (Math.abs(last[0] - pt[0]) > 1e-9 || Math.abs(last[1] - pt[1]) > 1e-9) {
        points.push(pt);
      }
    }
  }
  return points;
}
