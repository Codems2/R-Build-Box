import { motion } from 'framer-motion';
import { Clock, Users } from 'lucide-react';
import type { ClassType, ScheduleSlot } from '../lib/types';
import { KIND_META, endTime, formatTime, slotColor, slotTitle } from '../lib/types';

interface Props {
  slot: ScheduleSlot;
  classTypes: ClassType[];
  /** Versión reducida para las columnas de la vista semanal de escritorio */
  compact?: boolean;
}

export default function SlotCard({ slot, classTypes, compact = false }: Props) {
  const color = slotColor(slot, classTypes);
  const kind = KIND_META[slot.kind];
  const type = classTypes.find((t) => t.id === slot.class_type_id);

  if (compact) {
    return (
      <motion.article
        layout
        whileHover={{ y: -3, transition: { duration: 0.18 } }}
        className="card group relative overflow-hidden p-3"
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
            {slot.kind !== 'regular' && (
              <span className={`h-2 w-2 shrink-0 rounded-full ${kind.dotClass}`} title={kind.label} />
            )}
          </div>
          <h3 className="mt-1 line-clamp-2 text-[13px] font-semibold leading-snug text-white">
            {slotTitle(slot, classTypes)}
          </h3>
          <p className="mt-1 text-[11px] text-zinc-500">
            {slot.duration_min} min
            {slot.capacity != null && (
              <> · {slot.capacity === 1 ? 'individual' : `${slot.capacity} plazas`}</>
            )}
          </p>
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
      whileHover={{ y: -3, transition: { duration: 0.18 } }}
      className="card group relative overflow-hidden p-4"
    >
      <span
        className="absolute inset-y-0 left-0 w-1 rounded-r-full"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <div className="flex items-start justify-between gap-3 pl-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-display text-[15px] font-bold text-white">
              {slotTitle(slot, classTypes)}
            </h3>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${kind.badgeClass}`}
            >
              {kind.label}
            </span>
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
            {slot.capacity != null && (
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-zinc-500" />
                {slot.capacity === 1 ? 'Individual' : `${slot.capacity} plazas`}
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
