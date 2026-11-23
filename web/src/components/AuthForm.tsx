'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { homeFor, useAuth } from '@/lib/auth/AuthProvider';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { Alert } from './Alert';

/** Formulario compartido de login/registro (evita duplicar lógica y estilos). */
export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const { t, errorMessage } = useI18n();
  const { login, register } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isLogin = mode === 'login';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '');
    const password = String(form.get('password') ?? '');
    setSubmitting(true);
    setError(null);
    try {
      const user = isLogin ? await login(email, password) : await register(String(form.get('name') ?? ''), email, password);
      const next = searchParams.get('next');
      // Solo rutas internas para evitar redirecciones abiertas.
      router.replace(next?.startsWith('/') && !next.startsWith('//') ? next : homeFor(user));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto grid max-w-4xl overflow-hidden rounded-[2rem] border border-bark/10 bg-white/60 shadow-xl md:grid-cols-2">
      <div className="hidden flex-col justify-between bg-espresso p-10 text-cream md:flex">
        <p className="font-display text-4xl leading-tight font-extrabold">{t.brand.tagline}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 p-8 sm:p-10" noValidate={false}>
        <div>
          <h1 className="font-display text-3xl font-extrabold">{isLogin ? t.auth.loginTitle : t.auth.registerTitle}</h1>
          <p className="mt-1 text-bark">{isLogin ? t.auth.loginSubtitle : t.auth.registerSubtitle}</p>
        </div>

        {error && <Alert tone="error">{error}</Alert>}

        {!isLogin && (
          <div>
            <label htmlFor="name" className="label">
              {t.auth.name}
            </label>
            <input id="name" name="name" className="input" required minLength={2} maxLength={80} autoComplete="name" />
          </div>
        )}
        <div>
          <label htmlFor="email" className="label">
            {t.auth.email}
          </label>
          <input id="email" name="email" type="email" className="input" required autoComplete="email" />
        </div>
        <div>
          <label htmlFor="password" className="label">
            {t.auth.password}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            className="input"
            required
            minLength={isLogin ? 1 : 8}
            autoComplete={isLogin ? 'current-password' : 'new-password'}
          />
        </div>

        <button type="submit" className="btn btn-primary w-full py-3" disabled={submitting}>
          {submitting ? t.common.loading : isLogin ? t.auth.submitLogin : t.auth.submitRegister}
        </button>

        <p className="text-center text-sm text-bark">
          {isLogin ? t.auth.noAccount : t.auth.haveAccount}{' '}
          <Link href={isLogin ? '/register' : '/login'} className="font-bold text-clay hover:underline">
            {isLogin ? t.nav.register : t.nav.login}
          </Link>
        </p>
      </form>
    </div>
  );
}
