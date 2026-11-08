export type AuthErrorCode =
  | 'EMAIL_REQUIRED'
  | 'PASSWORD_REQUIRED'
  | 'PASSWORD_TOO_SHORT'
  | 'EMAIL_EXISTS'
  | 'REGISTRATION_FAILED';

export const AUTH_ERROR_CODES: AuthErrorCode[] = [
  'EMAIL_REQUIRED',
  'PASSWORD_REQUIRED',
  'PASSWORD_TOO_SHORT',
  'EMAIL_EXISTS',
  'REGISTRATION_FAILED',
];

export function isAuthErrorCode(value: string): value is AuthErrorCode {
  return AUTH_ERROR_CODES.includes(value as AuthErrorCode);
}