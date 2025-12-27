/**
 * Форматирование времени в читаемый вид
 * @param minutes количество минут
 * @returns строка вида "1 ч 30 мин" или "45 мин"
 */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = Math.round(minutes % 60)

  if (hours > 0) {
    return mins > 0 ? `${hours} ч ${mins} мин` : `${hours} ч`
  }
  return `${mins} мин`
}

/**
 * Форматирование расстояния
 * @param meters расстояние в метрах
 * @returns строка вида "1.5 км" или "850 м"
 */
export function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} км`
  }
  return `${Math.round(meters)} м`
}
