// src/utils/format.ts

export type DistanceUnit = 'km' | 'mi';

/**
 * Форматирует расстояние: до 1000м — в метрах, свыше — в километрах с округлением до 1 знака.
 * Поддерживает конвертацию в мили.
 */
export function formatDistance(meters: number, locale = 'ru', unit: DistanceUnit = 'km'): string {
  const isRussian = locale === 'ru';

  if (unit === 'mi') {
    // Конвертация в мили (1 миля = 1609.34 метра)
    const miles = meters / 1609.34;
    if (miles < 0.1) {
      // Показываем в футах для коротких расстояний (1 фут = 0.3048 метра)
      const feet = Math.round(meters / 0.3048);
      return `${feet} ${isRussian ? 'фт' : 'ft'}`;
    }
    return `${miles.toLocaleString(locale, { maximumFractionDigits: 1 })} ${isRussian ? 'ми' : 'mi'}`;
  }

  // Километры (по умолчанию)
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