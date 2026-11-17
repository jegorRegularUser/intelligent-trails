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
  /** OSM-теги: логику движка не трогают, едут пассажиром в UI (часы работы карточки). */
  tags?: Record<string, string>;
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
  /** Потолок остановок одной категории в плане; нет записи — DEFAULT_CATEGORY_LIMIT. */
  categoryLimits?: Record<string, number>;
}

/** Остановка-якорь. */
export interface WalkStop {
  place: WalkPlace;
  /** Минут, проведённых на месте (таблица stay, docs/walk-engine.md §6). */
  stayMinutes: number;
  /** Причина зайти — по-русски, из фактов выбора (§9). */
  reason: string;
  /** Английский твин причины — для en-локали карточки. */
  reasonEn?: string;
}

/** Нога маршрута по реальным улицам — метрики от роутинга, не догадки. */
export interface WalkLeg {
  from: WalkLatLng;
  to: WalkLatLng;
  distanceMeters: number;
  durationMinutes: number;
  /** Полилиния [lat,lng]; пустой массив, если источник не дал геометрию. */
  geometry: WalkLatLng[];
  /** Нога идёт по альтернативному (непересекающемуся) маршруту, а не основному
   *  — выбор движка среди вариантов порта (docs/walk-loop-quality.md R3.c).
   *  Не гейт-отчёт: факт маршрута, гейты считаются по геометрии как обычно. */
  routeVariant?: 'alt';
}

export type WalkGateName =
  | 'budget'
  | 'anchors'
  | 'long_legs'
  | 'walk_share'
  | 'loop_no_repeat_street';

/** Отчёт по одному гейту «Метрики хорошей прогулки» (PRODUCT.md). */
export interface GateReport {
  gate: WalkGateName;
  pass: boolean;
  detail: string;
}

/** Уровень деградации плана лестницы fallback (PRODUCT: «почти всегда прогулка»).
 *  partial — петля через лучших кандидатов; loop-only — чистая уличная петля. */
export type WalkDegradedLevel = 'partial' | 'loop-only';

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
  /** Задан только у деградационных планов; строгий движок поле не ставит. */
  degraded?: { level: WalkDegradedLevel };
  /**
   * Уличная петля, притянутая к характерным секторам (S3): ≥2 вейпоинта снапа
   * к attraction-точкам. Заменяет метку loop-only (закрытый union
   * WalkDegradedLevel не расширяется) — заметка для карточки в uiAdapter.
   */
  streetInterest?: true;
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
/** Продуктовый потолок остановок: максимум для длинных бюджетов (жадный
 *  набор берёт 4/6/8 по бюджету — см. createWalkPlan.maxStopsForBudget). */
export const MAX_STOPS = 8;
/** Две остановки одной категории — предел разнообразия без архетипных overrides. */
export const DEFAULT_CATEGORY_LIMIT = 2;
/** Нет сегмента длиннее ~25 минут без остановки. */
export const MAX_LEG_MINUTES = 25;
/** Ноги с матричной оценкой длиннее этого порога запрашивают у порта
 *  непересекающиеся альтернативы (R3): коротким LegsPlz не нужен — их
 *  перекрытие не ловит ни один гейт, а квота роутера платится запросом. */
export const LEG_ALT_MIN_MINUTES = 8;
/** Бюджет ±10%. */
export const BUDGET_TOLERANCE = 0.1;
/**
 * Пол коридора бюджета (docs/walk-loop-quality.md R1): бюджет — коридор
 * 0.9–1.1·B, а не только потолок. План короче пола — недобор: строгий движок
 * добирает остановками и via-удлинением ног; лестница деградации (L2/L3)
 * добором не трогается — «что есть, то есть».
 */
export const FLOOR_SHARE = 0.9;
/**
 * Запас под расхождение матрицы и реальных ног при оценке добора (R1.b):
 * кандидат влезает, если матричная оценка ≤ 1.1·B − 0.05·B. Матрица и
 * роутинг расходятся на кривизне улиц — без запаса добор ловил бы гейт
 * budget на реальных метриках.
 */
export const SAFETY_MARGIN_SHARE = 0.05;
/** Петля: ходьба — не меньше этой доли бюджета (прогулка, не экскурсия с
 *  сидением). План с меньшей ходьбой теряет allGatesPass, но не отказ. */
export const MIN_WALK_SHARE = 0.35;

/**
 * Число азимутных секторов розы ветров (docs/street-interest-wave.md S2/S4):
 * единый источник для диверсификации шорт-листа (quickPipeline.diversifyByAzimuth,
 * R2), интерес-модели улиц (S2) и снапа вейпоинтов петли (S3). Сектор i —
 * диапазон азимутов [i·45°, (i+1)·45°) от севера по часовой; разъехались бы
 * на 90° — снап притянул бы вейпоинт в чужой сектор молча.
 */
export const SECTOR_COUNT = 8;

/** Классы фич улиц — структурный двойник StreetFeatureKind (lib/geo/types). */
export type WalkStreetFeatureKind = 'green' | 'water' | 'pedestrian' | 'viewpoint' | 'art';

/**
 * База веса фичи по классу (docs/street-interest-wave.md S2) — единый источник
 * для scoreSectors (вклад в интерес сектора) и тайбрейкера альтернатив ног
 * (топ-K фич по весу, S5/C11). Двойники в vibes/geo запрещены: числа меняются
 * вместе с доком, в одном месте.
 */
export const STREET_FEATURE_KIND_WEIGHTS: Record<WalkStreetFeatureKind, number> = {
  water: 1.2,
  green: 1.0,
  pedestrian: 0.9,
  viewpoint: 1.5,
  art: 0.7,
};

// --- Улицы с характером: структурные двойники (S6; types.ts не импортирует lib/geo) ---

/** Фича улиц — двойник StreetFeature (lib/geo/types): конверсия на границе в quickPipeline. */
export interface WalkStreetFeature {
  kind: WalkStreetFeatureKind;
  /** [lat,lng]: одна точка — точечная фича, 2+ — линия/контур (≤64 точек). */
  geometry: WalkLatLng[];
  /** Имя из OSM, если есть — сырьё для microNotes (S4). */
  name?: string;
}

/** Подсказка интереса одного сектора розы — двойник StreetSectorHint (vibes). */
export interface WalkSectorHint {
  /** Середина сектора в градусах (22.5, 67.5, …) — информационное поле. */
  azimuthDeg: number;
  /** 0..1 — вклад сектора, нормированный на максимум по розе (S2). */
  interest: number;
  /** Ближайшая к старту точка контура лучшей фичи сектора; фич нет — null. */
  point: WalkLatLng | null;
}

/** Интерес-подсказки розы — двойник StreetHints (vibes/streetInterest). */
export interface WalkStreetHints {
  /** Длина SECTOR_COUNT, индекс = сектор розы (не азимут точки). */
  sectors: WalkSectorHint[];
  hasData: boolean;
}
