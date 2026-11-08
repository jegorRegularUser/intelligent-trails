// src/lib/db/init.ts

import { routesRepo } from './repositories/routes';

/**
 * Инициализация индексов MongoDB
 * Вызывать один раз при деплое или локально при первом запуске
 */
export async function initializeDatabase() {
  try {
    console.log('Создание индексов MongoDB...');
    await routesRepo.createIndexes();
    console.log('✓ Индексы созданы успешно');
  } catch (error) {
    console.error('Ошибка при создании индексов:', error);
    throw error;
  }
}
