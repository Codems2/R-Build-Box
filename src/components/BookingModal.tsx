import { useEffect, useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { CalendarCheck, Check, Clock, Users } from 'lucide-react';
import Modal from './Modal';
import { BookingError, cancelBooking, createBooking } from '../lib/api';
import { formatDateES } from '../lib/dates';
import { forgetBooking, getMyBooking, rememberBooking, type MyBooking } from '../lib/myBookings';
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
  /** Plazas ya ocupadas en esta sesión */
  count: number;
  /** Notifica reservas/cancelaciones para refrescar la ocupación */
  onChanged: () => void;
}

type Phase = 'form' | 'saving' | 'done';

export default function BookingModal({
  open,
  onClose,
  slot,
  classDate,
  classTypes,
  count,
  onChanged,
}: Props) {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [phase, setPhase] = useState<Phase>('form');
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<MyBooking | undefined>(undefined);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (open && slot && classDate) {
      setPhase('form');
      setError(null);
      setContact('');
      setCancelling(false);
      setMine(getMyBooking(slot.id, classDate));
    }
  }, [open, slot, classDate]);

  if (!slot || !classDate) return null;

  const color = slotColor(slot, classTypes);
  const kind = KIND_META[slot.kind];
  const free = slot.capacity != null ? Math.max(0, slot.capacity - count) : null;
  const full = free !== null && free <= 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!slot || !classDate || name.trim().length < 2) return;
    setPhase('saving');
    setError(null);
    try {
      const res = await createBooking(slot, classDate, name.trim(), contact.trim());
      const booking: MyBooking = {
        bookingId: res.id,
        cancelToken: res.cancel_token,
        slotId: slot.id,
        classDate,
        name: name.trim(),
      };
      rememberBooking(booking);
      setMine(booking);
      setPhase('done');
      onChanged();
    } catch (err) {
      setPhase('form');
      setError(
        err instanceof BookingError
          ? err.message
          : 'No se pudo completar la reserva. Inténtalo de nuevo.',
      );
      onChanged();
    }
  }

  async function handleCancel() {
    if (!mine) return;
    setCancelling(true);
    try {
      await cancelBooking(mine.bookingId, mine.cancelToken);
      forgetBooking(mine.bookingId);
      setMine(undefined);
      setPhase('form');
      onChanged();
    } catch {
      setError('No se pudo cancelar. Inténtalo de nuevo.');
    } finally {
      setCancelling(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Apuntarse a clase">
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

      {mine ? (
        /* Ya apuntado desde este dispositivo */
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
              {phase === 'done' ? '¡Plaza reservada!' : 'Ya estás apuntado'}
            </p>
            <p className="mt-1 text-sm text-zinc-400">
              A nombre de <span className="font-semibold text-zinc-200">{mine.name}</span>.
              Te esperamos en el box.
            </p>
          </div>
          {error && <p className="text-sm text-brand-300">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => void handleCancel()}
              disabled={cancelling}
              className="btn-ghost flex-1 hover:!text-brand-300"
            >
              {cancelling ? 'Cancelando…' : 'Cancelar mi plaza'}
            </button>
            <button onClick={onClose} className="btn-primary flex-1">
              Listo
            </button>
          </div>
        </div>
      ) : full ? (
        <div className="space-y-4 text-center">
          <p className="text-sm text-zinc-400">
            Esta sesión está completa. Prueba con otro horario o pregunta en recepción por la
            lista de espera.
          </p>
          <button onClick={onClose} className="btn-ghost w-full">
            Entendido
          </button>
        </div>
      ) : (
        /* Formulario de reserva */
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="bk-name" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Tu nombre
            </label>
            <input
              id="bk-name"
              required
              minLength={2}
              maxLength={60}
              autoComplete="name"
              className="input"
              placeholder="Nombre y apellido"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="bk-contact" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Teléfono <span className="normal-case text-zinc-600">(opcional)</span>
            </label>
            <input
              id="bk-contact"
              maxLength={120}
              autoComplete="tel"
              className="input"
              placeholder="Por si hay cambios en la clase"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-brand-300">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">
              Volver
            </button>
            <button type="submit" disabled={phase === 'saving'} className="btn-primary flex-1">
              {phase === 'saving' ? 'Reservando…' : 'Apuntarme'}
            </button>
          </div>
          <p className="text-center text-[11px] leading-relaxed text-zinc-600">
            Podrás cancelar tu plaza desde este mismo dispositivo volviendo a abrir la clase.
          </p>
        </form>
      )}
    </Modal>
  );
}
