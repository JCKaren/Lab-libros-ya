'use client';

import { useI18n } from '@/lib/i18n/I18nProvider';
import type { BookFormat } from '@/lib/types';

export function FormatBadge({ format, className = '' }: { format: BookFormat; className?: string }) {
  const { t } = useI18n();
  const isEbook = format === 'ebook';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
        isEbook ? 'bg-olive/15 text-moss' : 'bg-clay/15 text-clay-dark'
      } ${className}`}
    >
      {isEbook ? '⬇' : '📦'} {t.formats[format]}
    </span>
  );
}
