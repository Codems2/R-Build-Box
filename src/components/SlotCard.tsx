import { motion } from 'framer-motion';
import { CheckCircle2, Clock, Lock, Users } from 'lucide-react';
import type { ClassType, ScheduleSlot } from '../lib/types';
import { KIND_META, endTime, formatTime, slotColor, slotTitle } from '../lib/types';

interface Props {
  slot: ScheduleSlot;
  classTypes: ClassType[];
  /** Versión reducida para las columnas de la vista semanal de escritorio */
  compact?: boolean;
  /** Plazas ocupadas en la próxima sesión */
  count?: number;
  /** El visitante ya está apuntado a la próxima sesión */
  booked?: boolean;
  /** Texto si la clase aún no es reservable (fuera de la ventana) */
  lockLabel?: string;
  onClick?: () => void;
}

function occupancyLabel(slot: ScheduleSlot, count: number | undefined) {
  if (slot.capacity == null || count === undefined) return null;
  const free = Math.max(0, slot.capacity - count);
  if (free <= 0) return { text: 'Completa', full: true };
  return { text: `${free} ${free === 1 ? 'plaza' : 'plazas'} libres`, full: false };
}

export default function SlotCard({
  slot,
  classTypes,
  compact = false,
  count,
  booked = false,
  lockLabel,
  onClick,
}: Props) {
  const color = slotColor(slot, classTypes);
  const kind = KIND_META[slot.kind];
  const type = classTypes.find((t) => t.id === slot.class_type_id);
  const occupancy = occupancyLabel(slot, count);

  const interactive = onClick
    ? {
        role: 'button' as const,
        tabIndex: 0,
        onClick,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        },
        whileTap: { scale: 0.985 },
      }
    : {};

  if (compact) {
    return (
      <motion.article
        layout
        whileHover={{ y: -3, transition: { duration: 0.18 } }}
        {...interactive}
        aria-disabled={lockLabel ? true : undefined}
        className={`card group relative overflow-hidden p-3 ${onClick ? 'cursor-pointer' : ''} ${
          lockLabel ? 'opacity-55' : ''
        }`}
      >
        <span
          className="absolute inset-y-0 left-0 w-1 rounded-r-full"
          style={{ backgroundColor: color }}
          aria-hidden
        />
        <div className="pl-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-display text-sm font-bold" style={{ color }}>
              {formatTime(slot.start_time)}
            </span>
            <span className="flex items-center gap-1.5">
              {booked && <CheckCircle2 className="h-3.5 w-3.5 text-accent-400" />}
              {slot.kind !== 'regular' && (
                <span className={`h-2 w-2 shrink-0 rounded-full ${kind.dotClass}`} title={kind.label} />
              )}
            </span>
          </div>
          <h3 className="mt-1 line-clamp-2 text-[13px] font-semibold leading-snug text-white">
            {slotTitle(slot, classTypes)}
          </h3>
          <p className="mt-1 text-[11px] text-zinc-500">
            {slot.duration_min} min
            {occupancy && (
              <>
                {' · '}
                <span className={occupancy.full ? 'font-semibold text-brand-300' : 'text-zinc-400'}>
                  {occupancy.text}
                </span>
              </>
            )}
          </p>
          {lockLabel && (
            <p className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-zinc-500">
              <Lock className="h-2.5 w-2.5" /> {lockLabel}
            </p>
          )}
        </div>
        <div
          className="pointer-events-none absolute -right-8 -top-8 h-20 w-20 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-25"
          style={{ backgroundColor: color }}
          aria-hidden
        />
      </motion.article>
    );
  }

  return (
    <motion.article
      layout
      whileHover={onClick ? { y: -3, transition: { duration: 0.18 } } : undefined}
      {...interactive}
      aria-disabled={lockLabel ? true : undefined}
      className={`card group relative overflow-hidden p-4 ${onClick ? 'cursor-pointer' : ''} ${
        lockLabel ? 'opacity-55' : ''
      }`}
    >
      <span
        className="absolute inset-y-0 left-0 w-1 rounded-r-full"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <div className="flex items-start justify-between gap-3 pl-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-[15px] font-bold leading-snug text-white">
              {slotTitle(slot, classTypes)}
            </h3>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${kind.badgeClass}`}
            >
              {kind.label}
            </span>
            {booked && (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-300 ring-1 ring-accent-500/30">
                <CheckCircle2 className="h-3 w-3" /> Apuntado
              </span>
            )}
          </div>
          {(type?.description || slot.note) && (
            <p className="mt-1 line-clamp-2 text-xs text-zinc-400">
              {slot.note ?? type?.description}
            </p>
          )}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-300">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-zinc-500" />
              {formatTime(slot.start_time)} – {endTime(slot.start_time, slot.duration_min)}
              <span className="text-zinc-500">· {slot.duration_min} min</span>
            </span>
            {occupancy ? (
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-zinc-500" />
                <span className={occupancy.full ? 'font-semibold text-brand-300' : ''}>
                  {occupancy.text}
                </span>
              </span>
            ) : (
              slot.capacity != null && (
                <span className="inline-flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-zinc-500" />
                  {slot.capacity === 1 ? 'Individual' : `${slot.capacity} plazas`}
                </span>
              )
            )}
            {lockLabel && (
              <span className="inline-flex items-center gap-1 text-zinc-500">
                <Lock className="h-3 w-3" /> {lockLabel}
              </span>
            )}
          </div>
        </div>
        <div
          className="mt-0.5 hidden shrink-0 rounded-xl px-2.5 py-1.5 text-right font-display text-sm font-bold sm:block"
          style={{ color, backgroundColor: `${color}1A` }}
        >
          {formatTime(slot.start_time)}
        </div>
      </div>
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-0 blur-3xl transition-opacity duration-300 group-hover:opacity-25"
        style={{ backgroundColor: color }}
        aria-hidden
      />
    </motion.article>
  );
}
