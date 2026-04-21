// scripts/migrate-add-stay-duration.ts
/**
 * Миграция: добавление totalStayDuration в существующие маршруты
 *
 * Запуск: npx tsx scripts/migrate-add-stay-duration.ts
 */

import { getDb } from '../src/lib/db/mongodb';
import { decodeRouteFromUrl } from '../src/utils/routeCodec';

async function migrate() {
  console.log('🚀 Начало миграции: добавление totalStayDuration');

  const db = await getDb();
  const routesCollection = db.collection('routes');

  // Получаем все маршруты без totalStayDuration
  const routes = await routesCollection.find({
    'metrics.totalStayDuration': { $exists: false }
  }).toArray();

  console.log(`📊 Найдено маршрутов для обновления: ${routes.length}`);

  let updated = 0;
  let errors = 0;

  for (const route of routes) {
    try {
      // Декодируем маршрут
      const decoded = decodeRouteFromUrl(route.encodedRoute);
      if (!decoded) {
        console.warn(`⚠️  Не удалось декодировать маршрут ${route._id}`);
        errors++;
        continue;
      }

      // Вычисляем totalStayDuration
      let totalStayDuration = 0;
      decoded.waypoints.forEach((wp: any) => {
        const stayDuration = wp.stayDuration || 0;
        totalStayDuration += stayDuration;
      });

      // Обновляем документ
      await routesCollection.updateOne(
        { _id: route._id },
        {
          $set: {
            'metrics.totalStayDuration': Math.round(totalStayDuration),
            updatedAt: new Date()
          }
        }
      );

      updated++;
      if (updated % 10 === 0) {
        console.log(`✅ Обновлено: ${updated}/${routes.length}`);
      }
    } catch (error) {
      console.error(`❌ Ошибка при обновлении маршрута ${route._id}:`, error);
      errors++;
    }
  }

  console.log('\n📈 Результаты миграции:');
  console.log(`   ✅ Успешно обновлено: ${updated}`);
  console.log(`   ❌ Ошибок: ${errors}`);
  console.log(`   📊 Всего обработано: ${routes.length}`);

  process.exit(0);
}

migrate().catch((error) => {
  console.error('💥 Критическая ошибка миграции:', error);
  process.exit(1);
});
