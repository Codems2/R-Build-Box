import { useEffect, useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { CalendarCheck, Check, Clock, UserPlus } from 'lucide-react';
import Modal from '../Modal';
import { BookingError, bookGuest } from '../../lib/api';
import { formatDateES } from '../../lib/dates';
import {
  endTime,
  formatTime,
  slotTitle,
  type ClassType,
  type ScheduleSlot,
} from '../../lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  slot: ScheduleSlot | null;
  classDate: string | null;
  classTypes: ClassType[];
  onDone?: () => void;
}

export default function GuestBookingModal({ open, onClose, slot, classDate, classTypes, onDone }: Props) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setPhone('');
      setDone(false);
      setError(null);
    }
  }, [open, slot, classDate]);

  if (!slot || !classDate) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!slot || !classDate) return;
    if (name.trim().length < 2) {
      setError('Escribe el nombre del invitado.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await bookGuest(slot.id, classDate, name.trim(), phone.trim() || null);
      setDone(true);
      onDone?.();
    } catch (err) {
      setError(err instanceof BookingError ? err.message : 'No se pudo apuntar al invitado.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Reservar para un invitado">
      {/* Resumen de la sesión */}
      <div className="card mb-5 p-4">
        <h3 className="font-display text-base font-bold text-white">{slotTitle(slot, classTypes)}</h3>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-300">
          <span className="inline-flex items-center gap-1.5 capitalize">
            <CalendarCheck className="h-3.5 w-3.5 text-zinc-500" /> {formatDateES(classDate)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-zinc-500" />
            {formatTime(slot.start_time)} – {endTime(slot.start_time, slot.duration_min)}
          </span>
        </p>
      </div>

      {done ? (
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
            <p className="font-display text-base font-bold text-white">¡Invitado apuntado!</p>
            <p className="mt-1 text-sm text-zinc-400">
              <span className="font-medium text-zinc-200">{name.trim()}</span> queda apuntado a esta
              sesión.
            </p>
          </div>
          <button onClick={onClose} className="btn-primary w-full">
            Listo
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-xs leading-relaxed text-zinc-500">
            Apunta a un cliente que no tiene cuenta en la app (por ejemplo, para la primera clase
            gratis). Ocupa una plaza de la sesión.
          </p>
          <div>
            <label htmlFor="g-name" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Nombre del invitado
            </label>
            <input
              id="g-name"
              required
              maxLength={60}
              className="input"
              placeholder="Nombre y apellidos"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="g-phone" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Teléfono <span className="normal-case text-zinc-600">(opcional)</span>
            </label>
            <input
              id="g-phone"
              type="tel"
              className="input"
              placeholder="Para avisarle o recordarle"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-brand-300">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              <UserPlus className="h-4 w-4" />
              {saving ? 'Apuntando…' : 'Apuntar invitado'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
