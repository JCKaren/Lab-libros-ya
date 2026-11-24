'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { homeFor, useAuth } from '@/lib/auth/AuthProvider';
import { invalidFieldLabels, passwordProblem } from '@/lib/formValidation';
import { useI18n } from '@/lib/i18n/I18nProvider';
import type { User } from '@/lib/types';
import { Alert } from './Alert';

/**
 * Destino después de ingresar: solo rutas internas (evita redirecciones abiertas) y solo
 * si el rol puede abrirlas. Un `next` viejo de otra sesión (p. ej. /orders al entrar como
 * administrador) se descarta y se va al inicio de ese rol.
 */
function safeNext(next: string | null, user: User): string {
  if (!next?.startsWith('/') || next.startsWith('//')) return homeFor(user);
  const isAdminPath = next === '/admin' || /^\/admin[/?#]/.test(next);
  if (user.role === 'administrador') return isAdminPath ? next : homeFor(user);
  return isAdminPath ? homeFor(user) : next;
}

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
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const email = String(form.get('email') ?? '');
    const password = String(form.get('password') ?? '');

    // Validación visible antes de enviar (el backend vuelve a validar todo).
    const problem = isLogin || !password ? null : passwordProblem(password, email);
    if (problem) {
      (formEl.elements.namedItem('password') as HTMLInputElement | null)?.focus();
      setError(t.auth.passwordErrors[problem]);
      return;
    }
    const invalid = invalidFieldLabels(formEl);
    if (invalid.length) {
      setError(`${t.auth.checkFields} ${invalid.join(', ')}.`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const user = isLogin ? await login(email, password) : await register(String(form.get('name') ?? ''), email, password);
      router.replace(safeNext(searchParams.get('next'), user));
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

      <form onSubmit={handleSubmit} className="space-y-5 p-8 sm:p-10" noValidate>
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
            minLength={isLogin ? 1 : 10}
            pattern={isLogin ? undefined : '(?=.*[A-Za-z])(?=.*[0-9]).{10,}'}
            title={isLogin ? undefined : t.auth.passwordHint}
            aria-describedby={isLogin ? undefined : 'password-hint'}
            autoComplete={isLogin ? 'current-password' : 'new-password'}
          />
          {!isLogin && (
            <p id="password-hint" className="mt-1 text-xs text-bark">
              {t.auth.passwordHint}
            </p>
          )}
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
