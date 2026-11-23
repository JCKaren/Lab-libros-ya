'use client';

import type { ReactNode } from 'react';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { CartProvider } from '@/lib/cart/CartProvider';
import { I18nProvider } from '@/lib/i18n/I18nProvider';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <AuthProvider>
        <CartProvider>{children}</CartProvider>
      </AuthProvider>
    </I18nProvider>
  );
}
