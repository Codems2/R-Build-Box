import { useEffect, useState } from 'react';
import { CalendarX2, Loader2, Repeat, Trash2, Users } from 'lucide-react';
import Modal from '../Modal';
import { formatDateES } from '../../lib/dates';
import { slotTitle, type ClassType, type ScheduleSlot } from '../../lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  slot: ScheduleSlot | null;
  /** Fecha de la sesión desde la que se ha pulsado «Eliminar» */
  classDate: string | null;
  classTypes: ClassType[];
  /** Reservas que hay ese día (para avisar de que se cancelan) */
  bookedCount: number;
  onDelete: (scope: 'one' | 'all') => Promise<void>;
}

/**
 * Confirmación de borrado de una clase.
 *
 * Si la clase es recurrente el admin elige el alcance: solo la sesión de ese
 * día (el resto de semanas se mantienen) o la clase entera. Si es puntual solo
 * cabe eliminarla, así que se pide una confirmación simple.
 */
export default function DeleteSlotModal({
  open,
  onClose,
  slot,
  classDate,
  classTypes,
  bookedCount,
  onDelete,
}: Props) {
  const [busy, setBusy] = useState<'one' | 'all' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setBusy(null);
      setError(null);
    }
  }, [open, slot?.id, classDate]);

  if (!slot || !classDate) return null;

  const title = slotTitle(slot, classTypes);
  const recurring = slot.is_recurring;

  async function run(scope: 'one' | 'all') {
    setBusy(scope);
    setError(null);
    try {
      await onDelete(scope);
      onClose();
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'No se pudo eliminar la clase.');
      setBusy(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Eliminar clase">
      <div className="space-y-4">
        {/* Qué clase y qué día */}
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-white">
            {title}
            {recurring ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-accent-400">
                <Repeat className="h-3 w-3" /> Semanal
              </span>
            ) : (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                Puntual
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-zinc-400 first-letter:uppercase">
            {formatDateES(classDate)}
          </p>
          {bookedCount > 0 && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-300">
              <Users className="h-3.5 w-3.5 shrink-0" />
              {bookedCount === 1
                ? 'Hay 1 persona apuntada: se cancelará su reserva.'
                : `Hay ${bookedCount} personas apuntadas: se cancelarán sus reservas.`}
            </p>
          )}
        </div>

        {recurring ? (
          <>
            <p className="text-sm text-zinc-300">
              Es una clase que se repite cada semana. ¿Qué quieres eliminar?
            </p>

            {/* Solo esta sesión */}
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void run('one')}
              className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 text-left transition hover:border-white/20 hover:bg-white/[0.06] disabled:opacity-50"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/25">
                {busy === 'one' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CalendarX2 className="h-4 w-4" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-white">Solo esta clase</span>
                <span className="mt-0.5 block text-xs text-zinc-400">
                  Se quita solo el {formatDateES(classDate)}. El resto de semanas se mantienen.
                </span>
              </span>
            </button>

            {/* Todas las recurrentes */}
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void run('all')}
              className="flex w-full items-center gap-3 rounded-xl border border-brand-500/25 bg-brand-500/[0.07] px-3.5 py-3 text-left transition hover:border-brand-500/50 hover:bg-brand-500/15 disabled:opacity-50"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/25">
                {busy === 'all' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-white">
                  Todas las repeticiones
                </span>
                <span className="mt-0.5 block text-xs text-zinc-400">
                  La clase desaparece del horario en todas las semanas, con sus reservas.
                </span>
              </span>
            </button>
          </>
        ) : (
          <p className="text-sm text-zinc-300">
            Esta clase solo existe ese día. ¿Seguro que quieres eliminarla?
          </p>
        )}

        {error && <p className="text-sm text-brand-300">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={busy !== null}
            className="btn-ghost flex-1"
          >
            Cancelar
          </button>
          {!recurring && (
            <button
              type="button"
              onClick={() => void run('all')}
              disabled={busy !== null}
              className="btn-primary flex-1"
            >
              <Trash2 className="h-4 w-4" />
              {busy ? 'Eliminando…' : 'Eliminar'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
