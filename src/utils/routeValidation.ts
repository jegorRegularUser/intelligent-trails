import { Coordinates } from "@/types/map";
import { getDistanceInMeters } from "./geo";

/**
 * Пороговые значения для валидации маршрутов
 */
export const ROUTE_DISTANCE_LIMITS = {
  // Максимальное разумное расстояние для городской прогулки (50 км)
  MAX_REASONABLE_DISTANCE: 50000, // метры

  // Рекомендуемое максимальное расстояние (30 км)
  RECOMMENDED_MAX_DISTANCE: 30000, // метры

  // Типичное расстояние городской прогулки (до 15 км)
  TYPICAL_CITY_WALK: 15000, // метры
} as const;

/**
 * Проверяет, является ли расстояние между точками слишком большим для городской прогулки
 *
 * @param start - Начальная точка
 * @param end - Конечная точка (может быть null)
 * @returns true если расстояние превышает разумные пределы
 */
export function isDistanceTooLarge(
  start: Coordinates,
  end: Coordinates | null
): boolean {
  if (!end) return false;

  const distance = getDistanceInMeters(start, end);
  return distance > ROUTE_DISTANCE_LIMITS.MAX_REASONABLE_DISTANCE;
}

/**
 * Вычисляет прямое расстояние между начальной и конечной точкой
 *
 * @param start - Начальная точка
 * @param end - Конечная точка (может быть null)
 * @returns Расстояние в метрах или 0 если конечная точка не указана
 */
export function calculateDirectDistance(
  start: Coordinates,
  end: Coordinates | null
): number {
  if (!end) return 0;
  return getDistanceInMeters(start, end);
}

/**
 * Определяет, нужно ли показывать предупреждение о большом расстоянии
 * Показываем предупреждение если:
 * - Расстояние больше 50 км (межгород)
 *
 * @param distance - Расстояние в метрах
 * @returns true если нужно показать предупреждение
 */
export function shouldShowDistanceWarning(distance: number): boolean {
  return distance > ROUTE_DISTANCE_LIMITS.MAX_REASONABLE_DISTANCE;
}

/**
 * Форматирует расстояние для отображения пользователю
 *
 * @param distance - Расстояние в метрах
 * @returns Отформатированная строка (например, "5 км" или "500 м")
 */
export function formatDistance(distance: number): string {
  if (distance >= 1000) {
    return `${Math.round(distance / 1000)} км`;
  }
  return `${Math.round(distance)} м`;
}
