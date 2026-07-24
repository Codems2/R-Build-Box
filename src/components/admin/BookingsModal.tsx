import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Phone, Trash2, Users } from 'lucide-react';
import Modal from '../Modal';
import { deleteBooking, fetchSlotBookings } from '../../lib/api';
import { formatDateES } from '../../lib/dates';
import {
  formatTime,
  slotTitle,
  type Booking,
  type ClassType,
  type ScheduleSlot,
} from '../../lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  slot: ScheduleSlot | null;
  classTypes: ClassType[];
  /** Notifica cambios para refrescar contadores externos */
  onChanged?: () => void;
}

export default function BookingsModal({ open, onClose, slot, classTypes, onChanged }: Props) {
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!slot) return;
    try {
      setError(null);
      setBookings(await fetchSlotBookings(slot.id));
    } catch (e) {
      console.error(e);
      setError('No se pudieron cargar las reservas.');
    }
  }, [slot]);

  useEffect(() => {
    if (open) {
      setBookings(null);
      void load();
    }
  }, [open, load]);

  async function handleDelete(b: Booking) {
    if (!window.confirm(`¿Eliminar la reserva de «${b.name}» del ${formatDateES(b.class_date)}?`)) return;
    await deleteBooking(b.id);
    await load();
    onChanged?.();
  }

  if (!slot) return null;

  const byDate = (bookings ?? []).reduce<Record<string, Booking[]>>((acc, b) => {
    (acc[b.class_date] ??= []).push(b);
    return acc;
  }, {});
  const dates = Object.keys(byDate).sort();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Apuntados · ${slotTitle(slot, classTypes)} (${formatTime(slot.start_time)})`}
    >
      {bookings === null && !error ? (
        <div className="flex items-center justify-center py-10 text-zinc-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : error ? (
        <p className="py-6 text-center text-sm text-brand-300">{error}</p>
      ) : dates.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <Users className="h-7 w-7 text-zinc-600" />
          <p className="text-sm text-zinc-400">Todavía no hay nadie apuntado a las próximas sesiones.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {dates.map((date) => (
            <section key={date}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                <span className="capitalize">{formatDateES(date)}</span>
                <span className="ml-2 text-zinc-600">
                  {byDate[date].length}
                  {slot.capacity != null && ` / ${slot.capacity}`}
                </span>
              </h3>
              <div className="space-y-1.5">
                {byDate[date].map((b, i) => (
                  <motion.div
                    key={b.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3.5 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-100">{b.name}</p>
                      {b.contact && (
                        <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-zinc-500">
                          <Phone className="h-3 w-3" /> {b.contact}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => void handleDelete(b)}
                      className="btn-icon hover:!text-brand-300"
                      aria-label={`Eliminar reserva de ${b.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </motion.div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </Modal>
  );
}
