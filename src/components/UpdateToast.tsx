import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { startUpdateWatcher } from '../lib/updateWatcher';

/**
 * Aviso discreto cuando hay una versión nueva desplegada. Al pulsar
 * «Actualizar» se recarga para cargar el nuevo bundle (y refrescar el
 * service worker). No es intrusivo: una barrita abajo que se puede ignorar.
 */
export default function UpdateToast() {
  const [show, setShow] = useState(false);
  const [reloading, setReloading] = useState(false);

  useEffect(() => startUpdateWatcher(() => setShow(true)), []);

  async function reload() {
    setReloading(true);
    try {
      // Limpia cachés del service worker para forzar la carga fresca.
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {
      /* si falla, recargamos igualmente */
    }
    window.location.reload();
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          className="fixed inset-x-0 bottom-0 z-[80] flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
        >
          <div className="flex w-full max-w-md items-center gap-3 rounded-2xl border border-white/10 bg-ink-900/95 px-4 py-3 shadow-2xl shadow-black/60 backdrop-blur">
            <RefreshCw className="h-4 w-4 shrink-0 text-accent-400" />
            <p className="min-w-0 flex-1 text-sm text-zinc-200">
              Hay una versión nueva de la app.
            </p>
            <button
              onClick={() => void reload()}
              disabled={reloading}
              className="btn-primary shrink-0 !px-3.5 !py-2 text-xs"
            >
              {reloading ? 'Actualizando…' : 'Actualizar'}
            </button>
            <button
              onClick={() => setShow(false)}
              className="shrink-0 text-xs font-medium text-zinc-500 transition hover:text-zinc-300"
            >
              Ahora no
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
