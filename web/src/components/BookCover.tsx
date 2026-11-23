'use client';

import { useState } from 'react';

const PALETTES = [
  'from-clay to-clay-dark',
  'from-olive to-moss',
  'from-ochre to-bark',
  'from-bark to-espresso',
  'from-moss to-espresso',
];

/** Elige un color estable a partir del título, para que cada libro tenga siempre la misma portada. */
const paletteFor = (seed: string) => PALETTES[[...seed].reduce((sum, c) => sum + c.charCodeAt(0), 0) % PALETTES.length];

interface Props {
  src: string;
  title: string;
  author: string;
  className?: string;
  /** Tamaño compacto para listas (oculta el autor). */
  compact?: boolean;
}

/** Portada del libro; si la imagen falla o no existe, dibuja una portada tipográfica. */
export function BookCover({ src, title, author, className = '', compact = false }: Props) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        role="img"
        aria-label={title}
        className={`relative flex flex-col justify-between overflow-hidden bg-gradient-to-br p-3 text-cream ${paletteFor(title)} ${className}`}
      >
        <span className="absolute inset-y-0 left-2 w-px bg-cream/25" aria-hidden />
        <p className={`font-display leading-tight font-extrabold ${compact ? 'line-clamp-3 text-[10px]' : 'line-clamp-4 text-lg'}`}>{title}</p>
        {!compact && <p className="text-xs opacity-80">{author}</p>}
      </div>
    );
  }

  // <img> porque las URLs las define el administrador y pueden venir de cualquier dominio.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={title} loading="lazy" onError={() => setFailed(true)} className={`object-cover ${className}`} />;
}
