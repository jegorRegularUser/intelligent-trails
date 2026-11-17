// src/lib/walk/shared/geometry.ts
// Клиент-безопасные геометрические формулы быстрой прогулки (docs/ux-human-wave.md M1):
// building-фаза рисует на карте окружность зоны поиска, и клиент обязан считать
// её РАДИУСОМ той же арифметикой, что и серверный пайплайн — иначе пунктир
// обещает зону, в которой движок не искал.
//
// Модуль намеренно не тянет ни серверные импорты (internal/geo тянет только типы,
// но лежит в серверном дереве), ни карту: чистые функции, node-тесты без WebGL.
// Формула продублирована литералом с комментарием-источником — правка чисел
// обязана меняться в ОБОИХ местах (см. parity-тест shared/geometry.test.ts).

import { DEFAULT_WALKING_SPEED_KMH } from '../types';

/**
 * Доля бюджета времени под радиус поиска POI — сервер quickPipeline.searchRadiusMeters
 * (docs/walk-loop-quality.md R6: «остальное — ходьба туда-обратно и стоянки»).
 */
const SEARCH_RADIUS_WALK_SHARE = 0.4;

/**
 * Радиус зоны поиска в метрах из бюджета времени — клиентский твин
 * quickPipeline.searchRadiusMeters: скорость из движка (DEFAULT_WALKING_SPEED_KMH),
 * делитель 1 и доля 0.4 — та же арифметика zoneMetersForBudget
 * (docs/walk-loop-quality.md R6, docs/ux-human-wave.md M1 building-фаза).
 */
export function searchRadiusMetersForBudget(budgetMinutes: number): number {
  const mPerMin = (DEFAULT_WALKING_SPEED_KMH * 1000) / 60;
  return Math.round((mPerMin * SEARCH_RADIUS_WALK_SHARE * budgetMinutes) / 1);
}
