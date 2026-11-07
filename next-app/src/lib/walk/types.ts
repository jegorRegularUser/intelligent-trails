// src/lib/walk/types.ts
// Локальные структурные типы движка прогулок. Специально НЕ импортируют
// lib/geo/types (docs/walk-engine.md §2): TS-структурность делает типы взаимно
// совместимыми — GeoPlace[] передаётся как WalkPlace[], а любой GeoProvider
// удовлетворяет WalkRoutingPort (см. ports.ts) без адаптера.
// Единицы: метры и секунды на границе порта, минуты внутри движка.

/** Координаты в порядке приложения: [широта, долгота]. */
export type WalkLatLng = [number, number];

/** Место-кандидат. Структурное подмножество GeoPlace: лишние поля источников игнорируются. */
export interface WalkPlace {
  id: string | number;
  name: string;
  category: string;
  coordinates: WalkLatLng;
  /** 0-5, если источник даёт. */
  rating?: number;
}

export interface WalkInput {
  start: WalkLatLng;
  /** Финиш; обязателен при isLoop = false (режим «А→Б, но красиво»). */
  end?: WalkLatLng;
  /** Бюджет времени в минутах — первое ограничение генератора. */
  budgetMinutes: number;
  /** Вес категории; отсутствие или <=0 — категория не нужна. */
  categoryWeights: Record<string, number>;
  candidates: WalkPlace[];
  isLoop: boolean;
  /** Скорость для расчёта зоны поиска, км/ч. Время ног считает порт. */
  walkingSpeedKmh?: number;
  /** Переопределение таблицы stay (минут на якорь по категории). */
  categoryStayMinutes?: Record<string, number>;
}

/** Остановка-якорь. */
export interface WalkStop {
  place: WalkPlace;
  /** Минут, проведённых на месте (таблица stay, docs/walk-engine.md §6). */
  stayMinutes: number;
  /** Причина зайти — по-русски, из фактов выбора (§9). */
  reason: string;
}

/** Нога маршрута по реальным улицам — метрики от роутинга, не догадки. */
export interface WalkLeg {
  from: WalkLatLng;
  to: WalkLatLng;
  distanceMeters: number;
  durationMinutes: number;
  /** Полилиния [lat,lng]; пустой массив, если источник не дал геометрию. */
  geometry: WalkLatLng[];
}

export type WalkGateName =
  | 'budget'
  | 'anchors'
  | 'long_legs'
  | 'loop_no_repeat_street';

/** Отчёт по одному гейту «Метрики хорошей прогулки» (PRODUCT.md). */
export interface GateReport {
  gate: WalkGateName;
  pass: boolean;
  detail: string;
}

export interface WalkPlan {
  stops: WalkStop[];
  legs: WalkLeg[];
  totalWalkMinutes: number;
  totalStayMinutes: number;
  /** Σ ходьба + Σ stay — финальные метрики реальных ног (§4.8). */
  totalMinutes: number;
  /** Σ весов выбранных якорей − штраф за ноги > 25 мин (§10). */
  score: number;
  gates: GateReport[];
  allGatesPass: boolean;
}

export type WalkFailureCode =
  | 'INVALID_INPUT'
  | 'NOT_ENOUGH_TIME'
  | 'NO_CANDIDATES'
  | 'NO_ROUTE';

export interface WalkFailure {
  code: WalkFailureCode;
  detail: string;
}

export type WalkPlanResult =
  | { ok: true; plans: WalkPlan[] }
  | { ok: false; failure: WalkFailure };

// --- Константы контракта (docs/walk-engine.md) ---

export const DEFAULT_WALKING_SPEED_KMH = 4.5;
/** Верхняя граница шорт-листа кандидатов перед заказом матрицы. */
export const MAX_CANDIDATES = 60;
/** Продуктовый потолок остановок (PRODUCT: 2–4, запас для длинных бюджетов). */
export const MAX_STOPS = 6;
/** Нет сегмента длиннее ~25 минут без остановки. */
export const MAX_LEG_MINUTES = 25;
/** Бюджет ±10%. */
export const BUDGET_TOLERANCE = 0.1;
