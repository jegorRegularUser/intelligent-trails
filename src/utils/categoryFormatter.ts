import { CategoryId, PLACE_CATEGORIES } from "@/constants/categories";

/**
 * Форматирует ID категории в читаемое название с заглавной буквы
 * Используется как fallback, если переводы недоступны
 */
export function formatCategoryName(categoryId: string): string {
  // Проверяем, что это валидная категория
  if (categoryId in PLACE_CATEGORIES) {
    // Возвращаем ID с заглавной буквы как fallback
    return categoryId.charAt(0).toUpperCase() + categoryId.slice(1);
  }

  // Если это не ID категории, возвращаем как есть с заглавной
  return categoryId.charAt(0).toUpperCase() + categoryId.slice(1);
}

/**
 * Извлекает ID категории из текста ошибки
 * Примеры:
 * - "Не найдено мест категории "cafe" поблизости" → "cafe"
 * - "Не найдено мест категории "restaurant" для финиша" → "restaurant"
 */
export function extractCategoryFromError(errorMessage?: string): string | undefined {
  if (!errorMessage) return undefined;
  const match = errorMessage.match(/категории "([^"]+)"/);
  return match ? match[1] : undefined;
}
