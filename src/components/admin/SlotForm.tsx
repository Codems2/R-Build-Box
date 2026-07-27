import { useEffect, useState, type FormEvent } from 'react';
import { Repeat } from 'lucide-react';
import Modal from '../Modal';
import type { ClassType, ScheduleSlot, SlotInput, SlotKind } from '../../lib/types';
import { KIND_META } from '../../lib/types';
import { dowOfISO, todayISO } from '../../lib/dates';

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (input: SlotInput, id?: string) => Promise<void>;
  classTypes: ClassType[];
  /** Hueco a editar; si es null se crea uno nuevo */
  editing: ScheduleSlot | null;
  /** Fecha por defecto (ISO) al crear un hueco nuevo */
  defaultDate: string;
}

const EMPTY = (date: string): SlotInput => ({
  class_type_id: null,
  title: null,
  day_of_week: dowOfISO(date),
  start_time: '18:00',
  duration_min: 60,
  capacity: 16,
  kind: 'regular',
  note: null,
  is_active: true,
  is_recurring: true,
  class_date: date,
});

export default function SlotForm({
  open,
  onClose,
  onSave,
  classTypes,
  editing,
  defaultDate,
}: Props) {
  const [form, setForm] = useState<SlotInput>(EMPTY(defaultDate));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      if (editing) {
        setForm({ ...editing, class_date: editing.class_date ?? defaultDate });
      } else {
        setForm(EMPTY(defaultDate));
      }
    }
  }, [open, editing, defaultDate]);

  const set = <K extends keyof SlotInput>(key: K, value: SlotInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // Al cambiar la fecha, sincroniza el día de la semana
  function setDate(date: string) {
    setForm((f) => ({ ...f, class_date: date, day_of_week: dowOfISO(date) }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.class_type_id && !form.title?.trim()) {
      setError('Elige un tipo de clase o escribe un título.');
      return;
    }
    if (!form.class_date) {
      setError('Elige una fecha para la clase.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(
        {
          ...form,
          day_of_week: dowOfISO(form.class_date),
          title: form.title?.trim() || null,
          note: form.note?.trim() || null,
        },
        editing?.id,
      );
      onClose();
    } catch (err) {
      console.error(err);
      setError('No se pudo guardar. Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Editar hueco' : 'Nuevo hueco en el horario'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Tipo de hueco */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Tipo de hueco
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(KIND_META) as SlotKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => set('kind', k)}
                className={`rounded-xl border px-2 py-2.5 text-xs font-semibold transition ${
                  form.kind === k
                    ? 'border-brand-500/60 bg-brand-600/20 text-white'
                    : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {KIND_META[k].label}
              </button>
            ))}
          </div>
        </div>

        {/* Clase */}
        <div>
          <label htmlFor="slot-type" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Clase
          </label>
          <select
            id="slot-type"
            className="input"
            value={form.class_type_id ?? ''}
            onChange={(e) => set('class_type_id', e.target.value || null)}
          >
            <option value="">— Título personalizado —</option>
            {classTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {!form.class_type_id && (
          <div>
            <label htmlFor="slot-title" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Título
            </label>
            <input
              id="slot-title"
              className="input"
              placeholder="Ej. Sala libre · Trabajo al saco"
              value={form.title ?? ''}
              onChange={(e) => set('title', e.target.value)}
            />
          </div>
        )}

        {/* Fecha / hora / duración */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="slot-date" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Fecha {form.is_recurring && <span className="normal-case text-zinc-600">(inicio)</span>}
            </label>
            <input
              id="slot-date"
              type="date"
              required
              min={todayISO()}
              className="input"
              value={form.class_date ?? ''}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="slot-start" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Hora de inicio
            </label>
            <input
              id="slot-start"
              type="time"
              required
              className="input"
              value={form.start_time}
              onChange={(e) => set('start_time', e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="slot-duration" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Duración (min)
            </label>
            <input
              id="slot-duration"
              type="number"
              min={15}
              max={240}
              step={5}
              required
              className="input"
              value={form.duration_min}
              onChange={(e) => set('duration_min', Number(e.target.value))}
            />
          </div>
          <div>
            <label htmlFor="slot-capacity" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Plazas
            </label>
            <input
              id="slot-capacity"
              type="number"
              min={1}
              max={99}
              className="input"
              placeholder="Sin límite"
              value={form.capacity ?? ''}
              onChange={(e) =>
                set('capacity', e.target.value === '' ? null : Number(e.target.value))
              }
            />
          </div>
        </div>

        {/* Recurrencia */}
        <div>
          <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <span className="flex items-center gap-2 text-sm font-medium text-zinc-200">
              <Repeat className="h-4 w-4 text-accent-400" /> Repetir cada semana
            </span>
            <input
              type="checkbox"
              checked={form.is_recurring}
              onChange={(e) => set('is_recurring', e.target.checked)}
              className="h-5 w-5 accent-[#2DD4BF]"
            />
          </label>
          <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
            {form.is_recurring
              ? 'La clase se repetirá cada semana ese mismo día a partir de la fecha elegida. No hace falta recrearla.'
              : 'La clase existirá solo en la fecha elegida (clase puntual).'}
          </p>
        </div>

        {/* Nota */}
        <div>
          <label htmlFor="slot-note" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Nota (opcional)
          </label>
          <input
            id="slot-note"
            className="input"
            placeholder="Ej. Reserva por WhatsApp"
            value={form.note ?? ''}
            onChange={(e) => set('note', e.target.value)}
          />
        </div>

        {/* Visible */}
        <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <span className="text-sm font-medium text-zinc-200">Visible en el horario público</span>
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => set('is_active', e.target.checked)}
            className="h-5 w-5 accent-[#D92B53]"
          />
        </label>

        {error && <p className="text-sm text-brand-300">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="btn-primary flex-1">
            {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear hueco'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
