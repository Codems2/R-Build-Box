import { fetchBranding } from './api';

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
 * Aplica el logo del box al favicon de la pestaña y al icono de iOS.
 *
 * IMPORTANTE: NO reemplazamos el manifiesto por un blob. Hacerlo rompía la
 * instalación de la PWA en escritorio: el navegador dispara
 * `beforeinstallprompt` con el manifiesto estático al cargar, pero al pulsar
 * «Instalar» reevalúa el manifiesto vigente; si es un `blob:`, su `start_url`/
 * `scope` («/») no resuelven bien y el diálogo no se abre (parece que el botón
 * «no hace nada»). El manifiesto estático /manifest.webmanifest ya trae los
 * iconos del box, así que las nuevas instalaciones usan el logo correcto.
 */
export async function applyPwaBranding() {
  try {
    const { icons } = await fetchBranding();
    if (!icons?.any192) return; // sin logo personalizado → se quedan los estáticos
    // Solo la pestaña del navegador y el icono de iOS (no afectan a la
    // instalabilidad, que la decide el manifiesto estático).
    setIconLink('icon', icons.any192);
    setIconLink('apple-touch-icon', icons.any192);
  } catch {
    /* si algo falla, se quedan los iconos estáticos por defecto */
  }
}

/** Restaura el manifiesto y los iconos estáticos por defecto (al restablecer). */
export function resetPwaBranding() {
  setIconLink('manifest', '/manifest.webmanifest');
  setIconLink('icon', '/logo.png');
  setIconLink('apple-touch-icon', '/apple-touch-icon.png');
}
