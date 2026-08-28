import { useEffect, useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import Modal from '../Modal';
import AdaptiveActions from '../AdaptiveActions';
import type { ClassType, ClassTypeInput } from '../../lib/types';
import { createClassType, deleteClassType, updateClassType } from '../../lib/api';

const PRESET_COLORS = [
  '#EE7794',
  '#D92B53',
  '#9E1838',
  '#F59E0B',
  '#2DD4BF',
  '#818CF8',
  '#A3E635',
  '#F472B6',
];

interface Props {
  classTypes: ClassType[];
  onChanged: () => Promise<void>;
}

export default function ClassTypeManager({ classTypes, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ClassType | null>(null);
  const [form, setForm] = useState<ClassTypeInput>({
    name: '',
    description: null,
    color: PRESET_COLORS[1],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setForm(
        editing
          ? { name: editing.name, description: editing.description, color: editing.color }
          : { name: '', description: null, color: PRESET_COLORS[1] },
      );
    }
  }, [open, editing]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const input = {
        ...form,
        name: form.name.trim(),
        description: form.description?.trim() || null,
      };
      if (editing) await updateClassType(editing.id, input);
      else await createClassType(input);
      await onChanged();
      setOpen(false);
    } catch (err) {
      console.error(err);
      setError('No se pudo guardar el tipo de clase.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(type: ClassType) {
    if (
      !window.confirm(
        `¿Eliminar «${type.name}»? Los huecos de este tipo pasarán a tener título personalizado.`,
      )
    )
      return;
    await deleteClassType(type.id);
    await onChanged();
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-white">Tipos de clase</h2>
        <button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
          className="btn-ghost !px-3 !py-2 text-xs"
        >
          <Plus className="h-4 w-4" /> Nuevo tipo
        </button>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        {classTypes.map((type) => (
          <motion.div
            key={type.id}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="card flex min-w-0 items-center gap-3 p-3.5"
          >
            <span
              className="h-9 w-9 shrink-0 rounded-xl"
              style={{ backgroundColor: `${type.color}26`, boxShadow: `inset 0 0 0 2px ${type.color}` }}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{type.name}</p>
              {type.description && (
                <p className="truncate text-xs text-zinc-500">{type.description}</p>
              )}
            </div>
            <AdaptiveActions
              items={[
                {
                  key: 'edit',
                  label: 'Editar',
                  icon: Pencil,
                  onClick: () => {
                    setEditing(type);
                    setOpen(true);
                  },
                },
                {
                  key: 'delete',
                  label: 'Eliminar',
                  icon: Trash2,
                  onClick: () => void handleDelete(type),
                  danger: true,
                },
              ]}
            />
          </motion.div>
        ))}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Editar tipo de clase' : 'Nuevo tipo de clase'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="ct-name" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Nombre
            </label>
            <input
              id="ct-name"
              required
              className="input"
              placeholder="Ej. Muay Thai · Adultos"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <label htmlFor="ct-desc" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Descripción (opcional)
            </label>
            <input
              id="ct-desc"
              className="input"
              placeholder="Se muestra bajo el nombre de la clase"
              value={form.description ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Color
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, color: c }))}
                  className={`h-8 w-8 rounded-lg transition ${
                    form.color === c ? 'scale-110 ring-2 ring-white/70' : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={`Color ${c}`}
                />
              ))}
              <input
                type="color"
                value={form.color}
                onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                className="h-8 w-8 cursor-pointer rounded-lg border border-white/10 bg-transparent"
                aria-label="Color personalizado"
              />
            </div>
          </div>

          {error && <p className="text-sm text-brand-300">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setOpen(false)} className="btn-ghost flex-1">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
