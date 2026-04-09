import { describe, it, expect, afterEach } from 'vitest';
import { fetchPlacesByCategory, CATEGORY_CONFIG } from './osm';
import { Coordinates } from '@/types/map';
import { sleep } from '@/utils/async';

const TEST_CENTER: Coordinates = [55.831006, 37.629851]; 

describe('OSM Service: Комплексное тестирование алгоритма поиска', () => {

  // НОВОЕ: Хук, который срабатывает после каждого теста (успешного или упавшего).
  // Даем серверу Overpass "выдохнуть" 3 секунды перед следующим запросом.
  afterEach(async () => {
    await sleep(3000);
  });

  const allCategories = Object.keys(CATEGORY_CONFIG);

  describe.each(allCategories)('Тестирование категории: %s', (category) => {
    // НОВОЕ: Третьим аргументом в it() передаем таймаут 60000 мс (60 сек).
    it(`должен находить ${category} по оптимальным параметрам`, async () => {
      const places = await fetchPlacesByCategory(TEST_CENTER, category);
      
      console.log(`✅ ${category.toUpperCase()}: найдено ${places.length} мест (радиус ${CATEGORY_CONFIG[category].defaultRadius}м)`);

      expect(Array.isArray(places)).toBe(true);
      expect(places.length).toBeGreaterThan(0);

      const firstPlace = places[0];
      expect(firstPlace.category).toBe(category);
      expect(firstPlace.coordinates).toHaveLength(2);
      expect(typeof firstPlace.name).toBe('string');
    }, 60000); // <-- Таймаут здесь
  });

  describe('Тестирование алиасов и ввода', () => {
    it('должен корректно понимать слово "кафе" (на русском)', async () => {
      const places = await fetchPlacesByCategory(TEST_CENTER, 'кафе');
      expect(places.length).toBeGreaterThan(0);
      expect(places[0].category).toBe('cafe'); 
    }, 60000);

    it('должен корректно обрабатывать пробелы и регистр: "  РесТоран  "', async () => {
      const places = await fetchPlacesByCategory(TEST_CENTER, '  РесТоран  ');
      expect(places.length).toBeGreaterThan(0);
      expect(places[0].category).toBe('restaurant');
    }, 60000);

    it('должен выбрасывать понятную ошибку для неизвестной категории', async () => {
      await expect(fetchPlacesByCategory(TEST_CENTER, 'звезда_смерти'))
        .rejects
        .toThrow(/не поддерживается/);
    });
  });

});