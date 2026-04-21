// src/lib/db/mongodb.ts

import { MongoClient, Db } from 'mongodb';

if (!process.env.MONGODB_URI) {
  throw new Error('MONGODB_URI не найден в .env.local');
}

const uri = process.env.MONGODB_URI;
const options = {
  maxPoolSize: 10,
  minPoolSize: 2,
  serverSelectionTimeoutMS: 30000, // 30 секунд таймаут
  socketTimeoutMS: 45000,
  connectTimeoutMS: 30000,
  retryWrites: true,
  retryReads: true,
};

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === 'development') {
  // В dev режиме используем глобальную переменную для hot reload
  let globalWithMongo = global as typeof globalThis & {
    _mongoClientPromise?: Promise<MongoClient>;
    _mongoClient?: MongoClient;
  };

  if (!globalWithMongo._mongoClientPromise) {
    client = new MongoClient(uri, options);
    globalWithMongo._mongoClient = client;
    globalWithMongo._mongoClientPromise = client.connect()
      .then((client) => {
        console.log('MongoDB connected successfully');
        return client;
      })
      .catch((error) => {
        console.error('MongoDB connection error:', error.message);
        // Очищаем промис при ошибке, чтобы можно было переподключиться
        globalWithMongo._mongoClientPromise = undefined;
        throw error;
      });
  }
  clientPromise = globalWithMongo._mongoClientPromise;
} else {
  // В production создаем новый клиент
  client = new MongoClient(uri, options);
  clientPromise = client.connect()
    .then((client) => {
      console.log('MongoDB connected successfully');
      return client;
    })
    .catch((error) => {
      console.error('MongoDB connection error:', error.message);
      throw error;
    });
}

export async function getDb(): Promise<Db> {
  try {
    const client = await clientPromise;
    return client.db('intelligent-trails'); // Имя БД
  } catch (error: any) {
    console.error('Failed to get database:', error.message);
    throw new Error('Database connection failed. Please check your MONGODB_URI.');
  }
}

export default clientPromise;
