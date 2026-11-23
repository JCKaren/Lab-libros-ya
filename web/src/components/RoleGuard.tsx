'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useI18n } from '@/lib/i18n/I18nProvider';
import type { Role } from '@/lib/types';

/**
 * Protección de rutas en la interfaz. Es solo UX: la autorización real
 * la aplica el backend en cada endpoint.
 */
export function RoleGuard({ role, children }: { role: Role; children: ReactNode }) {
  const { user, ready } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (ready && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [ready, user, router, pathname]);

  if (!ready || !user) {
    return <p className="py-24 text-center text-bark">{t.guard.checking}</p>;
  }

  if (user.role !== role) {
    return (
      <div className="card mx-auto my-16 max-w-md p-8 text-center">
        <p className="font-display text-2xl font-bold">{t.guard.denied}</p>
        <Link href="/" className="btn btn-primary mt-6">
          {t.guard.goHome}
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
