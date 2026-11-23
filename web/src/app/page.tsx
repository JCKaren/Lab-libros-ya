'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n/I18nProvider';

const SPINES = [
  { h: 'h-56', c: 'bg-clay' },
  { h: 'h-64', c: 'bg-olive' },
  { h: 'h-48', c: 'bg-ochre' },
  { h: 'h-60', c: 'bg-bark' },
  { h: 'h-52', c: 'bg-moss' },
  { h: 'h-64', c: 'bg-clay-dark' },
  { h: 'h-44', c: 'bg-sand-dark' },
];

export default function HomePage() {
  const { t } = useI18n();

  return (
    <div className="space-y-16">
      <section className="grid items-center gap-10 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <p className="mb-4 inline-block rounded-full bg-olive/15 px-3 py-1 text-xs font-bold tracking-wide text-moss uppercase">
            {t.home.eyebrow}
          </p>
          <h1 className="font-display text-5xl leading-[0.95] font-extrabold tracking-tight sm:text-7xl">{t.home.title}</h1>
          <p className="mt-6 max-w-xl text-lg text-bark">{t.home.subtitle}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/catalog" className="btn btn-primary px-7 py-3 text-base">
              {t.home.ctaCatalog}
            </Link>
            <Link href="/register" className="btn btn-secondary px-7 py-3 text-base">
              {t.home.ctaRegister}
            </Link>
          </div>
        </div>

        {/* Estantería ilustrada */}
        <div className="relative mx-auto w-full max-w-md" aria-hidden>
          <div className="flex items-end justify-center gap-2 px-6">
            {SPINES.map((spine, i) => (
              <div
                key={i}
                className={`${spine.h} ${spine.c} w-10 rounded-t-md shadow-lg transition hover:-translate-y-2 sm:w-12 ${i === 3 ? 'rotate-[-8deg]' : ''}`}
              >
                <div className="mx-auto mt-4 h-1 w-6 rounded bg-cream/40" />
                <div className="mx-auto mt-1 h-1 w-4 rounded bg-cream/30" />
              </div>
            ))}
          </div>
          <div className="h-4 rounded-full bg-espresso shadow-xl" />
          <p className="mt-6 text-center font-display text-sm tracking-[0.3em] text-bark uppercase">{t.brand.tagline}</p>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {t.home.steps.map((step, i) => (
          <article key={step.title} className="card p-6">
            <span className="font-display text-4xl font-extrabold text-clay">0{i + 1}</span>
            <h2 className="mt-3 font-display text-xl font-bold">{step.title}</h2>
            <p className="mt-1 text-bark">{step.text}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
