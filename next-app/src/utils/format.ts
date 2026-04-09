// src/utils/format.ts

/**
 * Форматирует расстояние: до 1000м — в метрах, свыше — в километрах с округлением до 1 знака.
 */
export function formatDistance(meters: number, locale = 'ru'): string {
  if (meters < 1000) {
    return `${Math.round(meters)} м`;
  }
  const km = meters / 1000;
  return `${km.toLocaleString(locale, { maximumFractionDigits: 1 })} км`;
}

/**
 * Форматирует время: если больше 60 мин — добавляет часы.
 */
export function formatDuration(seconds: number, locale = 'ru'): string {
  const totalMinutes = Math.round(seconds / 60);
  
  if (totalMinutes < 60) {
    return `${totalMinutes} мин`;
  }
  
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  
  if (minutes === 0) {
    return `${hours} ч`;
  }
  
  return `${hours} ч ${minutes} мин`;
}