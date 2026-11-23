'use client';

import { useI18n } from '@/lib/i18n/I18nProvider';
import type { Locale } from '@/lib/types';

const OPTIONS: Locale[] = ['es', 'en'];

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div role="group" aria-label={t.nav.language} className="inline-flex rounded-full border border-bark/20 bg-white/50 p-0.5 text-xs font-bold">
      {OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => setLocale(option)}
          aria-pressed={locale === option}
          className={`cursor-pointer rounded-full px-2.5 py-1 uppercase transition ${
            locale === option ? 'bg-espresso text-cream' : 'text-bark hover:text-espresso'
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
