// Форма данных будущего движка прогулок. Пока живёт локально в UI-слое:
// компоненты walk/** рендерят её как есть, интеграции со стором и движком нет.

export type WalkType = "loop" | "point_to_point";

export type WalkStopKind =
  | "park"
  | "cafe"
  | "food"
  | "museum"
  | "viewpoint"
  | "shop"
  | "waterfront"
  | "market"
  | "other";

/**
 * Скоринговые причины места (lib/vibes/ranking): параллельные массивы ru/en.
 * Позитивные идут первыми; негативные («сейчас закрыто», «открытая остановка
 * в жару») попадают сюда только когда позитивных нет вовсе — они объясняют
 * место в хвосте шорт-листа и показываются приглушённо. Вторичны к reason.
 */
export interface WalkScoreReasons {
  ru: string[];
  en: string[];
}

export interface WalkStop {
  id: string;
  name: string;
  kind: WalkStopKind;
  /** Сколько минут проводим на месте */
  stayMin: number;
  /** Зачем сюда заходить — единственная строка причины в таймлайне */
  reason: string;
  /** Координаты [lat,lng] — для сохранения, шеринга и кнопки «Идти» (интеграция). */
  coordinates?: [number, number];
  /** Движковая категория (constants/categories) — сырьё для замены остановки без пересборки. */
  category?: string;
  /** Скоринговые причины — 1-2 muted-чипа под строкой причины. */
  scoreReasons?: WalkScoreReasons;
  /** Рейтинг места, если источник даёт — участвует в замене остановки. */
  rating?: number;
  /** OSM-теги сырьём — факты для скоринга при замене. */
  tags?: Record<string, string>;
  /** Часы работы OSM — вытащены из tags для экшена замены. */
  openingHours?: string;
}

export interface WalkLeg {
  /** Минуты ходьбы между соседними точками маршрута */
  walkMin: number;
  /** Полилиния [lat,lng] для отрисовки на карте (интеграция). */
  geometry?: [number, number][];
}

export interface WalkPlanTotals {
  walkMin: number;
  stayMin: number;
  totalMin: number;
}

/** Уровень деградации: план построен лестницей fallback, а не строгим движком. */
export type WalkDegradedLevel = "partial" | "loop-only";

export interface WalkPlan {
  id: string;
  type: WalkType;
  /** Бюджет времени, под который строилась прогулка (минуты) */
  budgetMin: number;
  stops: WalkStop[];
  /**
   * Перегон legs[i] — ходьба от точки i к точке i+1 (stops/старт/финиш).
   * Петля: legs.length === stops.length + 1 (последний перегон — возврат к старту).
   * A→B:   legs.length === stops.length (последняя остановка — финиш).
   */
  legs: WalkLeg[];
  totals: WalkPlanTotals;
  /** Все гейты качества движка пройдены (бюджет ±10%, якоря, ноги, ходьба, улицы). */
  gatesPass?: boolean;
  /** Сколько гейтов фактически прошло — база фолбэка для локальной замены. */
  gatesPassedCount?: number;
  /** Деградационный план: карточка показывает честную заметку-бейдж. */
  degraded?: { level: WalkDegradedLevel };
  /** Заметка о деградации параллельными ru/en — движковый факт уровня. */
  degradedNote?: { ru: string; en: string };
}
