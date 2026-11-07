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

export interface WalkStop {
  id: string;
  name: string;
  kind: WalkStopKind;
  /** Сколько минут проводим на месте */
  stayMin: number;
  /** Зачем сюда заходить — единственная строка причины в таймлайне */
  reason: string;
}

export interface WalkLeg {
  /** Минуты ходьбы между соседними точками маршрута */
  walkMin: number;
}

export interface WalkPlanTotals {
  walkMin: number;
  stayMin: number;
  totalMin: number;
}

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
}
