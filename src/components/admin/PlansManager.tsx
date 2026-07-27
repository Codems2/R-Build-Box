import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Coins, Pencil, Plus, Trash2 } from 'lucide-react';
import Modal from '../Modal';
import { createPlan, deletePlan, fetchPlans, updatePlan } from '../../lib/api';
import type { Plan, PlanInput } from '../../lib/types';

const EMPTY: PlanInput = { name: '', weekly_credits: 2, price: null, description: null };

export default function PlansManager({ onChanged }: { onChanged?: () => void }) {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [form, setForm] = useState<PlanInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setPlans(await fetchPlans());
    } catch {
      setPlans([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (open) {
      setError(null);
      setForm(
        editing
          ? {
              name: editing.name,
              weekly_credits: editing.weekly_credits,
              price: editing.price,
              description: editing.description,
            }
          : EMPTY,
      );
    }
  }, [open, editing]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const input: PlanInput = {
        ...form,
        name: form.name.trim(),
        description: form.description?.trim() || null,
      };
      if (editing) await updatePlan(editing.id, input);
      else await createPlan(input);
      await load();
      onChanged?.();
      setOpen(false);
    } catch (err) {
      console.error(err);
      setError('No se pudo guardar el plan.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(p: Plan) {
    if (!window.confirm(`¿Eliminar el plan «${p.name}»? Los socios con este plan quedarán sin plan.`))
      return;
    await deletePlan(p.id);
    await load();
    onChanged?.();
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-white">Planes</h2>
        <button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
          className="btn-ghost !px-3 !py-2 text-xs"
        >
          <Plus className="h-4 w-4" /> Nuevo plan
        </button>
      </div>

      {plans && plans.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-zinc-500">
          Aún no hay planes. Crea uno para poder asignarlo a los socios.
        </p>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {(plans ?? []).map((p) => (
            <motion.div
              key={p.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="card flex min-w-0 items-center gap-3 p-3.5"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/25">
                <Coins className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{p.name}</p>
                <p className="text-xs text-zinc-400">
                  {p.weekly_credits} créd./sem
                  {p.price != null && <span className="text-zinc-600"> · {p.price} €</span>}
                </p>
              </div>
              <button
                onClick={() => {
                  setEditing(p);
                  setOpen(true);
                }}
                className="btn-icon"
                aria-label={`Editar ${p.name}`}
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={() => void handleDelete(p)}
                className="btn-icon hover:!text-brand-300"
                aria-label={`Eliminar ${p.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </motion.div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Editar plan' : 'Nuevo plan'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="pl-name" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Nombre
            </label>
            <input
              id="pl-name"
              required
              className="input"
              placeholder="Ej. Básico, Pro, Ilimitado…"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="pl-credits" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Créditos / semana
              </label>
              <input
                id="pl-credits"
                type="number"
                min={0}
                max={100}
                required
                className="input"
                value={form.weekly_credits}
                onChange={(e) => setForm((f) => ({ ...f, weekly_credits: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label htmlFor="pl-price" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Precio (€/mes)
              </label>
              <input
                id="pl-price"
                type="number"
                min={0}
                step={0.5}
                className="input"
                placeholder="Opcional"
                value={form.price ?? ''}
                onChange={(e) =>
                  setForm((f) => ({ ...f, price: e.target.value === '' ? null : Number(e.target.value) }))
                }
              />
            </div>
          </div>
          <div>
            <label htmlFor="pl-desc" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Descripción (opcional)
            </label>
            <input
              id="pl-desc"
              className="input"
              placeholder="Ej. 2 clases por semana"
              value={form.description ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
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
