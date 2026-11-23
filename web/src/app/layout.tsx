import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import { Bricolage_Grotesque, DM_Sans } from 'next/font/google';
import { Navbar } from '@/components/Navbar';
import { Providers } from '@/components/Providers';
import './globals.css';

/** Display sans en negrita para títulos + sans legible para el cuerpo. */
const display = Bricolage_Grotesque({ variable: '--font-bricolage', subsets: ['latin'], weight: ['600', '700', '800'] });
const body = DM_Sans({ variable: '--font-dm-sans', subsets: ['latin'] });

export const metadata: Metadata = {
  title: { default: 'Libros Ya', template: '%s · Libros Ya' },
  description: 'Librería en línea: e-books e impresos, pago con PayPal y seguimiento de envíos en tiempo real.',
};

export const viewport: Viewport = { themeColor: '#c2653a' };

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es" className={`${display.variable} ${body.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Providers>
          {/* La barra lee la ruta actual: se aísla para no bloquear el prerender de rutas dinámicas. */}
          <Suspense fallback={<div className="h-[65px] border-b border-bark/10" />}>
            <Navbar />
          </Suspense>
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">{children}</main>
          <footer className="border-t border-bark/10 py-6 text-center text-xs text-bark/70">Libros Ya · UdeA 2026</footer>
        </Providers>
      </body>
    </html>
  );
}
