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

/** Separación entre el botón y el menú, y margen mínimo con el borde */
const GAP = 6;
const MARGIN = 8;
/** Alto aproximado de una opción y padding del contenedor (para estimar) */
const ITEM_H = 38;
const MENU_PADDING = 8;
/** Alto mínimo del menú: por debajo de esto hace scroll interno */
const MIN_MENU_H = 120;

interface MenuPos {
  /** Se despliega hacia arriba porque abajo no cabe */
  up: boolean;
  top?: number;
  bottom?: number;
  right: number;
  maxHeight: number;
}

const samePos = (a: MenuPos | null, b: MenuPos) =>
  a != null &&
  a.up === b.up &&
  a.top === b.top &&
  a.bottom === b.bottom &&
  a.right === b.right &&
  Math.abs(a.maxHeight - b.maxHeight) < 1;

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
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<MenuPos | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const on = () => setSmall(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  /**
   * Coloca el menú junto al botón. Por defecto se abre hacia abajo, pero si no
   * cabe (las últimas tarjetas de la lista quedan pegadas al borde inferior) se
   * despliega hacia arriba. Si tampoco cabe ahí, se limita la altura y el menú
   * hace scroll, de modo que nunca se corta ninguna opción.
   */
  const computePos = (height?: number): MenuPos | null => {
    const t = triggerRef.current;
    if (!t) return null;
    const r = t.getBoundingClientRect();
    const vh = window.innerHeight;
    const below = vh - r.bottom - GAP - MARGIN;
    const above = r.top - GAP - MARGIN;
    // Sin medir aún, estimamos la altura por el número de opciones
    const needed = height ?? items.length * ITEM_H + MENU_PADDING;
    const up = needed > below && above > below;
    const space = Math.max(MIN_MENU_H, up ? above : below);
    return {
      up,
      top: up ? undefined : r.bottom + GAP,
      bottom: up ? vh - r.top + GAP : undefined,
      right: Math.max(MARGIN, window.innerWidth - r.right),
      maxHeight: Math.min(space, Math.max(needed, MIN_MENU_H)),
    };
  };

  const toggle = () => {
    if (!open) setPos(computePos());
    setOpen((v) => !v);
  };

  // Una vez pintado, se recoloca con la altura real (la estimación puede
  // quedarse corta si alguna opción ocupa dos líneas).
  useLayoutEffect(() => {
    if (!open) return;
    const el = menuRef.current;
    if (!el) return;
    const next = computePos(el.scrollHeight + MENU_PADDING);
    if (next) setPos((p) => (samePos(p, next) ? p : next));
    // Solo al abrir: después el menú se cierra con scroll o resize
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
    // Si el propio menú tiene scroll interno (pantallas muy bajas), moverlo
    // dentro no debe cerrarlo: solo cierra el scroll de la página.
    const onScroll = (e: Event) => {
      const el = menuRef.current;
      if (el && e.target instanceof Node && el.contains(e.target)) return;
      close();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  return (
    <div ref={hostRef} className="relative shrink-0">
      {/* Medidor oculto: misma pinta que los botones en línea, para saber su
          anchura real. Va dentro de una caja 0×0 con overflow-hidden para que
          NUNCA aporte scroll horizontal a la página (antes, al ser absolute y
          opacity-0, seguía ensanchando el documento en móvil). scrollWidth del
          hijo sigue midiendo su anchura natural aunque esté recortado. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 -z-10 h-0 w-0 overflow-hidden opacity-0"
      >
        <div ref={measureRef} className="flex gap-1.5">
          {items.map((it) => (
            <span key={it.key} className="btn-icon">
              <it.icon className="h-4 w-4" />
            </span>
          ))}
        </div>
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
                    ref={menuRef}
                    role="menu"
                    initial={{ opacity: 0, y: pos.up ? -4 : 4, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: pos.up ? -4 : 4, scale: 0.98 }}
                    transition={{ duration: 0.13 }}
                    style={{
                      top: pos.top,
                      bottom: pos.bottom,
                      right: pos.right,
                      maxHeight: pos.maxHeight,
                    }}
                    className="fixed z-[100] w-48 overflow-y-auto overscroll-contain rounded-xl border border-white/10 bg-ink-900/95 p-1 shadow-2xl shadow-black/60 backdrop-blur"
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
