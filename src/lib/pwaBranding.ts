import { fetchBranding } from './api';

// Datos base del manifiesto (deben coincidir con public/manifest.webmanifest)
const MANIFEST_BASE = {
  name: 'Sabai Muay Thai',
  short_name: 'Sabai Muay Thai',
  description: 'Reserva tus clases en Sabai Muay Thai.',
  id: '/',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  orientation: 'portrait',
  lang: 'es',
  background_color: '#0B0A0B',
  theme_color: '#0B0A0B',
};

function setIconLink(rel: string, href: string) {
  let link = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!link) {
    link = document.createElement('link');
    link.rel = rel;
    document.head.appendChild(link);
  }
  link.href = href;
}

/**
 * Si el box tiene un logo personalizado, reconstruye el manifiesto de la PWA
 * y el favicon con sus iconos, para que las NUEVAS instalaciones y la pestaña
 * del navegador usen el logo del box. Las apps ya instaladas conservan su
 * icono hasta que se reinstalen (limitación de iOS/Android).
 */
export async function applyPwaBranding() {
  try {
    const { icons } = await fetchBranding();
    if (!icons?.any192 || !icons?.any512 || !icons?.maskable) return; // sin logo → estáticos

    const manifest = {
      ...MANIFEST_BASE,
      icons: [
        { src: icons.any192, sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: icons.any512, sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: icons.maskable, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    };
    const blob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' });
    setIconLink('manifest', URL.createObjectURL(blob));

    // Pestaña del navegador e icono de iOS
    setIconLink('icon', icons.any192);
    setIconLink('apple-touch-icon', icons.any192);
  } catch {
    /* si algo falla, se quedan el manifiesto e iconos estáticos por defecto */
  }
}

/** Restaura el manifiesto y los iconos estáticos por defecto (al restablecer). */
export function resetPwaBranding() {
  setIconLink('manifest', '/manifest.webmanifest');
  setIconLink('icon', '/logo.png');
  setIconLink('apple-touch-icon', '/apple-touch-icon.png');
}
