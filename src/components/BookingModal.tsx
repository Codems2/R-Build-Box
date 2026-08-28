import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  CalendarCheck,
  CalendarClock,
  Check,
  Clock,
  Gift,
  Loader2,
  Lock,
  ShieldCheck,
  Ticket,
  Users,
  X,
} from 'lucide-react';
import Modal from './Modal';
import { BookingError, bookClass, cancelMyBooking, fetchWeekStatus } from '../lib/api';
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
  type WeekStatus,
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
  /** Estado de mensualidad del socio (al día / cortesía / inactivo) */
  memberStatus?: 'ok' | 'courtesy' | 'inactive';
  /** Clases de cortesía que le quedan (si está en cortesía) */
  courtesyLeft?: number;
  /** Máximo de clases de cortesía configurado */
  courtesyLimit?: number;
  /** Inactivo por haber agotado las clases de cortesía */
  courtesyExhausted?: boolean;
  /** Refresca ocupación y mis reservas tras reservar/cancelar */
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
  memberStatus,
  courtesyLeft,
  courtesyLimit,
  courtesyExhausted,
  onChanged,
}: Props) {
  const { profile, refreshProfile } = useAuth();
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [justBooked, setJustBooked] = useState(false);
  const [week, setWeek] = useState<WeekStatus | null>(null);
  const [confirmPenalty, setConfirmPenalty] = useState(false);
  const [penalized, setPenalized] = useState(false);

  const isAdmin = profile?.role === 'admin';
  const unlimited = isAdmin || (week?.unlimited ?? false);

  // Estado semanal de la semana de ESTA clase (puede diferir de la actual)
  useEffect(() => {
    if (!open || !classDate) return;
    setPhase('idle');
    setError(null);
    setJustBooked(false);
    setWeek(null);
    setConfirmPenalty(false);
    setPenalized(false);
    let active = true;
    void fetchWeekStatus(classDate)
      .then((w) => active && setWeek(w))
      .catch(() => active && setWeek(null));
    return () => {
      active = false;
    };
  }, [open, slot, classDate]);

  if (!slot || !classDate) return null;

  const color = slotColor(slot, classTypes);
  const kind = KIND_META[slot.kind];
  const free = slot.capacity != null ? Math.max(0, slot.capacity - count) : null;
  const full = free !== null && free <= 0;
  const booked = Boolean(myBookingId);
  // Estado efectivo: si el padre nos pasa memberStatus lo usamos (contempla la
  // cortesía agotada, en la que membership_active sigue en true); si no, caemos
  // al flag directo.
  const effectiveInactive = memberStatus ? memberStatus === 'inactive' : !(profile?.membership_active ?? false);
  const active = unlimited || !effectiveInactive;
  const inCourtesy = !unlimited && memberStatus === 'courtesy';
  const remaining = week ? Math.max(0, week.limit - week.used) : null;
  // Penalización por cancelación tardía: dentro de la última hora (o ya empezada)
  const classStartMs = new Date(`${classDate}T${slot.start_time}:00`).getTime();
  const willPenalize = !unlimited && Date.now() >= classStartMs - 60 * 60 * 1000;
  const reachedLimit = !unlimited && week != null && week.used >= week.limit;
  // Ventana de reserva: solo hoy y hasta 2 días (los admins la ignoran)
  const daysAhead = daysFromTodayISO(classDate);
  const tooFar = !unlimited && daysAhead > BOOKING_WINDOW_DAYS;
  const opensOn = shiftISO(classDate, -BOOKING_WINDOW_DAYS);
  // Para socios hace falta conocer el estado semanal antes de permitir reservar
  const canBook =
    active && !full && !tooFar && !reachedLimit && (unlimited || week != null);

  async function handleBook() {
    if (!slot || !classDate) return;
    setPhase('saving');
    setError(null);
    try {
      await bookClass(slot.id, classDate);
      setJustBooked(true);
      setPhase('done');
      await refreshProfile();
      onChanged();
    } catch (err) {
      setPhase('idle');
      setError(err instanceof BookingError ? err.message : 'No se pudo completar la reserva.');
      onChanged();
    }
  }

  async function handleCancel() {
    if (!myBookingId) return;
    // Si la cancelación penaliza (pierde la clase), pedir confirmación primero
    if (willPenalize && !confirmPenalty) {
      setConfirmPenalty(true);
      return;
    }
    setPhase('saving');
    setError(null);
    try {
      const wasPenalized = await cancelMyBooking(myBookingId);
      setPenalized(wasPenalized);
      setPhase('cancelled');
      await refreshProfile();
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
              penalized ? 'bg-brand-500/15 ring-brand-500/40' : 'bg-accent-500/15 ring-accent-500/40'
            }`}
          >
            <X className={`h-7 w-7 ${penalized ? 'text-brand-300' : 'text-accent-400'}`} />
          </motion.div>
          <div>
            <p className="font-display text-base font-bold text-white">Reserva cancelada</p>
            <p className="mt-1 text-sm text-zinc-400">
              {penalized
                ? 'Al cancelar dentro de la última hora, esta clase cuenta como usada en tu semana.'
                : 'Has liberado tu plaza y recuperado una clase de esta semana.'}
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

          {confirmPenalty ? (
            /* Confirmación: la cancelación tardía hace perder la clase */
            <>
              <div className="flex items-start gap-2.5 rounded-xl border border-brand-500/40 bg-brand-500/10 p-3 text-left text-sm leading-relaxed text-brand-100">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-brand-300" />
                <span>
                  Queda menos de <strong>1 hora</strong> para la clase. Si cancelas ahora{' '}
                  <strong>perderás esta clase</strong>: contará como usada en tu límite de esta
                  semana. ¿Seguro que quieres cancelar?
                </span>
              </div>
              {error && <p className="text-sm text-brand-300">{error}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmPenalty(false)}
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
              {willPenalize && (
                <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-left text-xs leading-relaxed text-amber-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  <span>
                    Queda menos de 1 hora para la clase: si cancelas ahora,{' '}
                    <strong>perderás esta clase de tu semana</strong>.
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
      ) : isAdmin ? (
        /* Admin: no reserva plazas para sí; se derivan los invitados al panel */
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] p-3.5 text-xs leading-relaxed text-zinc-300">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-300" />
            <span>
              Como administrador no reservas plazas para ti. Para apuntar a un{' '}
              <strong className="text-white">cliente invitado</strong> (p. ej. la primera clase
              gratis), hazlo desde el <strong className="text-white">panel de administración → Clases</strong>.
            </span>
          </div>
          <button onClick={onClose} className="btn-primary w-full">
            Cerrar
          </button>
        </div>
      ) : (
        /* Reservar */
        <div className="space-y-4">
          {/* Clases de la semana */}
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <span className="inline-flex items-center gap-2 text-sm text-zinc-300">
              <CalendarCheck className="h-4 w-4 text-accent-400" /> Clases esta semana
            </span>
            <span className="font-display text-lg font-bold text-white">
              {unlimited ? (
                <span className="text-accent-300">∞</span>
              ) : week ? (
                <>
                  {week.used}
                  <span className="text-xs font-medium text-zinc-500"> / {week.limit}</span>
                </>
              ) : (
                <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
              )}
            </span>
          </div>

          {!active ? (
            <Notice
              icon={<Lock className="h-4 w-4" />}
              text={
                courtesyExhausted
                  ? 'Has usado todas tus clases de cortesía, así que hemos inactivado tu cuenta. Podrás volver a reservar en cuanto te pongas al corriente de pago en el box.'
                  : 'Tu cuenta está inactiva. Ponte al día con el pago en el box para poder reservar.'
              }
            />
          ) : tooFar ? (
            <Notice
              icon={<CalendarClock className="h-4 w-4" />}
              text={`Todavía no puedes reservar esta clase. Las reservas se abren 2 días antes: a partir del ${formatDateES(opensOn)}.`}
            />
          ) : reachedLimit ? (
            <Notice
              icon={<AlertTriangle className="h-4 w-4" />}
              text={`Has alcanzado tu límite de ${week?.limit} clases por semana. Cancela alguna reserva de esta semana o espera a la siguiente.`}
            />
          ) : full ? (
            <Notice
              icon={<Users className="h-4 w-4" />}
              text="Esta sesión está completa. Prueba con otro horario."
            />
          ) : unlimited ? (
            <p className="text-center text-xs text-zinc-500">
              Como administrador puedes reservar cualquier clase, sin límite semanal.
            </p>
          ) : inCourtesy ? (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">
              <Gift className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <span>
                Estás usando <strong className="text-amber-100">clases de cortesía</strong> (tu mes ha
                vencido).
                {typeof courtesyLeft === 'number' && (
                  <>
                    {' '}Al reservar esta te{' '}
                    {Math.max(0, courtesyLeft - 1) === 1 ? 'quedará' : 'quedarán'}{' '}
                    <strong className="text-amber-100">
                      {Math.max(0, courtesyLeft - 1)}
                      {typeof courtesyLimit === 'number' ? ` de ${courtesyLimit}` : ''}
                    </strong>
                    ;
                  </>
                )}{' '}
                se restará de tu próxima mensualidad. Y si cancelas con menos de{' '}
                <strong className="text-amber-100">1 hora</strong> de antelación, perderás esa clase.
              </span>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-center text-xs text-zinc-500">
                Reservar esta clase usará{' '}
                <span className="font-semibold text-zinc-300">1 de tus {week?.limit} clases</span> de la
                semana{remaining != null ? ` (te quedarían ${Math.max(0, remaining - 1)})` : ''}.
              </p>
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                <span>
                  <strong>Cancelación:</strong> si cancelas con menos de{' '}
                  <strong>1 hora</strong> de antelación, perderás esa clase (contará en tu semana).
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
              {phase === 'saving' ? 'Reservando…' : 'Reservar plaza'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Notice({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-300">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>{text}</span>
    </div>
  );
}
