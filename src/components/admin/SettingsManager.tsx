import { useEffect, useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { CalendarRange, Check, Euro, Loader2 } from 'lucide-react';
import { fetchAppSettings, updateAppSettings } from '../../lib/api';

export default function SettingsManager() {
  const [limit, setLimit] = useState<number | null>(null);
  const [fee, setFee] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchAppSettings()
      .then((s) => {
        setLimit(s.weekly_class_limit);
        setFee(String(s.default_monthly_fee));
      })
      .catch(() => setError('No se pudo cargar la configuración.'));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (limit == null) return;
    const feeValue = Number(fee.replace(',', '.'));
    if (!Number.isFinite(feeValue) || feeValue < 0) {
      setError('Introduce una cuota mensual válida.');
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateAppSettings({
        weekly_class_limit: limit,
        default_monthly_fee: Math.round(feeValue * 100) / 100,
      });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch {
      setError('No se pudo guardar. Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-white">Configuración</h2>
      </div>

      <motion.div
        layout
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="card p-4 sm:p-5"
      >
        {limit == null && !error ? (
          <div className="flex items-center justify-center py-6 text-zinc-500">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Límite semanal de clases */}
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-500/15 text-accent-300 ring-1 ring-accent-500/25">
                <CalendarRange className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white">Clases por semana</p>
                <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">
                  Máximo de clases que cada socio puede reservar por semana (lunes a domingo). Los
                  administradores no tienen límite.
                </p>
                <input
                  id="weekly-limit"
                  type="number"
                  min={1}
                  max={50}
                  required
                  className="input mt-3 w-28"
                  value={limit ?? ''}
                  onChange={(e) => setLimit(Math.max(1, Math.min(50, Number(e.target.value))))}
                />
              </div>
            </div>

            {/* Cuota mensual estándar */}
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/25">
                <Euro className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white">Cuota mensual estándar</p>
                <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">
                  Lo que paga al mes un socio activo sin plan. Si el socio está adherido a un plan,
                  se usa el precio del plan.
                </p>
                <input
                  id="default-fee"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  required
                  className="input mt-3 w-28"
                  value={fee}
                  onChange={(e) => setFee(e.target.value)}
                />
              </div>
            </div>

            {error && <p className="text-sm text-brand-300">{error}</p>}

            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? (
                'Guardando…'
              ) : saved ? (
                <>
                  <Check className="h-4 w-4" /> Guardado
                </>
              ) : (
                'Guardar'
              )}
            </button>
          </form>
        )}
      </motion.div>
    </section>
  );
}
