// scripts/check-mongodb-atlas.ts
// Проверка настроек MongoDB Atlas

console.log('🔍 Проверка настроек MongoDB Atlas\n');
console.log('Пожалуйста, проверьте следующее в MongoDB Atlas:\n');

console.log('1️⃣ Network Access (IP Whitelist)');
console.log('   → https://cloud.mongodb.com/v2#/security/network/accessList');
console.log('   ✅ Должен быть: 0.0.0.0/0 (Allow access from anywhere)');
console.log('   ✅ Или ваш текущий IP адрес');
console.log('   ⚠️  Изменения применяются 1-2 минуты!\n');

console.log('2️⃣ Database Access (Пользователь)');
console.log('   → https://cloud.mongodb.com/v2#/security/database/users');
console.log('   ✅ Username: dvoinyakovegor00_db_user');
console.log('   ✅ Password: 1221');
console.log('   ✅ Privileges: "Atlas admin" или "Read and write to any database"\n');

console.log('3️⃣ Cluster Status');
console.log('   → https://cloud.mongodb.com/v2#/clusters');
console.log('   ✅ Статус кластера должен быть: "Active" (зеленый)\n');

console.log('4️⃣ Connection String');
console.log('   → Нажмите "Connect" на кластере');
console.log('   → "Connect your application"');
console.log('   → Скопируйте connection string\n');

console.log('📋 Текущий MONGODB_URI из .env.local:');
const uri = process.env.MONGODB_URI || 'НЕ НАЙДЕН';
console.log(uri.replace(/:[^:@]+@/, ':****@'));
console.log('');

console.log('❓ Возможные проблемы:\n');
console.log('A) IP адрес не в whitelist');
console.log('   → Добавьте 0.0.0.0/0 в Network Access');
console.log('   → Подождите 1-2 минуты\n');

console.log('B) Неверный пароль');
console.log('   → Проверьте Database Access');
console.log('   → Если пароль содержит спецсимволы, нужно URL-encode\n');

console.log('C) Кластер приостановлен (Paused)');
console.log('   → Проверьте статус кластера');
console.log('   → Нажмите "Resume" если приостановлен\n');

console.log('D) Firewall блокирует порт 27017');
console.log('   → Проверьте Windows Firewall');
console.log('   → Проверьте антивирус\n');

console.log('E) Проблема с SRV записями DNS');
console.log('   → Попробуйте стандартный connection string вместо SRV\n');

console.log('💡 Следующий шаг:');
console.log('1. Проверьте все пункты выше в MongoDB Atlas');
console.log('2. Если всё правильно - попробуйте стандартный connection string');
console.log('3. Или используйте локальную MongoDB для разработки\n');
