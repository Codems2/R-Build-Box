import { useEffect, useRef, useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { CalendarRange, Check, Euro, Gift, Image as ImageIcon, Loader2, RotateCcw, Upload } from 'lucide-react';
import { fetchAppSettings, resetLogo, updateAppSettings, uploadLogo } from '../../lib/api';
import { applyPwaBranding, resetPwaBranding } from '../../lib/pwaBranding';
import { useAuth } from '../../lib/auth';

export default function SettingsManager() {
  const { logoUrl, refreshBranding } = useAuth();
  const [limit, setLimit] = useState<number | null>(null);
  const [fee, setFee] = useState('');
  const [courtesy, setCourtesy] = useState(2);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoErr, setLogoErr] = useState<string | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);

  async function handleLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLogoBusy(true);
    setLogoErr(null);
    try {
      await uploadLogo(file);
      await refreshBranding();
      await applyPwaBranding(); // actualiza favicon/manifiesto en vivo
    } catch (err) {
      setLogoErr(err instanceof Error ? err.message : 'No se pudo subir el logo.');
    } finally {
      setLogoBusy(false);
    }
  }

  async function handleResetLogo() {
    if (!window.confirm('¿Volver al logo por defecto?')) return;
    setLogoBusy(true);
    setLogoErr(null);
    try {
      await resetLogo();
      await refreshBranding();
      resetPwaBranding();
    } catch {
      setLogoErr('No se pudo restablecer el logo.');
    } finally {
      setLogoBusy(false);
    }
  }

  useEffect(() => {
    void fetchAppSettings()
      .then((s) => {
        setLimit(s.weekly_class_limit);
        setFee(String(s.default_monthly_fee));
        setCourtesy(s.courtesy_classes);
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
        courtesy_classes: courtesy,
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

      {/* Logo del box */}
      <motion.div
        layout
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="card mb-4 p-4 sm:p-5"
      >
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] p-2">
            <img
              key={logoUrl ?? 'default'}
              src={logoUrl ?? '/logo.png'}
              alt="Logo actual"
              className="h-full w-full object-contain"
              onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/logo.png'; }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-sm font-semibold text-white">
              <ImageIcon className="h-4 w-4 text-accent-300" /> Logo del box
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">
              Aparece en la cabecera, en la pantalla de acceso y como icono de la app. Sube un PNG,
              JPG o WebP (máx. 3 MB); se recomienda forma cuadrada. Nota: quien ya tenga la app
              instalada verá el icono nuevo al reinstalarla.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleLogo} />
              <button
                type="button"
                onClick={() => logoInput.current?.click()}
                disabled={logoBusy}
                className="btn-primary !px-3.5 !py-2 text-xs"
              >
                {logoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {logoBusy ? 'Subiendo…' : 'Cambiar logo'}
              </button>
              {logoUrl && (
                <button
                  type="button"
                  onClick={() => void handleResetLogo()}
                  disabled={logoBusy}
                  className="btn-ghost !px-3 !py-2 text-xs"
                >
                  <RotateCcw className="h-4 w-4" /> Por defecto
                </button>
              )}
            </div>
            {logoErr && <p className="mt-2 text-sm text-brand-300">{logoErr}</p>}
          </div>
        </div>
      </motion.div>

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

            {/* Clases de cortesía */}
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/25">
                <Gift className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white">Clases de cortesía</p>
                <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">
                  Cuando a un socio se le acaba el mes pagado, puede seguir reservando estas clases
                  de margen antes de desactivarse. Al ponerse al día, esas clases usadas se le restan
                  del siguiente mes. Pon 0 para desactivar la cortesía.
                </p>
                <input
                  id="courtesy-classes"
                  type="number"
                  min={0}
                  max={50}
                  required
                  className="input mt-3 w-28"
                  value={courtesy}
                  onChange={(e) => setCourtesy(Math.max(0, Math.min(50, Number(e.target.value))))}
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
