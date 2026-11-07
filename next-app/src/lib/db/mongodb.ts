// src/lib/db/mongodb.ts
// Клиент создаётся лениво при первом обращении, а не на этапе импорта модуля:
// иначе `next build` (сборка страниц без БД) падает без MONGODB_URI.
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
    throw new Error('MONGODB_URI не найден в .env.local');
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

if (process.env.NODE_ENV === 'development') {
  // В dev режиме используем глобальную переменную для hot reload
  const globalWithMongo = global as typeof globalThis & {
    _mongoClientPromise?: Promise<MongoClient>;
  };

  if (!globalWithMongo._mongoClientPromise) {
    globalWithMongo._mongoClientPromise = connect().catch(() => {
      // Очищаем промис при ошибке, чтобы можно было переподключиться
      globalWithMongo._mongoClientPromise = undefined;
      throw new Error('MongoDB connection failed');
    });
  }
}

let clientPromise: Promise<MongoClient> | null = null;

function getClientPromise(): Promise<MongoClient> {
  if (process.env.NODE_ENV === 'development') {
    return (global as typeof globalThis & { _mongoClientPromise?: Promise<MongoClient> })
      ._mongoClientPromise!;
  }
  if (!clientPromise) {
    clientPromise = connect();
  }
  return clientPromise;
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
