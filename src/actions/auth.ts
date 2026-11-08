// src/actions/auth.ts

'use server';

import { usersRepo } from '@/lib/db/repositories/users';
import { AuthErrorCode } from '@/types/auth';

export async function registerUserAction(data: {
  email: string;
  password: string;
  name?: string;
}): Promise<
  | { success: true; userId: string }
  | { success: false; errorCode: AuthErrorCode }
> {
  try {
    if (!data.email?.trim()) {
      return { success: false, errorCode: 'EMAIL_REQUIRED' };
    }

    if (!data.password) {
      return { success: false, errorCode: 'PASSWORD_REQUIRED' };
    }

    if (data.password.length < 6) {
      return { success: false, errorCode: 'PASSWORD_TOO_SHORT' };
    }

    const userId = await usersRepo.createUser(data.email, data.password, data.name);

    return { success: true, userId };
  } catch (error: any) {
    if (error.message === 'User already exists') {
      return { success: false, errorCode: 'EMAIL_EXISTS' };
    }
    return { success: false, errorCode: 'REGISTRATION_FAILED' };
  }
}