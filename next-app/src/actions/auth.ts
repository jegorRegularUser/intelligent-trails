// src/actions/auth.ts

'use server';

import { usersRepo } from '@/lib/db/repositories/users';

export async function registerUserAction(data: {
  email: string;
  password: string;
  name?: string;
}) {
  try {
    // Валидация
    if (!data.email || !data.password) {
      return { success: false, error: 'Email and password are required' };
    }

    if (data.password.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters' };
    }

    // Создаем пользователя
    const userId = await usersRepo.createUser(data.email, data.password, data.name);

    return { success: true, userId };
  } catch (error: any) {
    if (error.message === 'User already exists') {
      return { success: false, error: 'User with this email already exists' };
    }
    return { success: false, error: 'Registration failed' };
  }
}
