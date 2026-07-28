import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  CalendarCheck,
  CalendarClock,
  Check,
  Clock,
  Coins,
  Lock,
  Ticket,
  Users,
  X,
} from 'lucide-react';
import Modal from './Modal';
import { BookingError, bookClass, cancelMyBooking } from '../lib/api';
import { BOOKING_WINDOW_DAYS, daysFromTodayISO, formatDateES, shiftISO } from '../lib/dates';
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

type Phase = 'idle' | 'saving' | 'done' | 'cancelled';

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
  const [refunded, setRefunded] = useState(false);
  const [confirmNoRefund, setConfirmNoRefund] = useState(false);

  useEffect(() => {
    if (open) {
      setPhase('idle');
      setError(null);
      setJustBooked(false);
      setRefunded(false);
      setConfirmNoRefund(false);
    }
  }, [open, slot, classDate]);

  if (!slot || !classDate) return null;

  const color = slotColor(slot, classTypes);
  const kind = KIND_META[slot.kind];
  const free = slot.capacity != null ? Math.max(0, slot.capacity - count) : null;
  const full = free !== null && free <= 0;
  const booked = Boolean(myBookingId);
  const isAdmin = profile?.role === 'admin';
  const unlimited = isAdmin; // los admins reservan siempre y sin gastar créditos
  const credits = profile?.credits ?? 0;
  const active = unlimited || (profile?.membership_active ?? false);
  // ¿La cancelación devolvería el crédito? Solo con más de 2 h de antelación.
  const classStartMs = new Date(`${classDate}T${slot.start_time}:00`).getTime();
  const willRefund = Date.now() < classStartMs - 2 * 60 * 60 * 1000;
  // Ventana de reserva: solo hoy y hasta 2 días (los admins la ignoran)
  const daysAhead = daysFromTodayISO(classDate);
  const tooFar = !unlimited && daysAhead > BOOKING_WINDOW_DAYS;
  const opensOn = shiftISO(classDate, -BOOKING_WINDOW_DAYS);
  const canBook = active && (unlimited || credits > 0) && !full && !tooFar;

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
    // Socio que perdería el crédito: pedir confirmación antes de cancelar
    if (!unlimited && !willRefund && !confirmNoRefund) {
      setConfirmNoRefund(true);
      return;
    }
    setPhase('saving');
    setError(null);
    try {
      const wasRefunded = await cancelMyBooking(myBookingId);
      setRefunded(wasRefunded);
      setPhase('cancelled');
      onChanged();
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

      {phase === 'cancelled' ? (
        /* Resultado de la cancelación */
        <div className="space-y-4 text-center">
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18 }}
            className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ring-2 ${
              refunded ? 'bg-accent-500/15 ring-accent-500/40' : 'bg-amber-500/15 ring-amber-500/40'
            }`}
          >
            <X className={`h-7 w-7 ${refunded ? 'text-accent-400' : 'text-amber-400'}`} />
          </motion.div>
          <div>
            <p className="font-display text-base font-bold text-white">Reserva cancelada</p>
            <p className="mt-1 text-sm text-zinc-400">
              {refunded
                ? 'Se te ha devuelto 1 crédito.'
                : 'Al cancelar con menos de 2 horas, no se devuelve el crédito.'}
            </p>
          </div>
          <button onClick={onClose} className="btn-primary w-full">
            Listo
          </button>
        </div>
      ) : booked ? (
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

          {confirmNoRefund ? (
            /* Confirmación cuando el socio va a perder el crédito */
            <>
              <div className="flex items-start gap-2.5 rounded-xl border border-brand-500/40 bg-brand-500/10 p-3 text-left text-sm leading-relaxed text-brand-100">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-brand-300" />
                <span>
                  Al cancelar la reserva con tan poca antelación{' '}
                  <strong>no te devolveremos el crédito</strong>. ¿Estás seguro?
                </span>
              </div>
              {error && <p className="text-sm text-brand-300">{error}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmNoRefund(false)}
                  disabled={phase === 'saving'}
                  className="btn-ghost flex-1"
                >
                  No, volver
                </button>
                <button
                  onClick={() => void handleCancel()}
                  disabled={phase === 'saving'}
                  className="btn-primary flex-1"
                >
                  {phase === 'saving' ? 'Cancelando…' : 'Sí, cancelar'}
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Aviso de la política de cancelación (solo socios con créditos) */}
              {!unlimited && (
                <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-left text-xs leading-relaxed text-amber-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  <span>
                    {willRefund ? (
                      <>
                        Si cancelas ahora (más de 2 horas antes) <strong>recuperas tu crédito</strong>.
                      </>
                    ) : (
                      <>
                        Quedan menos de 2 horas para la clase: si cancelas,{' '}
                        <strong>no se te devolverá el crédito</strong>.
                      </>
                    )}
                  </span>
                </div>
              )}

              {error && <p className="text-sm text-brand-300">{error}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => void handleCancel()}
                  disabled={phase === 'saving'}
                  className="btn-ghost flex-1 hover:!text-brand-300"
                >
                  {phase === 'saving' ? 'Cancelando…' : 'Cancelar reserva'}
                </button>
                <button onClick={onClose} className="btn-primary flex-1">
                  Listo
                </button>
              </div>
            </>
          )}
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
              {unlimited ? (
                <span className="text-amber-300">∞</span>
              ) : (
                <>
                  {credits}
                  {profile?.weekly_credits ? (
                    <span className="text-xs font-medium text-zinc-500"> / {profile.weekly_credits}</span>
                  ) : null}
                </>
              )}
            </span>
          </div>

          {!active ? (
            <Notice
              icon={<Lock className="h-4 w-4" />}
              tone="warn"
              text="Tu cuenta está inactiva. Ponte al día con el pago en el box para poder reservar."
            />
          ) : tooFar ? (
            <Notice
              icon={<CalendarClock className="h-4 w-4" />}
              tone="warn"
              text={`Todavía no puedes reservar esta clase. Las reservas se abren 2 días antes: a partir del ${formatDateES(opensOn)}.`}
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
          ) : unlimited ? (
            <p className="text-center text-xs text-zinc-500">
              Como administrador puedes reservar cualquier clase, sin gastar créditos.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-center text-xs text-zinc-500">
                Reservar esta clase usará <span className="font-semibold text-zinc-300">1 crédito</span>.
              </p>
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                <span>
                  <strong>Importante:</strong> solo se devuelve el crédito si cancelas con{' '}
                  <strong>más de 2 horas</strong> de antelación. Con menos de 2 horas, perderás el
                  crédito.
                </span>
              </div>
            </div>
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
