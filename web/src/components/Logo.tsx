import Link from 'next/link';

export function Logo() {
  return (
    <Link href="/" className="group inline-flex items-center gap-2" aria-label="Libros Ya">
      <span className="grid size-9 place-items-center rounded-2xl bg-clay text-cream shadow-sm transition group-hover:-rotate-6">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
          <path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" />
          <path d="M9 7h7" />
        </svg>
      </span>
      <span className="font-display text-2xl font-extrabold tracking-tight">
        Libros<span className="text-clay">Ya</span>
      </span>
    </Link>
  );
}
