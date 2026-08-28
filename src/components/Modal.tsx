import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export default function Modal({ open, title, onClose, children }: Props) {
  // Bloquea el scroll del fondo mientras el modal está abierto (evita que el
  // contenido de detrás se desplace y que en móvil el diálogo «se sienta» enorme).
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Se renderiza mediante un portal en <body> para escapar de cualquier
  // ancestro con `transform` (framer-motion en el panel de admin, transiciones
  // de ruta, etc.). Sin esto, `position: fixed` se posiciona respecto a ese
  // contenedor transformado en lugar del viewport: el modal aparecía
  // desmesurado y no salía en las capturas de pantalla.
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-end justify-center overscroll-contain bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 60, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 60, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-y-auto overscroll-contain rounded-t-3xl border border-white/10 bg-ink-900 p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-card sm:rounded-3xl sm:p-6 sm:pb-6"
          >
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 className="min-w-0 flex-1 truncate font-display text-lg font-bold text-white">
                {title}
              </h2>
              <button onClick={onClose} className="btn-icon shrink-0" aria-label="Cerrar">
                <X className="h-4 w-4" />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
