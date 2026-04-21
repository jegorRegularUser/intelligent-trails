// src/actions/profile.ts

'use server';

import { auth } from '@/lib/auth/config';
import { getDb } from '@/lib/db/mongodb';
import { ObjectId } from 'mongodb';
import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';

// Обновить имя пользователя
export async function updateNameAction(name: string) {
  console.log('[updateNameAction] Starting, name:', name);

  const session = await auth();
  console.log('[updateNameAction] Session:', session?.user?.id);

  if (!session?.user?.id) {
    console.error('[updateNameAction] Unauthorized - no session');
    throw new Error('Unauthorized');
  }

  if (!name || name.trim().length === 0) {
    console.error('[updateNameAction] Name is empty');
    throw new Error('Name is required');
  }

  try {
    const db = await getDb();
    const usersCollection = db.collection('users');

    console.log('[updateNameAction] Updating user:', session.user.id, 'with name:', name.trim());

    const result = await usersCollection.updateOne(
      { _id: new ObjectId(session.user.id) },
      { $set: { name: name.trim() } }
    );

    console.log('[updateNameAction] Update result:', {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
    });

    if (result.modifiedCount > 0) {
      revalidatePath('/[locale]/profile', 'page');
      console.log('[updateNameAction] Success - revalidated path');
      return { success: true };
    }

    console.log('[updateNameAction] No documents modified');
    return { success: false };
  } catch (error: any) {
    console.error('[updateNameAction] Error:', error);
    throw error;
  }
}

// Обновить пароль (только для local provider)
export async function updatePasswordAction(currentPassword: string, newPassword: string) {
  console.log('[updatePasswordAction] Starting');

  const session = await auth();
  if (!session?.user?.id || !session?.user?.email) {
    console.error('[updatePasswordAction] Unauthorized');
    throw new Error('Unauthorized');
  }

  const db = await getDb();
  const usersCollection = db.collection('users');

  // Получаем пользователя
  const user = await usersCollection.findOne({ _id: new ObjectId(session.user.id) });

  if (!user || !user.password) {
    console.error('[updatePasswordAction] User has no password field');
    throw new Error('Password change not available for OAuth users');
  }

  // Проверяем текущий пароль
  const isValid = await bcrypt.compare(currentPassword, user.password);
  if (!isValid) {
    console.error('[updatePasswordAction] Current password is incorrect');
    throw new Error('Current password is incorrect');
  }

  // Валидация нового пароля
  if (!newPassword || newPassword.length < 6) {
    console.error('[updatePasswordAction] New password too short');
    throw new Error('New password must be at least 6 characters');
  }

  // Хешируем новый пароль
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  const result = await usersCollection.updateOne(
    { _id: new ObjectId(session.user.id) },
    { $set: { password: hashedPassword } }
  );

  console.log('[updatePasswordAction] Success, modified:', result.modifiedCount);
  return { success: result.modifiedCount > 0 };
}

// Обновить единицы измерения
export async function updateDistanceUnitAction(unit: 'km' | 'mi') {
  console.log('[updateDistanceUnitAction] Starting, unit:', unit);

  const session = await auth();
  if (!session?.user?.id) {
    console.error('[updateDistanceUnitAction] Unauthorized');
    throw new Error('Unauthorized');
  }

  try {
    const db = await getDb();
    const usersCollection = db.collection('users');

    const result = await usersCollection.updateOne(
      { _id: new ObjectId(session.user.id) },
      { $set: { 'preferences.distanceUnit': unit } }
    );

    console.log('[updateDistanceUnitAction] Update result:', result.modifiedCount);

    if (result.modifiedCount > 0) {
      revalidatePath('/[locale]/profile', 'page');
      console.log('[updateDistanceUnitAction] Success');
      return { success: true };
    }

    return { success: false };
  } catch (error: any) {
    console.error('[updateDistanceUnitAction] Error:', error);
    throw error;
  }
}

// Обновить настройки языка карты
export async function updateMapLocaleAction(useCustom: boolean, mapLocale?: 'ru' | 'en') {
  console.log('[updateMapLocaleAction] Starting, useCustom:', useCustom, 'mapLocale:', mapLocale);

  const session = await auth();
  if (!session?.user?.id) {
    console.error('[updateMapLocaleAction] Unauthorized');
    throw new Error('Unauthorized');
  }

  try {
    const db = await getDb();
    const usersCollection = db.collection('users');

    const updateData: any = {
      'preferences.useCustomMapLocale': useCustom,
    };

    if (useCustom && mapLocale) {
      updateData['preferences.mapLocale'] = mapLocale;
    }

    const result = await usersCollection.updateOne(
      { _id: new ObjectId(session.user.id) },
      { $set: updateData }
    );

    console.log('[updateMapLocaleAction] Update result:', result.modifiedCount);

    if (result.modifiedCount > 0) {
      revalidatePath('/[locale]/profile', 'page');
      console.log('[updateMapLocaleAction] Success');
      return { success: true };
    }

    return { success: false };
  } catch (error: any) {
    console.error('[updateMapLocaleAction] Error:', error);
    throw error;
  }
}
