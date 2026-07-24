import { useState } from 'react';

/**
 * Muestra el logo real del box si existe `public/logo.png`.
 * Si no, usa un monograma SVG con la paleta de la marca como respaldo.
 */
export default function Logo({ className = 'h-10 w-10' }: { className?: string }) {
  const [missing, setMissing] = useState(false);

  if (!missing) {
    return (
      <img
        src="/logo.png"
        alt="Logo Red Monkey Muay Thai Box"
        className={`${className} object-contain drop-shadow-[0_0_14px_rgba(217,43,83,0.35)]`}
        onError={() => setMissing(true)}
      />
    );
  }

  return (
    <svg viewBox="0 0 64 64" className={className} aria-label="Red Monkey" role="img">
      <defs>
        <linearGradient id="logoGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#E64D72" />
          <stop offset="100%" stopColor="#9E1838" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="18" fill="url(#logoGrad)" />
      <text
        x="32"
        y="42"
        textAnchor="middle"
        fontFamily="Sora, sans-serif"
        fontWeight="800"
        fontSize="26"
        fill="#fff"
      >
        RM
      </text>
    </svg>
  );
}
