import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarCheck, Check, Clock, Coins, Lock, Ticket, Users } from 'lucide-react';
import Modal from './Modal';
import { BookingError, bookClass, cancelMyBooking } from '../lib/api';
import { formatDateES } from '../lib/dates';
import { useAuth } from '../lib/auth';
import {
  KIND_META,
  endTime,
  formatTime,
  slotColor,
  slotTitle,
  type ClassType,
  type ScheduleSlot,
} from '../lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  slot: ScheduleSlot | null;
  classDate: string | null;
  classTypes: ClassType[];
  count: number;
  /** Id de mi reserva para esta sesión, si ya estoy apuntado */
  myBookingId: string | null;
  /** Refresca ocupación, mis reservas y créditos tras reservar/cancelar */
  onChanged: () => void;
}

type Phase = 'idle' | 'saving' | 'done';

export default function BookingModal({
  open,
  onClose,
  slot,
  classDate,
  classTypes,
  count,
  myBookingId,
  onChanged,
}: Props) {
  const { profile } = useAuth();
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [justBooked, setJustBooked] = useState(false);

  useEffect(() => {
    if (open) {
      setPhase('idle');
      setError(null);
      setJustBooked(false);
    }
  }, [open, slot, classDate]);

  if (!slot || !classDate) return null;

  const color = slotColor(slot, classTypes);
  const kind = KIND_META[slot.kind];
  const free = slot.capacity != null ? Math.max(0, slot.capacity - count) : null;
  const full = free !== null && free <= 0;
  const booked = Boolean(myBookingId);
  const credits = profile?.credits ?? 0;
  const active = profile?.membership_active ?? false;
  const canBook = active && credits > 0 && !full;

  async function handleBook() {
    if (!slot || !classDate) return;
    setPhase('saving');
    setError(null);
    try {
      await bookClass(slot.id, classDate);
      setJustBooked(true);
      setPhase('done');
      onChanged();
    } catch (err) {
      setPhase('idle');
      setError(err instanceof BookingError ? err.message : 'No se pudo completar la reserva.');
      onChanged();
    }
  }

  async function handleCancel() {
    if (!myBookingId) return;
    setPhase('saving');
    setError(null);
    try {
      await cancelMyBooking(myBookingId);
      onChanged();
      onClose();
    } catch (err) {
      setPhase('idle');
      setError(err instanceof BookingError ? err.message : 'No se pudo cancelar.');
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={booked ? 'Tu reserva' : 'Reservar clase'}>
      {/* Resumen de la sesión */}
      <div className="card relative mb-5 overflow-hidden p-4">
        <span
          className="absolute inset-y-0 left-0 w-1 rounded-r-full"
          style={{ backgroundColor: color }}
          aria-hidden
        />
        <div className="pl-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-base font-bold text-white">
              {slotTitle(slot, classTypes)}
            </h3>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${kind.badgeClass}`}
            >
              {kind.label}
            </span>
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-300">
            <span className="inline-flex items-center gap-1.5 capitalize">
              <CalendarCheck className="h-3.5 w-3.5 text-zinc-500" />
              {formatDateES(classDate)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-zinc-500" />
              {formatTime(slot.start_time)} – {endTime(slot.start_time, slot.duration_min)}
            </span>
          </p>
          {slot.capacity != null && (
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1.5 text-zinc-400">
                  <Users className="h-3.5 w-3.5" /> Ocupación
                </span>
                <span className={full ? 'font-semibold text-brand-300' : 'text-zinc-300'}>
                  {full ? 'Completa' : `${free} ${free === 1 ? 'plaza libre' : 'plazas libres'}`}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, (count / slot.capacity) * 100)}%` }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                  className="h-full rounded-full"
                  style={{ backgroundColor: full ? '#D92B53' : color }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {booked ? (
        /* Ya apuntado */
        <div className="space-y-4 text-center">
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18 }}
            className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-500/15 ring-2 ring-accent-500/40"
          >
            <Check className="h-7 w-7 text-accent-400" />
          </motion.div>
          <div>
            <p className="font-display text-base font-bold text-white">
              {justBooked ? '¡Plaza reservada!' : 'Estás apuntado'}
            </p>
            <p className="mt-1 text-sm text-zinc-400">Te esperamos en el box. 🥊</p>
          </div>
          {error && <p className="text-sm text-brand-300">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => void handleCancel()}
              disabled={phase === 'saving'}
              className="btn-ghost flex-1 hover:!text-brand-300"
            >
              {phase === 'saving' ? 'Cancelando…' : 'Cancelar (recupero crédito)'}
            </button>
            <button onClick={onClose} className="btn-primary flex-1">
              Listo
            </button>
          </div>
        </div>
      ) : (
        /* Reservar con crédito */
        <div className="space-y-4">
          {/* Estado de créditos */}
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <span className="inline-flex items-center gap-2 text-sm text-zinc-300">
              <Coins className="h-4 w-4 text-amber-400" /> Tus créditos
            </span>
            <span className="font-display text-lg font-bold text-white">
              {credits}
              {profile?.weekly_credits ? (
                <span className="text-xs font-medium text-zinc-500"> / {profile.weekly_credits}</span>
              ) : null}
            </span>
          </div>

          {!active ? (
            <Notice
              icon={<Lock className="h-4 w-4" />}
              tone="warn"
              text="Tu cuenta está inactiva. Ponte al día con el pago en el box para poder reservar."
            />
          ) : credits <= 0 ? (
            <Notice
              icon={<Coins className="h-4 w-4" />}
              tone="warn"
              text="No te quedan créditos esta semana. Se renuevan automáticamente cada semana."
            />
          ) : full ? (
            <Notice
              icon={<Users className="h-4 w-4" />}
              tone="warn"
              text="Esta sesión está completa. Prueba con otro horario."
            />
          ) : (
            <p className="text-center text-xs text-zinc-500">
              Reservar esta clase usará <span className="font-semibold text-zinc-300">1 crédito</span>.
              Podrás cancelar y recuperarlo si la clase no ha empezado.
            </p>
          )}

          {error && <p className="text-center text-sm text-brand-300">{error}</p>}

          <div className="flex gap-2">
            <button onClick={onClose} className="btn-ghost flex-1">
              Volver
            </button>
            <button
              onClick={() => void handleBook()}
              disabled={!canBook || phase === 'saving'}
              className="btn-primary flex-1"
            >
              <Ticket className="h-4 w-4" />
              {phase === 'saving' ? 'Reservando…' : 'Reservar (1 crédito)'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Notice({
  icon,
  text,
  tone,
}: {
  icon: React.ReactNode;
  text: string;
  tone: 'warn';
}) {
  const cls =
    tone === 'warn'
      ? 'border-amber-500/20 bg-amber-500/10 text-amber-300'
      : 'border-white/10 bg-white/[0.03] text-zinc-300';
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border p-3 text-xs leading-relaxed ${cls}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>{text}</span>
    </div>
  );
}
