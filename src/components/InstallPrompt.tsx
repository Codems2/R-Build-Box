import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Download, Share, X } from 'lucide-react';
import { isIOSSafari, isMobileDevice, isStandalone, useInstall } from '../lib/pwa';

const SNOOZE_KEY = 'rmbox_install_snoozed_until';
const SNOOZE_HOURS = 12;

/** ¿El usuario cerró el banner hace poco? (silenciado 12 h) */
function isSnoozed(): boolean {
  try {
    return Date.now() < Number(localStorage.getItem(SNOOZE_KEY) || 0);
  } catch {
    return false;
  }
}

export default function InstallPrompt() {
  const { canInstall, promptInstall } = useInstall();
  const [iosHint, setIosHint] = useState(false);
  const [hidden, setHidden] = useState(isSnoozed);
  // Si el instalador nativo no está disponible, mostramos la vía manual
  const [manual, setManual] = useState(false);

  useEffect(() => {
    if (!isStandalone() && isIOSSafari()) setIosHint(true);
  }, []);

  // En PC no ofrecemos instalar: solo tiene sentido en el móvil/tablet
  const show = isMobileDevice() && !hidden && (canInstall || iosHint || manual);

  function dismiss() {
    setHidden(true);
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_HOURS * 36e5));
    } catch {
      /* ignore */
    }
  }

  async function install() {
    const outcome = await promptInstall();
    if (outcome === 'unavailable') {
      // El navegador no ofreció el diálogo nativo: enseñamos cómo hacerlo a mano
      setManual(true);
    } else if (outcome === 'accepted') {
      setHidden(true);
    }
  }

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
              {iosHint && !canInstall ? (
                <p className="text-xs leading-snug text-zinc-300">
                  Instala <span className="font-semibold text-white">Sabai Muay Thai</span>: pulsa{' '}
                  <Share className="inline h-3.5 w-3.5 -translate-y-px text-accent-400" /> Compartir y
                  luego <span className="font-medium text-zinc-100">«Añadir a pantalla de inicio»</span>.
                </p>
              ) : manual ? (
                <p className="text-xs leading-snug text-zinc-300">
                  Abre el menú del navegador{' '}
                  <span className="font-medium text-zinc-100">(⋮)</span> y pulsa{' '}
                  <span className="font-medium text-zinc-100">«Instalar aplicación»</span>.
                </p>
              ) : (
                <>
                  <p className="text-sm font-semibold text-white">Instala la app</p>
                  <p className="text-xs text-zinc-400">Acceso directo en tu móvil, a pantalla completa.</p>
                </>
              )}
            </div>

            {canInstall && !manual && (
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
