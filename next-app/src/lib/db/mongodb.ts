// src/lib/db/mongodb.ts
// Подключение ленивое в любом окружении: ни `next build`, ни `next dev`
// без MONGODB_URI не должны падать на импорте модуля — отсутствие БД
// обнаруживается при первом реальном обращении (getDb/адаптер NextAuth)
// и деградирует как ошибка запроса, а не как падение страницы.
import { MongoClient, Db } from 'mongodb';

const options = {
  maxPoolSize: 10,
  minPoolSize: 2,
  serverSelectionTimeoutMS: 30000, // 30 секунд таймаут
  socketTimeoutMS: 45000,
  connectTimeoutMS: 30000,
  retryWrites: true,
  retryReads: true,
};

function connect(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    // Промис-отказ, не throw: getClientPromise() могут звать на уровне модуля
    return Promise.reject(new Error('MONGODB_URI не найден в .env.local'));
  }
  const client = new MongoClient(uri, options);
  return client
    .connect()
    .then((connected) => {
      console.log('MongoDB connected successfully');
      return connected;
    })
    .catch((error) => {
      console.error('MongoDB connection error:', error.message);
      throw error;
    });
}

const globalForMongo = global as typeof globalThis & {
  _mongoClientPromise?: Promise<MongoClient>;
};

let prodClientPromise: Promise<MongoClient> | null = null;

function getClientPromise(): Promise<MongoClient> {
  if (process.env.NODE_ENV === 'development') {
    // Dev: глобальная переменная, чтобы переживать hot reload.
    // Провалившийся промис сбрасываем — следующий вызов попробует снова.
    if (!globalForMongo._mongoClientPromise) {
      globalForMongo._mongoClientPromise = connect().catch((error) => {
        globalForMongo._mongoClientPromise = undefined;
        throw error;
      });
    }
    return globalForMongo._mongoClientPromise;
  }
  if (!prodClientPromise) {
    prodClientPromise = connect();
  }
  return prodClientPromise;
}

export async function getDb(): Promise<Db> {
  try {
    const client = await getClientPromise();
    return client.db('intelligent-trails'); // Имя БД
  } catch (error: any) {
    console.error('Failed to get database:', error.message);
    throw new Error('Database connection failed. Please check your MONGODB_URI.');
  }
}

export function getClientPromiseForAuth(): Promise<MongoClient> {
  // Отложенный промис: MongoDBAdapter создаётся на уровне модуля при сборке,
  // а реальное подключение должно стартовать только при первом обращении.
  return new Promise<MongoClient>((resolve, reject) => {
    process.nextTick(() => getClientPromise().then(resolve, reject));
  });
}
