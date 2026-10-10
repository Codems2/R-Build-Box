import { useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { daysFromTodayISO } from '../../lib/dates';
import { memberFullName, type Member } from '../../lib/types';

/** Días de antelación con los que un vencimiento se considera «pronto» */
export const SOON_DAYS = 7;

export type EstadoKey =
  | 'todos'
  | 'al_dia'
  | 'vence_pronto'
  | 'vencidos'
  | 'sin_activar'
  | 'inactivos';

export type OrdenKey = 'numero' | 'nombre' | 'vencimiento' | 'clases';

const ESTADOS: { key: EstadoKey; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'al_dia', label: 'Al día' },
  { key: 'vence_pronto', label: 'Vence pronto' },
  { key: 'vencidos', label: 'Vencidos' },
  { key: 'sin_activar', label: 'Sin activar' },
  { key: 'inactivos', label: 'Inactivos' },
];

const ORDENES: { key: OrdenKey; label: string }[] = [
  { key: 'numero', label: 'Nº de socio' },
  { key: 'nombre', label: 'Nombre A-Z' },
  { key: 'vencimiento', label: 'Vencimiento más próximo' },
  { key: 'clases', label: 'Clases esta semana' },
];

/** Situación de un socio, con el mismo criterio que usan las tarjetas */
export interface MemberFlags {
  pastDue: boolean;
  soon: boolean;
  /** Activo de verdad: activo y sin haber agotado la cortesía con el mes vencido */
  effectiveActive: boolean;
  inCourtesy: boolean;
}

export function memberFlags(m: Member, courtesyClasses: number): MemberFlags {
  const days = m.paid_until ? daysFromTodayISO(m.paid_until) : null;
  const pastDue = days !== null && days < 0;
  const used = m.courtesy_used ?? 0;
  const courtesyExhausted = pastDue && used >= courtesyClasses;
  return {
    pastDue,
    soon: days !== null && days >= 0 && days <= SOON_DAYS,
    effectiveActive: m.membership_active && !courtesyExhausted,
    inCourtesy: Boolean(m.membership_active) && pastDue && courtesyClasses > 0 && used < courtesyClasses,
  };
}

/** ¿Encaja el socio en el filtro de estado? Los admins solo salen en «Todos». */
export function matchesEstado(m: Member, key: EstadoKey, f: MemberFlags): boolean {
  if (key === 'todos') return true;
  if (m.role === 'admin') return false;
  switch (key) {
    case 'al_dia':
      return m.activated && f.effectiveActive && !f.pastDue;
    case 'vence_pronto':
      return f.soon && f.effectiveActive;
    case 'vencidos':
      return f.pastDue;
    case 'sin_activar':
      return !m.activated;
    case 'inactivos':
      return !f.effectiveActive;
    default:
      return true;
  }
}

/** Texto sin tildes y en minúsculas, para buscar sin que importen los acentos */
const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function matchesQuery(m: Member, query: string): boolean {
  const q = norm(query.trim());
  if (!q) return true;
  const campos = [memberFullName(m), m.email ?? '', m.phone ?? '', `#${m.member_no}`];
  return campos.some((c) => norm(c).includes(q));
}

export function ordenar(list: Member[], orden: OrdenKey): Member[] {
  const out = [...list];
  switch (orden) {
    case 'nombre':
      return out.sort((a, b) => memberFullName(a).localeCompare(memberFullName(b), 'es'));
    case 'vencimiento':
      // Sin fecha de pago al final; el resto, del vencimiento más próximo al más lejano
      return out.sort((a, b) => {
        if (!a.paid_until && !b.paid_until) return a.member_no - b.member_no;
        if (!a.paid_until) return 1;
        if (!b.paid_until) return -1;
        return a.paid_until.localeCompare(b.paid_until);
      });
    case 'clases':
      return out.sort((a, b) => (b.week_used ?? 0) - (a.week_used ?? 0) || a.member_no - b.member_no);
    default:
      return out.sort((a, b) => a.member_no - b.member_no);
  }
}

interface Props {
  query: string;
  onQuery: (v: string) => void;
  estado: EstadoKey;
  onEstado: (k: EstadoKey) => void;
  orden: OrdenKey;
  onOrden: (k: OrdenKey) => void;
  counts: Record<EstadoKey, number>;
  visibles: number;
  total: number;
  onReset: () => void;
}

/**
 * Buscador + filtros de estado + orden de la lista de socios.
 *
 * En PC los chips y el orden comparten fila; en móvil el buscador ocupa el
 * ancho, los chips se deslizan en horizontal y el orden baja a su propia línea.
 */
export default function MemberFilters({
  query,
  onQuery,
  estado,
  onEstado,
  orden,
  onOrden,
  counts,
  visibles,
  total,
  onReset,
}: Props) {
  const chipsRef = useRef<HTMLDivElement>(null);
  const activoRef = useRef<HTMLButtonElement>(null);

  // Deja a la vista el chip seleccionado cuando la fila se desliza (móvil)
  useEffect(() => {
    const cont = chipsRef.current;
    const el = activoRef.current;
    if (!cont || !el) return;
    const left = el.offsetLeft - (cont.clientWidth - el.clientWidth) / 2;
    cont.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }, [estado]);

  const filtrado = query.trim() !== '' || estado !== 'todos';

  return (
    <div className="mb-3 space-y-2">
      {/* Buscador */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <input
          className="input pl-10 pr-10"
          placeholder="Buscar por nombre, email o teléfono"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          aria-label="Buscar socio"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQuery('')}
            aria-label="Limpiar búsqueda"
            className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-white/[0.07] text-zinc-400 transition hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Estado + orden */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div
          ref={chipsRef}
          className="-mx-0.5 flex gap-2 overflow-x-auto px-0.5 pb-0.5 [scrollbar-width:none] sm:min-w-0 sm:flex-1 [&::-webkit-scrollbar]:hidden"
        >
          {ESTADOS.map((e) => {
            const activo = e.key === estado;
            return (
              <button
                key={e.key}
                ref={activo ? activoRef : undefined}
                type="button"
                onClick={() => onEstado(e.key)}
                aria-pressed={activo}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  activo
                    ? 'border-brand-500/60 bg-brand-600/20 text-white'
                    : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {e.label}
                <span
                  className={`rounded-full px-1.5 text-[10px] tabular-nums ${
                    activo ? 'bg-white/20 text-white' : 'bg-white/5 text-zinc-500'
                  }`}
                >
                  {counts[e.key]}
                </span>
              </button>
            );
          })}
        </div>

        <select
          className="input sm:w-auto sm:max-w-[15rem] sm:shrink-0"
          value={orden}
          onChange={(e) => onOrden(e.target.value as OrdenKey)}
          aria-label="Ordenar socios"
        >
          {ORDENES.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Resultado del filtro */}
      {filtrado && (
        <div className="flex items-center justify-between gap-2 px-0.5">
          <p className="text-[11px] text-zinc-500">
            Mostrando <span className="font-semibold text-zinc-300">{visibles}</span> de {total}{' '}
            {total === 1 ? 'socio' : 'socios'}
          </p>
          <button
            type="button"
            onClick={onReset}
            className="text-[11px] font-semibold text-brand-300 transition hover:text-brand-200"
          >
            Quitar filtros
          </button>
        </div>
      )}
    </div>
  );
}
