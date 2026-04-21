// src/__tests__/actions/profile.test.ts

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { MongoClient, Db, ObjectId } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import bcrypt from 'bcryptjs';

// Мокаем auth
vi.mock('@/lib/auth/config', () => ({
  auth: vi.fn(),
}));

// Мокаем getDb
vi.mock('@/lib/db/mongodb', () => ({
  getDb: vi.fn(),
}));

// Мокаем revalidatePath
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { auth } from '@/lib/auth/config';
import { getDb } from '@/lib/db/mongodb';
import { updateNameAction, updatePasswordAction } from '@/actions/profile';

let mongoServer: MongoMemoryServer;
let client: MongoClient;
let db: Db;
let testUserId: ObjectId;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();

  client = new MongoClient(uri);
  await client.connect();
  db = client.db('test-db');

  // Мокаем getDb чтобы возвращал наш тестовый db
  vi.mocked(getDb).mockResolvedValue(db);
}, 60000);

afterAll(async () => {
  await client.close();
  await mongoServer.stop();
});

beforeEach(async () => {
  // Очищаем коллекции
  await db.collection('users').deleteMany({});

  // Создаем тестового пользователя
  const hashedPassword = await bcrypt.hash('oldpassword123', 10);
  const result = await db.collection('users').insertOne({
    email: 'test@example.com',
    password: hashedPassword,
    name: 'Test User',
    createdAt: new Date(),
  });
  testUserId = result.insertedId;
});

describe('updateNameAction', () => {
  it('should update user name successfully', async () => {
    // Мокаем auth для возврата сессии
    vi.mocked(auth).mockResolvedValue({
      user: { id: testUserId.toString(), email: 'test@example.com' },
    } as any);

    const result = await updateNameAction('New Name');

    expect(result.success).toBe(true);

    // Проверяем что имя обновилось в БД
    const user = await db.collection('users').findOne({ _id: testUserId });
    expect(user?.name).toBe('New Name');
  });

  it('should throw error if not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null);

    await expect(updateNameAction('New Name')).rejects.toThrow('Unauthorized');
  });

  it('should throw error if name is empty', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: testUserId.toString(), email: 'test@example.com' },
    } as any);

    await expect(updateNameAction('')).rejects.toThrow('Name is required');
    await expect(updateNameAction('   ')).rejects.toThrow('Name is required');
  });

  it('should trim whitespace from name', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: testUserId.toString(), email: 'test@example.com' },
    } as any);

    await updateNameAction('  Trimmed Name  ');

    const user = await db.collection('users').findOne({ _id: testUserId });
    expect(user?.name).toBe('Trimmed Name');
  });

  it('should return success false if user not found', async () => {
    const fakeUserId = new ObjectId();
    vi.mocked(auth).mockResolvedValue({
      user: { id: fakeUserId.toString(), email: 'fake@example.com' },
    } as any);

    const result = await updateNameAction('New Name');

    expect(result.success).toBe(false);
  });
});

describe('updatePasswordAction', () => {
  it('should update password successfully', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: testUserId.toString(), email: 'test@example.com' },
    } as any);

    const result = await updatePasswordAction('oldpassword123', 'newpassword456');

    expect(result.success).toBe(true);

    // Проверяем что пароль обновился
    const user = await db.collection('users').findOne({ _id: testUserId });
    const isValid = await bcrypt.compare('newpassword456', user?.password as string);
    expect(isValid).toBe(true);
  });

  it('should throw error if not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null);

    await expect(
      updatePasswordAction('oldpass', 'newpass')
    ).rejects.toThrow('Unauthorized');
  });

  it('should throw error if current password is incorrect', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: testUserId.toString(), email: 'test@example.com' },
    } as any);

    await expect(
      updatePasswordAction('wrongpassword', 'newpassword456')
    ).rejects.toThrow('Current password is incorrect');
  });

  it('should throw error if new password is too short', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: testUserId.toString(), email: 'test@example.com' },
    } as any);

    await expect(
      updatePasswordAction('oldpassword123', '12345')
    ).rejects.toThrow('New password must be at least 6 characters');
  });

  it('should throw error for OAuth users (no password field)', async () => {
    // Создаем OAuth пользователя без пароля
    const oauthResult = await db.collection('users').insertOne({
      email: 'oauth@example.com',
      name: 'OAuth User',
      image: 'https://example.com/avatar.jpg',
      createdAt: new Date(),
    });

    vi.mocked(auth).mockResolvedValue({
      user: { id: oauthResult.insertedId.toString(), email: 'oauth@example.com' },
    } as any);

    await expect(
      updatePasswordAction('anypass', 'newpass')
    ).rejects.toThrow('Password change not available for OAuth users');
  });

  it('should hash new password with bcrypt', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: testUserId.toString(), email: 'test@example.com' },
    } as any);

    await updatePasswordAction('oldpassword123', 'newpassword456');

    const user = await db.collection('users').findOne({ _id: testUserId });

    // Проверяем что пароль захеширован (не равен plain text)
    expect(user?.password).not.toBe('newpassword456');

    // Проверяем что это валидный bcrypt хеш
    expect(user?.password).toMatch(/^\$2[aby]\$\d{2}\$/);
  });
});
