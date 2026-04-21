// src/lib/db/repositories/users.ts

import { getDb } from '../mongodb';
import { ObjectId } from 'mongodb';
import bcrypt from 'bcryptjs';

export interface UserCredentials {
  _id?: string;
  email: string;
  password: string; // Хешированный пароль
  name?: string;
  emailVerified?: Date;
  createdAt: Date;
}

export class UsersRepository {
  private async getCollection() {
    const db = await getDb();
    return db.collection<UserCredentials>('users');
  }

  // Создание индексов
  async createIndexes() {
    const collection = await this.getCollection();
    await collection.createIndexes([
      { key: { email: 1 }, unique: true },
    ]);
  }

  // Создать пользователя с паролем
  async createUser(email: string, password: string, name?: string) {
    const collection = await this.getCollection();

    // Проверяем, существует ли пользователь
    const existing = await collection.findOne({ email });
    if (existing) {
      throw new Error('User already exists');
    }

    // Хешируем пароль
    const hashedPassword = await bcrypt.hash(password, 10);

    const user: Omit<UserCredentials, '_id'> = {
      email,
      password: hashedPassword,
      name,
      createdAt: new Date(),
    };

    const result = await collection.insertOne(user as any);
    return result.insertedId.toString();
  }

  // Найти пользователя по email
  async findByEmail(email: string) {
    const collection = await this.getCollection();
    return await collection.findOne({ email });
  }

  // Проверить пароль
  async verifyPassword(email: string, password: string) {
    const user = await this.findByEmail(email);
    if (!user || !user.password) {
      return null;
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return null;
    }

    return {
      id: user._id!.toString(),
      email: user.email,
      name: user.name,
    };
  }

  // Обновить пользователя
  async updateUser(userId: string, updates: Partial<UserCredentials>) {
    const collection = await this.getCollection();

    const result = await collection.updateOne(
      { _id: new ObjectId(userId) as any },
      { $set: updates }
    );

    return result.modifiedCount > 0;
  }
}

export const usersRepo = new UsersRepository();
