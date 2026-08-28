import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, MoreVertical } from 'lucide-react';

export interface ActionItem {
  key: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  loading?: boolean;
  /** Clase extra para el botón en línea (color de acento, etc.) */
  iconClassName?: string;
}

/**
 * Muestra las acciones en línea (iconos) cuando caben; si el espacio se
 * reduce y se solaparían, las colapsa en un botón «⋮» que abre un menú
 * desplegable con las mismas opciones (estilo Salesforce).
 */
export default function AdaptiveActions({
  items,
  /** Espacio mínimo que se reserva a la izquierda (avatar + datos) */
  reserve = 188,
}: {
  items: ActionItem[];
  reserve?: number;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [overflow, setOverflow] = useState(false);
  // En móvil (pantalla pequeña) siempre se usa el menú desplegable
  const [small, setSmall] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches,
  );
  const collapsed = small || overflow;
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const on = () => setSmall(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const place = () => {
    const t = triggerRef.current;
    if (!t) return;
    const r = t.getBoundingClientRect();
    setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
  };
  const toggle = () => {
    if (!open) place();
    setOpen((v) => !v);
  };

  useLayoutEffect(() => {
    const host = hostRef.current;
    const measure = measureRef.current;
    if (!host || !measure) return;
    const row = host.parentElement;
    if (!row) return;
    const check = () => {
      const natural = measure.scrollWidth; // anchura natural de las acciones en línea
      const available = row.clientWidth - reserve;
      setOverflow(natural > available);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(row);
    return () => ro.disconnect();
  }, [items.length, reserve]);

  // Cerrar el menú con Escape, y al hacer scroll o cambiar de tamaño
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const close = () => setOpen(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  return (
    <div ref={hostRef} className="relative shrink-0">
      {/* Medidor oculto: misma pinta que los botones en línea, para saber su anchura real */}
      <div
        ref={measureRef}
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 -z-10 flex gap-1.5 opacity-0"
      >
        {items.map((it) => (
          <span key={it.key} className="btn-icon">
            <it.icon className="h-4 w-4" />
          </span>
        ))}
      </div>

      {collapsed ? (
        <>
          <button
            ref={triggerRef}
            onClick={toggle}
            className="btn-icon"
            aria-label="Más acciones"
            aria-haspopup="menu"
            aria-expanded={open}
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {createPortal(
            <AnimatePresence>
              {open && pos && (
                <>
                  <button
                    className="fixed inset-0 z-[90] cursor-default"
                    aria-hidden
                    tabIndex={-1}
                    onClick={() => setOpen(false)}
                  />
                  <motion.div
                    role="menu"
                    initial={{ opacity: 0, y: 4, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.98 }}
                    transition={{ duration: 0.13 }}
                    style={{ top: pos.top, right: pos.right }}
                    className="fixed z-[100] w-48 overflow-hidden rounded-xl border border-white/10 bg-ink-900/95 p-1 shadow-2xl shadow-black/60 backdrop-blur"
                  >
                    {items.map((it) => (
                      <button
                        key={it.key}
                        role="menuitem"
                        disabled={it.disabled}
                        onClick={() => {
                          setOpen(false);
                          it.onClick();
                        }}
                        className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-white/5 disabled:opacity-50 ${
                          it.danger ? 'text-brand-300' : 'text-zinc-200'
                        }`}
                      >
                        {it.loading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <it.icon className="h-4 w-4" />
                        )}
                        {it.label}
                      </button>
                    ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>,
            document.body,
          )}
        </>
      ) : (
        <div className="flex items-center gap-1.5">
          {items.map((it) => (
            <button
              key={it.key}
              onClick={it.onClick}
              disabled={it.disabled}
              className={`btn-icon ${it.iconClassName ?? ''}`}
              aria-label={it.label}
              title={it.label}
            >
              {it.loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <it.icon className="h-4 w-4" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
