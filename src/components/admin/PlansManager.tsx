import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { CreditCard, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import Modal from '../Modal';
import AdaptiveActions from '../AdaptiveActions';
import { createPlan, deletePlan, fetchPlans, updatePlan } from '../../lib/api';
import type { Plan } from '../../lib/types';

const EUR = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

export default function PlansManager() {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setPlans(await fetchPlans());
    } catch (e) {
      console.error(e);
      setError('No se pudieron cargar los planes.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDelete(plan: Plan) {
    if (
      !window.confirm(
        `¿Eliminar el plan «${plan.name}»? Los socios adheridos pasarán a la cuota estándar.`,
      )
    )
      return;
    setBusyId(plan.id);
    try {
      await deletePlan(plan.id);
      await load();
    } catch (e) {
      console.error(e);
      window.alert('No se pudo eliminar el plan.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-white">Planes</h2>
        <button onClick={() => setCreating(true)} className="btn-primary !px-3.5 !py-2 text-xs">
          <Plus className="h-4 w-4" /> Nuevo plan
        </button>
      </div>

      {error && <p className="mb-3 text-sm text-brand-300">{error}</p>}

      {plans === null ? (
        <div className="flex items-center justify-center py-12 text-zinc-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : plans.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-zinc-500">
          Sin planes: todos los socios activos pagan la cuota estándar (editable en
          «Configuración»). Crea planes si quieres tarifas distintas.
        </p>
      ) : (
        <div className="space-y-2">
          {plans.map((p) => (
            <motion.div
              key={p.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="card flex min-w-0 items-center gap-3 p-3.5"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-500/15 text-accent-300 ring-1 ring-accent-500/25">
                <CreditCard className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{p.name}</p>
                {p.description && (
                  <p className="mt-0.5 truncate text-xs text-zinc-500">{p.description}</p>
                )}
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  {p.weekly_limit != null ? `${p.weekly_limit}/semana` : 'Límite general'}
                  {' · '}
                  {p.monthly_limit != null ? `${p.monthly_limit}/mes` : 'Sin tope mensual'}
                </p>
              </div>
              <p className="shrink-0 font-display text-sm font-bold text-white">
                {EUR.format(p.monthly_price)}
                <span className="text-xs font-medium text-zinc-500">/mes</span>
              </p>
              <AdaptiveActions
                items={[
                  { key: 'edit', label: 'Editar', icon: Pencil, onClick: () => setEditing(p) },
                  {
                    key: 'delete',
                    label: 'Eliminar',
                    icon: Trash2,
                    onClick: () => void handleDelete(p),
                    danger: true,
                    disabled: busyId === p.id,
                    loading: busyId === p.id,
                  },
                ]}
              />
            </motion.div>
          ))}
        </div>
      )}

      <PlanModal
        open={creating || editing !== null}
        plan={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={load}
      />
    </section>
  );
}

function PlanModal({
  open,
  plan,
  onClose,
  onSaved,
}: {
  open: boolean;
  plan: Plan | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [weeklyLimit, setWeeklyLimit] = useState('');
  const [monthlyLimit, setMonthlyLimit] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(plan?.name ?? '');
      setPrice(plan ? String(plan.monthly_price) : '');
      setDescription(plan?.description ?? '');
      setWeeklyLimit(plan?.weekly_limit != null ? String(plan.weekly_limit) : '');
      setMonthlyLimit(plan?.monthly_limit != null ? String(plan.monthly_limit) : '');
      setError(null);
    }
  }, [open, plan]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const value = Number(price.replace(',', '.'));
    if (!Number.isFinite(value) || value < 0) {
      setError('Introduce un precio válido.');
      return;
    }
    const weekly = weeklyLimit.trim() ? Math.round(Number(weeklyLimit)) : null;
    const monthly = monthlyLimit.trim() ? Math.round(Number(monthlyLimit)) : null;
    if (weekly != null && (!Number.isFinite(weekly) || weekly < 1 || weekly > 50)) {
      setError('Clases por semana: deja vacío o pon un número entre 1 y 50.');
      return;
    }
    if (monthly != null && (!Number.isFinite(monthly) || monthly < 1 || monthly > 500)) {
      setError('Clases máximas al mes: deja vacío o pon un número entre 1 y 500.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const input = {
        name: name.trim(),
        monthly_price: Math.round(value * 100) / 100,
        description: description.trim() || null,
        weekly_limit: weekly,
        monthly_limit: monthly,
      };
      if (plan) await updatePlan(plan.id, input);
      else await createPlan(input);
      await onSaved();
      onClose();
    } catch (err) {
      console.error(err);
      setError('No se pudo guardar el plan.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={plan ? 'Editar plan' : 'Nuevo plan'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="plan-name" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Nombre
          </label>
          <input
            id="plan-name"
            required
            maxLength={60}
            className="input"
            placeholder="Básico, Pro, Ilimitado…"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="plan-price" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Precio mensual (€)
          </label>
          <input
            id="plan-price"
            required
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            className="input"
            placeholder="60,00"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="plan-weekly" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Clases / semana
            </label>
            <input
              id="plan-weekly"
              type="number"
              inputMode="numeric"
              min="1"
              max="50"
              className="input"
              placeholder="Global"
              value={weeklyLimit}
              onChange={(e) => setWeeklyLimit(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="plan-monthly" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Clases máx. / mes
            </label>
            <input
              id="plan-monthly"
              type="number"
              inputMode="numeric"
              min="1"
              max="500"
              className="input"
              placeholder="Sin tope"
              value={monthlyLimit}
              onChange={(e) => setMonthlyLimit(e.target.value)}
            />
          </div>
        </div>
        <p className="-mt-2 text-[11px] leading-relaxed text-zinc-600">
          «Clases / semana»: déjalo vacío para usar el límite general de «Configuración». «Clases
          máx. / mes»: vacío = sin tope mensual. Ej. plan atletas: 7 y 30.
        </p>
        <div>
          <label htmlFor="plan-desc" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Descripción
          </label>
          <input
            id="plan-desc"
            className="input"
            placeholder="Opcional"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-brand-300">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="btn-primary flex-1">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
