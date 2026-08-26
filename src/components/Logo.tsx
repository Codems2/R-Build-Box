import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';

/**
 * Muestra el logo del box: el personalizado (Ajustes) si lo hay, si no el de
 * `public/logo.png`, y como último respaldo una marca abstracta sin texto.
 */
export default function Logo({ className = 'h-10 w-10' }: { className?: string }) {
  const { logoUrl } = useAuth();
  // 0 = logo configurado, 1 = logo por defecto, 2 = marca SVG
  const [stage, setStage] = useState(0);

  // Si cambia el logo configurado, reintenta desde el principio
  useEffect(() => {
    setStage(logoUrl ? 0 : 1);
  }, [logoUrl]);

  const src = stage === 0 && logoUrl ? logoUrl : '/logo.png';

  if (stage < 2) {
    return (
      <img
        src={src}
        alt="Logo del box"
        className={`${className} object-contain drop-shadow-[0_0_14px_rgba(217,43,83,0.35)]`}
        onError={() => setStage((s) => s + 1)}
      />
    );
  }

  return (
    <svg viewBox="0 0 64 64" className={className} aria-label="Box" role="img">
      <defs>
        <linearGradient id="logoGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#E64D72" />
          <stop offset="100%" stopColor="#9E1838" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="18" fill="url(#logoGrad)" />
      <path
        d="M18 44 L32 18 L38 30 L44 22 L46 44"
        fill="none"
        stroke="#fff"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
