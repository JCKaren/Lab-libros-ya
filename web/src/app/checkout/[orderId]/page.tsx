import { Suspense } from 'react';
import { RoleGuard } from '@/components/RoleGuard';
import { CheckoutView } from './CheckoutView';

/** Ruta dinámica: el Suspense envuelve todo lo que lee la URL (params, pathname). */
export default function CheckoutPage() {
  return (
    <Suspense>
      <RoleGuard role="cliente">
        <CheckoutView />
      </RoleGuard>
    </Suspense>
  );
}
