import {
  BadgeCheck,
  CalendarClock,
  Clock3,
  Euro,
  Gift,
  Mail,
  Phone,
  ShieldCheck,
  SlidersHorizontal,
  Ticket,
  UserPen,
} from 'lucide-react';
import Modal from '../Modal';
import { memberFlags } from './MemberFilters';
import { formatDateES } from '../../lib/dates';
import { memberFullName, type Member } from '../../lib/types';

interface Props {
  member: Member | null;
  courtesyClasses: number;
  onClose: () => void;
  onEditar: (m: Member) => void;
  onPagar: (m: Member) => void;
  onClases: (m: Member) => void;
  onMembresia: (m: Member) => void;
}

/** Fila de dato con icono, para la parte de arriba de la ficha */
function Dato({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: typeof Mail;
  label: string;
  value: string | null;
  href?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
      <Icon className="h-4 w-4 shrink-0 text-zinc-500" />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
        {value ? (
          href ? (
            <a
              href={href}
              className="block truncate text-xs text-zinc-200 underline-offset-2 hover:underline"
            >
              {value}
            </a>
          ) : (
            <p className="truncate text-xs text-zinc-200">{value}</p>
          )
        ) : (
          <p className="truncate text-xs text-zinc-600">Sin indicar</p>
        )}
      </div>
    </div>
  );
}

/**
 * Ficha del socio: todo lo que ya no cabe en la tarjeta compacta (email,
 * teléfono, plan, vencimiento y consumo) más los accesos a cada gestión.
 */
export default function MemberSheet({
  member,
  courtesyClasses,
  onClose,
  onEditar,
  onPagar,
  onClases,
  onMembresia,
}: Props) {
  if (!member) return null;
  const m = member;
  const f = memberFlags(m, courtesyClasses);
  const esAdmin = m.role === 'admin';

  const acciones = [
    { key: 'edit', label: 'Editar datos', icon: UserPen, onClick: () => onEditar(m) },
    { key: 'pay', label: 'Registrar pago', icon: Euro, onClick: () => onPagar(m) },
    { key: 'usage', label: 'Clases y créditos', icon: Ticket, onClick: () => onClases(m) },
    { key: 'manage', label: 'Membresía', icon: SlidersHorizontal, onClick: () => onMembresia(m) },
  ];

  return (
    <Modal open onClose={onClose} title={memberFullName(m)}>
      <div className="space-y-4">
        {/* Identificación y estado */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-xl bg-brand-600/15 px-2.5 py-1 font-display text-xs font-bold text-brand-300 ring-1 ring-brand-500/20">
            #{m.member_no}
          </span>
          {esAdmin ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-300 ring-1 ring-brand-500/30">
              <ShieldCheck className="h-3 w-3" /> Admin
            </span>
          ) : f.effectiveActive ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-300 ring-1 ring-accent-500/25">
              <BadgeCheck className="h-3 w-3" /> Activo
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-300 ring-1 ring-brand-500/20">
              Inactivo
            </span>
          )}
          {!m.activated && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              <Clock3 className="h-3 w-3" /> Sin activar
            </span>
          )}
          {f.inCourtesy && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300 ring-1 ring-amber-500/30">
              <Gift className="h-3 w-3" /> Cortesía · {m.courtesy_used ?? 0}/{courtesyClasses}
            </span>
          )}
        </div>

        {/* Contacto */}
        <div className="grid gap-2 sm:grid-cols-2">
          <Dato
            icon={Mail}
            label="Email"
            value={m.email}
            href={m.email ? `mailto:${m.email}` : undefined}
          />
          <Dato
            icon={Phone}
            label="Teléfono"
            value={m.phone}
            href={m.phone ? `tel:${m.phone.replace(/\s+/g, '')}` : undefined}
          />
        </div>

        {!esAdmin && (
          <>
            {/* Membresía */}
            <div className="grid gap-2 sm:grid-cols-2">
              <Dato icon={Euro} label="Plan" value={m.plan_name ?? 'Cuota estándar'} />
              <Dato
                icon={CalendarClock}
                label={f.pastDue ? 'Venció el' : 'Vence el'}
                value={m.paid_until ? formatDateES(m.paid_until) : null}
              />
            </div>

            {/* Consumo de clases */}
            <div className="grid grid-cols-2 gap-2">
              <div className="card p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  Esta semana
                </p>
                <p className="mt-1 font-display text-base font-bold text-white">
                  {m.week_used ?? 0}
                  <span className="text-sm font-semibold text-zinc-500">/{m.week_limit ?? 0}</span>
                </p>
              </div>
              <div className="card p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  Este mes
                </p>
                <p className="mt-1 font-display text-base font-bold text-white">
                  {m.month_used ?? 0}
                  {m.month_limit != null && (
                    <span className="text-sm font-semibold text-zinc-500">/{m.month_limit}</span>
                  )}
                </p>
              </div>
            </div>

            {/* Accesos a cada gestión */}
            <div className="grid grid-cols-2 gap-2">
              {acciones.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  onClick={a.onClick}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left text-xs font-semibold text-zinc-200 transition hover:bg-white/[0.07] hover:text-white"
                >
                  <a.icon className="h-4 w-4 shrink-0 text-zinc-400" />
                  <span className="min-w-0 flex-1 truncate">{a.label}</span>
                </button>
              ))}
            </div>
          </>
        )}

        <button type="button" onClick={onClose} className="btn-ghost w-full">
          Cerrar
        </button>
      </div>
    </Modal>
  );
}
