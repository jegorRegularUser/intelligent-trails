// scripts/test-mongodb.ts
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI || "mongodb+srv://dvoinyakovegor00_db_user:1221@cluster0.zlvktzz.mongodb.net/intelligent-trails?retryWrites=true&w=majority&appName=Cluster0";

async function testConnection() {
  console.log('🔍 Тестирование подключения к MongoDB...\n');
  console.log('URI:', uri.replace(/:[^:@]+@/, ':****@')); // Скрываем пароль
  console.log('');

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 10000,
  });

  try {
    console.log('⏳ Подключение...');
    await client.connect();
    console.log('✅ Подключение успешно!\n');

    const db = client.db('intelligent-trails');

    console.log('📊 Проверка базы данных...');
    const collections = await db.listCollections().toArray();
    console.log('Коллекции:', collections.length > 0 ? collections.map(c => c.name).join(', ') : 'нет коллекций');
    console.log('');

    console.log('✍️ Тестовая запись...');
    const testCollection = db.collection('test');
    await testCollection.insertOne({ test: true, timestamp: new Date() });
    console.log('✅ Запись успешна!');

    const count = await testCollection.countDocuments();
    console.log(`Документов в test: ${count}`);

    await testCollection.deleteMany({ test: true });
    console.log('🗑️ Тестовые данные удалены\n');

    console.log('✅ Все проверки пройдены!');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Ошибка подключения:\n');
    console.error('Тип ошибки:', error.name);
    console.error('Сообщение:', error.message);
    console.error('Код:', error.code);
    console.error('\n📋 Что проверить:');

    if (error.message.includes('ENODATA') || error.message.includes('querySrv')) {
      console.error('1. ❌ DNS не может разрешить адрес MongoDB');
      console.error('   → Проверьте интернет-соединение');
      console.error('   → Попробуйте ping cluster0.zlvktzz.mongodb.net');
      console.error('   → Проверьте DNS настройки (попробуйте 8.8.8.8)');
    }

    if (error.message.includes('authentication failed')) {
      console.error('2. ❌ Неверный логин или пароль');
      console.error('   → Проверьте Database Access в MongoDB Atlas');
      console.error('   → Убедитесь, что пароль правильный (без спецсимволов)');
    }

    if (error.message.includes('not authorized') || error.message.includes('IP')) {
      console.error('3. ❌ IP адрес не в whitelist');
      console.error('   → Откройте Network Access в MongoDB Atlas');
      console.error('   → Добавьте 0.0.0.0/0 или ваш текущий IP');
    }

    console.error('\n');
    process.exit(1);
  } finally {
    await client.close();
  }
}

testConnection();
