'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useCart } from '@/lib/cart/CartProvider';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { LanguageSwitcher } from './LanguageSwitcher';
import { Logo } from './Logo';

interface NavItem {
  href: string;
  label: string;
  badge?: number;
}

export function Navbar() {
  const { t } = useI18n();
  const { user, ready, logout } = useAuth();
  const { count } = useCart();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const items: NavItem[] =
    user?.role === 'administrador'
      ? [
          { href: '/admin', label: t.nav.shipping },
          { href: '/admin/catalog', label: t.nav.manageCatalog },
        ]
      : [
          { href: '/catalog', label: t.nav.catalog },
          { href: '/cart', label: t.nav.cart, badge: count },
          ...(user ? [{ href: '/orders', label: t.nav.orders }] : []),
        ];

  const handleLogout = () => {
    logout();
    setOpen(false);
    router.push('/');
  };

  const linkClass = (href: string) =>
    `relative rounded-full px-3 py-2 text-sm font-medium transition ${
      pathname === href ? 'bg-sand text-espresso' : 'text-bark hover:text-espresso'
    }`;

  return (
    <header className="sticky top-0 z-40 border-b border-bark/10 bg-cream/85 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Logo />

        <button
          type="button"
          className="btn btn-ghost md:hidden"
          aria-expanded={open}
          aria-label={t.nav.openMenu}
          onClick={() => setOpen((o) => !o)}
        >
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
          </svg>
        </button>

        <div
          className={`${open ? 'flex' : 'hidden'} absolute inset-x-0 top-full flex-col gap-2 border-b border-bark/10 bg-cream px-4 pb-4 md:static md:flex md:flex-row md:items-center md:gap-1 md:border-0 md:bg-transparent md:p-0`}
        >
          {items.map((item) => (
            <Link key={item.href} href={item.href} className={linkClass(item.href)} onClick={() => setOpen(false)}>
              {item.label}
              {!!item.badge && (
                <span className="ml-1.5 inline-grid min-w-5 place-items-center rounded-full bg-clay px-1.5 text-xs font-bold text-cream">
                  {item.badge}
                </span>
              )}
            </Link>
          ))}

          <div className="flex items-center gap-2 md:ml-3">
            <LanguageSwitcher />
            {ready &&
              (user ? (
                <>
                  <span className="hidden text-sm text-bark lg:inline">{user.name}</span>
                  <button type="button" className="btn btn-secondary py-2" onClick={handleLogout}>
                    {t.nav.logout}
                  </button>
                </>
              ) : (
                <Link href="/login" className="btn btn-primary py-2" onClick={() => setOpen(false)}>
                  {t.nav.login}
                </Link>
              ))}
          </div>
        </div>
      </nav>
    </header>
  );
}
