const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

export function validateSignInForm(email: string, password: string): {
  email?: 'required' | 'invalid';
  password?: 'required';
} {
  const errors: { email?: 'required' | 'invalid'; password?: 'required' } = {};

  if (!email.trim()) {
    errors.email = 'required';
  } else if (!isValidEmail(email)) {
    errors.email = 'invalid';
  }

  if (!password) {
    errors.password = 'required';
  }

  return errors;
}

export function validateSignUpForm(
  email: string,
  password: string,
  confirmPassword: string
): {
  email?: 'required' | 'invalid';
  password?: 'required' | 'short';
  confirmPassword?: 'mismatch';
} {
  const errors: ReturnType<typeof validateSignUpForm> = {};

  if (!email.trim()) {
    errors.email = 'required';
  } else if (!isValidEmail(email)) {
    errors.email = 'invalid';
  }

  if (!password) {
    errors.password = 'required';
  } else if (password.length < 6) {
    errors.password = 'short';
  }

  if (password !== confirmPassword) {
    errors.confirmPassword = 'mismatch';
  }

  return errors;
}