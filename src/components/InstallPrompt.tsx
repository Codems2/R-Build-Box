import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Download, Share, X } from 'lucide-react';

const DISMISS_KEY = 'rmbox_install_dismissed_v1';

/** Evento no estándar de Chrome/Android para instalar la PWA */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

/** ¿La web ya se abre como app instalada (no desde el navegador)? */
function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/** Safari de iOS (el único que puede «Añadir a pantalla de inicio» en iPhone) */
function isIOSSafari(): boolean {
  const ua = navigator.userAgent;
  return isIOS() && /safari/i.test(ua) && !/crios|fxios|edgios|opios/i.test(ua);
}

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Si ya está instalada (se abre como app) o el usuario ya lo descartó, nada.
    if (isStandalone()) return;
    try {
      if (localStorage.getItem(DISMISS_KEY)) return;
    } catch {
      /* almacenamiento no disponible: seguimos */
    }

    const useEvent = () => {
      const e = (window as unknown as { __bip?: BeforeInstallPromptEvent }).__bip;
      if (e) {
        setDeferred(e);
        setVisible(true);
      }
    };
    useEvent(); // por si el evento llegó antes de montar

    const onReady = () => useEvent();
    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    const onInstalled = () => {
      setVisible(false);
      setDeferred(null);
    };

    window.addEventListener('bip-ready', onReady);
    window.addEventListener('beforeinstallprompt', onBIP);
    window.addEventListener('appinstalled', onInstalled);

    // iOS no tiene instalación automática: mostramos una pista breve en Safari.
    if (isIOSSafari()) {
      setIosHint(true);
      setVisible(true);
    }

    return () => {
      window.removeEventListener('bip-ready', onReady);
      window.removeEventListener('beforeinstallprompt', onBIP);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice.catch(() => undefined);
    setDeferred(null);
    setVisible(false);
  }

  const show = visible && (deferred !== null || iosHint);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
          role="dialog"
          aria-label="Instalar la app"
        >
          <div className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border border-white/10 bg-zinc-900/95 p-3 shadow-2xl shadow-black/50 backdrop-blur">
            <img
              src="/icon-192.png"
              alt=""
              className="h-11 w-11 shrink-0 rounded-xl ring-1 ring-white/10"
            />
            <div className="min-w-0 flex-1">
              {iosHint ? (
                <p className="text-xs leading-snug text-zinc-300">
                  Instala <span className="font-semibold text-white">R-Build Box</span>: pulsa{' '}
                  <Share className="inline h-3.5 w-3.5 -translate-y-px text-accent-400" /> Compartir y
                  luego <span className="font-medium text-zinc-100">«Añadir a pantalla de inicio»</span>.
                </p>
              ) : (
                <>
                  <p className="text-sm font-semibold text-white">Instala la app</p>
                  <p className="text-xs text-zinc-400">Acceso directo en tu móvil, a pantalla completa.</p>
                </>
              )}
            </div>

            {!iosHint && (
              <button onClick={() => void install()} className="btn-primary shrink-0 !px-3.5 !py-2 text-xs">
                <Download className="h-4 w-4" /> Instalar
              </button>
            )}

            <button
              onClick={dismiss}
              className="shrink-0 rounded-lg p-1.5 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-300"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
