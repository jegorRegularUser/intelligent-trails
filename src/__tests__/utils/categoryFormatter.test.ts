import { describe, it, expect } from 'vitest';
import { extractCategoryFromError, formatCategoryName } from '@/utils/categoryFormatter';

describe('categoryFormatter', () => {
  describe('extractCategoryFromError', () => {
    it('should extract category from Russian error message', () => {
      const error = 'Не найдено мест категории "cafe" поблизости';
      expect(extractCategoryFromError(error)).toBe('cafe');
    });

    it('should extract category from finish error message', () => {
      const error = 'Не найдено мест категории "restaurant" для финиша';
      expect(extractCategoryFromError(error)).toBe('restaurant');
    });

    it('should return undefined for message without category', () => {
      const error = 'Произошла ошибка при построении маршрута';
      expect(extractCategoryFromError(error)).toBeUndefined();
    });

    it('should return undefined for undefined message', () => {
      expect(extractCategoryFromError(undefined)).toBeUndefined();
    });
  });

  describe('formatCategoryName', () => {
    it('should capitalize valid category IDs', () => {
      expect(formatCategoryName('cafe')).toBe('Cafe');
      expect(formatCategoryName('restaurant')).toBe('Restaurant');
      expect(formatCategoryName('bar')).toBe('Bar');
    });

    it('should capitalize unknown categories', () => {
      expect(formatCategoryName('unknown')).toBe('Unknown');
    });

    it('should handle empty string', () => {
      expect(formatCategoryName('')).toBe('');
    });
  });
});
