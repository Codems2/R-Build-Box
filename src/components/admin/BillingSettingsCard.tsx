import { useEffect, useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Check, Loader2, Receipt } from 'lucide-react';
import { fetchBillingSettings, updateBillingSettings } from '../../lib/api';
import type { BillingSettings } from '../../lib/types';

const LABEL = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400';

/**
 * Datos fiscales del box: salen como emisor en las facturas. Solo los ve el
 * admin (no se guardan con el resto de ajustes, que leen también los socios).
 * Cada factura guarda una copia de estos datos, así que cambiarlos no altera
 * las ya emitidas.
 */
export default function BillingSettingsCard() {
  const [form, setForm] = useState<BillingSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchBillingSettings()
      .then(setForm)
      .catch(() => setError('No se pudieron cargar los datos de facturación.'));
  }, []);

  const set = (k: keyof BillingSettings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => (f ? { ...f, [k]: e.target.value } : f));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateBillingSettings(form);
      setForm(await fetchBillingSettings());
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch {
      setError('No se pudo guardar. Revisa los datos e inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="card mb-4 p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/25">
          <Receipt className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">Datos de facturación</p>
          <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">
            Salen como emisor en las facturas que generas desde Economía. Cambiarlos no modifica
            las facturas ya emitidas.
          </p>

          {!form && !error ? (
            <div className="flex items-center justify-center py-6 text-zinc-500">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : form ? (
            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_11rem]">
                <div>
                  <label htmlFor="bill-name" className={LABEL}>
                    Nombre o razón social
                  </label>
                  <input
                    id="bill-name"
                    required
                    maxLength={120}
                    className="input"
                    value={form.issuer_name ?? ''}
                    onChange={set('issuer_name')}
                  />
                </div>
                <div>
                  <label htmlFor="bill-nif" className={LABEL}>
                    NIF
                  </label>
                  <input
                    id="bill-nif"
                    required
                    minLength={3}
                    maxLength={20}
                    className="input uppercase"
                    value={form.issuer_nif ?? ''}
                    onChange={set('issuer_nif')}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="bill-addr1" className={LABEL}>
                  Dirección
                </label>
                <input
                  id="bill-addr1"
                  maxLength={120}
                  className="input"
                  placeholder="Calle, número y piso"
                  value={form.issuer_address1 ?? ''}
                  onChange={set('issuer_address1')}
                />
              </div>
              <div>
                <label htmlFor="bill-addr2" className={LABEL}>
                  Código postal, localidad y provincia
                </label>
                <input
                  id="bill-addr2"
                  maxLength={120}
                  className="input"
                  placeholder="00000, Localidad, Provincia"
                  value={form.issuer_address2 ?? ''}
                  onChange={set('issuer_address2')}
                />
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
                  'Guardar datos'
                )}
              </button>
            </form>
          ) : (
            <p className="mt-3 text-sm text-brand-300">{error}</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
