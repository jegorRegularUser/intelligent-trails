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

  const handleOAuthSignIn = async (provider: 'yandex') => {
    setIsLoading(true);
    try {
      await signIn(provider, { callbackUrl: `/${locale}/profile` });
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
        window.location.href = `/${locale}/profile`;
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

      </div>
    </div>
  );
}
