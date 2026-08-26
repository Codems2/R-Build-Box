import { useEffect, useState } from 'react';

/** Evento no estándar de Chrome/Android para instalar la PWA */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type Win = Window & { __bip?: BeforeInstallPromptEvent };

let deferred: BeforeInstallPromptEvent | null =
  (window as Win).__bip ?? null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

window.addEventListener('bip-ready', () => {
  deferred = (window as Win).__bip ?? null;
  emit();
});
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as BeforeInstallPromptEvent;
  (window as Win).__bip = deferred;
  emit();
});
window.addEventListener('appinstalled', () => {
  deferred = null;
  (window as Win).__bip = undefined;
  emit();
});

/** ¿La web se abre ya como app instalada (no desde el navegador)? */
export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/** Safari de iOS: el único que puede «Añadir a pantalla de inicio» en iPhone */
export function isIOSSafari(): boolean {
  const ua = navigator.userAgent;
  return isIOS() && /safari/i.test(ua) && !/crios|fxios|edgios|opios/i.test(ua);
}

/** Lanza el diálogo nativo de instalación (Android/Chrome). */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferred) return 'unavailable';
  await deferred.prompt();
  const choice = await deferred.userChoice.catch(() => null);
  deferred = null;
  (window as Win).__bip = undefined;
  emit();
  return choice?.outcome ?? 'dismissed';
}

/** Hook: se re-renderiza cuando cambia la disponibilidad de instalación. */
export function useInstall() {
  const [, force] = useState(0);
  useEffect(() => {
    const cb = () => force((n) => n + 1);
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }, []);
  return {
    canInstall: deferred !== null && !isStandalone(),
    standalone: isStandalone(),
    promptInstall,
  };
}
