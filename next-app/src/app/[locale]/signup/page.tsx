'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { signIn } from 'next-auth/react';
import { useState, use } from 'react';
import { Mail, Lock, User } from 'lucide-react';
import { registerUserAction } from '@/actions/auth';

export default function SignUpPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  const t = useTranslations('Auth');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const handleOAuthSignIn = async (provider: 'google' | 'github' | 'yandex') => {
    setIsLoading(true);
    try {
      await signIn(provider, { callbackUrl: `/${locale}` });
    } catch (error) {
      console.error('OAuth error:', error);
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Валидация
    if (!formData.email) {
      setError(t('errorEmailRequired'));
      return;
    }

    if (!formData.password) {
      setError(t('errorPasswordRequired'));
      return;
    }

    if (formData.password.length < 6) {
      setError(t('errorPasswordShort'));
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError(t('errorPasswordMismatch'));
      return;
    }

    setIsLoading(true);

    try {
      const result = await registerUserAction({
        email: formData.email,
        password: formData.password,
        name: formData.name || undefined,
      });

      if (!result.success) {
        setError(result.error || t('errorSignUp'));
        setIsLoading(false);
        return;
      }

      // Автоматический вход после регистрации
      const signInResult = await signIn('credentials', {
        email: formData.email,
        password: formData.password,
        redirect: false,
      });

      if (signInResult?.error) {
        setError(t('errorSignIn'));
        setIsLoading(false);
      } else {
        window.location.href = `/${locale}`;
      }
    } catch (error) {
      setError(t('errorSignUp'));
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-xl p-8 space-y-6">
          {/* Хедер */}
          <div className="text-center space-y-2">
            <Link href={`/${locale}`} className="inline-block">
              <h1 className="text-3xl font-bold text-slate-900 hover:text-brand-600 transition-colors">
                Intelligent Trails
              </h1>
            </Link>
            <h2 className="text-2xl font-bold text-slate-900">{t('signUpTitle')}</h2>
            <p className="text-slate-600">{t('signUpSubtitle')}</p>
          </div>

          {/* Форма регистрации */}
          <form onSubmit={handleRegister} className="space-y-4">
            <Input
              type="text"
              placeholder={t('namePlaceholder') || 'Your name'}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              leftIcon={<User size={20} />}
            />
            <Input
              type="email"
              placeholder={t('emailPlaceholder')}
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              leftIcon={<Mail size={20} />}
              required
              error={!!error && error.includes('email')}
            />
            <Input
              type="password"
              placeholder={t('passwordPlaceholder')}
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              leftIcon={<Lock size={20} />}
              required
              error={!!error && error.includes('password')}
            />
            <Input
              type="password"
              placeholder={t('confirmPasswordPlaceholder')}
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              leftIcon={<Lock size={20} />}
              required
              error={!!error}
              errorText={error}
            />
            <Button type="submit" variant="primary" size="lg" className="w-full" isLoading={isLoading}>
              {t('signUpButton')}
            </Button>
          </form>

          {/* Разделитель */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white text-slate-500">{t('orContinueWith')}</span>
            </div>
          </div>

          {/* OAuth кнопки */}
          <div className="space-y-3">
            <Button
              variant="outline"
              size="lg"
              className="w-full"
              onClick={() => handleOAuthSignIn('google')}
              disabled={isLoading}
              leftIcon={
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              }
            >
              {t('signInWithGoogle')}
            </Button>

            <Button
              variant="outline"
              size="lg"
              className="w-full"
              onClick={() => handleOAuthSignIn('yandex')}
              disabled={isLoading}
              leftIcon={
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.6 0 12 0zm4.5 18.5h-2.3v-6.4c0-.9-.3-1.6-1-2-.4-.2-.8-.3-1.2-.3-.6 0-1.1.2-1.5.6-.4.4-.6.9-.6 1.5v6.6H7.5V5.5h2.4v1.2c.6-.9 1.5-1.4 2.6-1.4 1 0 1.9.4 2.6 1.1.7.7 1.1 1.7 1.1 2.9v9.2z"/>
                </svg>
              }
            >
              {t('signInWithYandex')}
            </Button>

            <Button
              variant="outline"
              size="lg"
              className="w-full"
              onClick={() => handleOAuthSignIn('github')}
              disabled={isLoading}
              leftIcon={
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
              }
            >
              {t('signInWithGitHub')}
            </Button>
          </div>

          {/* Условия использования */}
          <p className="text-xs text-center text-slate-500">
            {t('termsAgree')}{' '}
            <a href="#" className="text-brand-600 hover:text-brand-700">
              {t('termsLink')}
            </a>{' '}
            {t('and')}{' '}
            <a href="#" className="text-brand-600 hover:text-brand-700">
              {t('privacyLink')}
            </a>
          </p>

          {/* Футер */}
          <div className="text-center text-sm text-slate-600">
            {t('hasAccount')}{' '}
            <Link href={`/${locale}/signin`} className="text-brand-600 hover:text-brand-700 font-medium">
              {t('signInLink')}
            </Link>
          </div>
        </div>

        {/* Ссылка назад */}
        <div className="text-center mt-6">
          <Link href={`/${locale}`} className="text-slate-600 hover:text-slate-900 text-sm">
            ← {locale === 'ru' ? 'Вернуться на главную' : 'Back to home'}
          </Link>
        </div>
      </div>
    </div>
  );
}
