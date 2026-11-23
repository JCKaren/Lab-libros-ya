import type { ReactNode } from 'react';

const TONES = {
  error: 'border-clay/30 bg-clay/10 text-clay-dark',
  success: 'border-olive/30 bg-olive/15 text-moss',
  info: 'border-ochre/40 bg-ochre/15 text-[#7a5717]',
} as const;

export function Alert({ tone = 'info', children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-2xl border px-4 py-3 text-sm ${TONES[tone]}`}>
      {children}
    </div>
  );
}
