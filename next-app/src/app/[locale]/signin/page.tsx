'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { signIn } from 'next-auth/react';
import { useState, use } from 'react';
import { Mail, Lock } from 'lucide-react';
import { validateSignInForm } from '@/utils/authValidation';

type FieldErrors = {
  email?: string;
  password?: string;
  general?: string;
};

export default function SignInPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  const t = useTranslations('Auth');
  const [isLoading, setIsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });

  const clearFieldError = (field: keyof FieldErrors) => {
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const handleOAuthSignIn = async (provider: 'yandex') => {
    setIsLoading(true);
    setFieldErrors({});
    try {
      await signIn(provider, { callbackUrl: `/${locale}/profile` });
    } catch (error) {
      console.error('OAuth error:', error);
      setFieldErrors({ general: t('errorOAuth') });
      setIsLoading(false);
    }
  };

  const handleCredentialsSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});

    const validation = validateSignInForm(formData.email, formData.password);
    const errors: FieldErrors = {};

    if (validation.email === 'required') errors.email = t('errorEmailRequired');
    if (validation.email === 'invalid') errors.email = t('errorEmailInvalid');
    if (validation.password === 'required') errors.password = t('errorPasswordRequired');

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setIsLoading(true);

    try {
      const result = await signIn('credentials', {
        email: formData.email.trim(),
        password: formData.password,
        redirect: false,
      });

      if (result?.error) {
        setFieldErrors({ general: t('errorSignIn') });
        setIsLoading(false);
      } else {
        window.location.href = `/${locale}/profile`;
      }
    } catch {
      setFieldErrors({ general: t('errorSignIn') });
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-xl p-8 space-y-6">
          <div className="text-center space-y-2">
            <Link href={`/${locale}`} className="inline-block">
              <h1 className="text-3xl font-bold text-slate-900 hover:text-brand-600 transition-colors">
                Intelligent Trails
              </h1>
            </Link>
            <h2 className="text-2xl font-bold text-slate-900">{t('signInTitle')}</h2>
            <p className="text-slate-600">{t('signInSubtitle')}</p>
          </div>

          {fieldErrors.general && (
            <div className="rounded-2xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
              {fieldErrors.general}
            </div>
          )}

          <form onSubmit={handleCredentialsSignIn} className="space-y-4">
            <Input
              type="email"
              placeholder={t('emailPlaceholder')}
              value={formData.email}
              onChange={(e) => {
                setFormData({ ...formData, email: e.target.value });
                clearFieldError('email');
              }}
              leftIcon={<Mail size={20} />}
              error={!!fieldErrors.email}
              errorText={fieldErrors.email}
            />
            <Input
              type="password"
              placeholder={t('passwordPlaceholder')}
              value={formData.password}
              onChange={(e) => {
                setFormData({ ...formData, password: e.target.value });
                clearFieldError('password');
              }}
              leftIcon={<Lock size={20} />}
              error={!!fieldErrors.password}
              errorText={fieldErrors.password}
            />
            <Button type="submit" variant="primary" size="lg" className="w-full" isLoading={isLoading}>
              {t('signInButton')}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white text-slate-500">{t('orContinueWith')}</span>
            </div>
          </div>

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

          <div className="text-center text-sm text-slate-600">
            {t('noAccount')}{' '}
            <Link href={`/${locale}/signup`} className="text-brand-600 hover:text-brand-700 font-medium">
              {t('signUpLink')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}