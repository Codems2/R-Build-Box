import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import {
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
  TrendingDown,
  TrendingUp,
  Upload,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import Modal from '../Modal';
import FinanceChart, { type MonthDatum } from './FinanceChart';
import {
  createFinanceEntry,
  deleteFinanceEntry,
  deleteInvoice,
  fetchFinanceEntries,
  fetchMemberIncome,
  getInvoiceUrl,
  updateFinanceEntry,
  uploadInvoice,
} from '../../lib/api';
import { todayISO } from '../../lib/dates';
import { isMobileDevice } from '../../lib/pwa';
import type { FinanceEntry, FinanceKind, MemberIncomeRow } from '../../lib/types';

const EUR = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

/** Mes actual en formato YYYY-MM */
const currentYM = () => todayISO().slice(0, 7);

/** Primer y último día del mes (YYYY-MM-DD) */
function monthRange(ym: string): { from: string; to: string } {
  const [y, m] = ym.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const mm = String(m).padStart(2, '0');
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(lastDay).padStart(2, '0')}` };
}

function shiftYM(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatYM(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const label = new Date(y, m - 1, 1).toLocaleDateString('es-ES', {
    month: 'long',
    year: 'numeric',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatEntryDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('es-ES', {
    weekday: 'short',
    day: 'numeric',
  });
}

export default function FinanceManager() {
  const [ym, setYm] = useState(currentYM);
  const [entries, setEntries] = useState<FinanceEntry[] | null>(null);
  const [history, setHistory] = useState<MonthDatum[] | null>(null);
  const [memberIncome, setMemberIncome] = useState<MemberIncomeRow[] | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<FinanceEntry | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      // Una sola consulta de 6 meses: de ella salen el mes visible y la gráfica
      const months = Array.from({ length: 6 }, (_, i) => shiftYM(ym, i - 5));
      const { from } = monthRange(months[0]);
      const { to } = monthRange(ym);
      const [all, mi] = await Promise.all([fetchFinanceEntries(from, to), fetchMemberIncome()]);
      const auto = mi.reduce((s, r) => s + r.amount, 0);
      setEntries(all.filter((e) => e.entry_date.startsWith(ym)));
      setHistory(
        months.map((m) => {
          const monthEntries = all.filter((e) => e.entry_date.startsWith(m));
          return {
            ym: m,
            income:
              auto +
              monthEntries.filter((e) => e.kind === 'income').reduce((s, e) => s + e.amount, 0),
            expense: monthEntries
              .filter((e) => e.kind === 'expense')
              .reduce((s, e) => s + e.amount, 0),
          };
        }),
      );
      setMemberIncome(mi);
    } catch (e) {
      console.error(e);
      setError('No se pudieron cargar los movimientos.');
    }
  }, [ym]);

  useEffect(() => {
    setEntries(null);
    setHistory(null);
    void load();
  }, [load]);

  const totals = useMemo(() => {
    const auto = (memberIncome ?? []).reduce((s, r) => s + r.amount, 0);
    const manual = (entries ?? [])
      .filter((e) => e.kind === 'income')
      .reduce((s, e) => s + e.amount, 0);
    const expense = (entries ?? [])
      .filter((e) => e.kind === 'expense')
      .reduce((s, e) => s + e.amount, 0);
    const income = auto + manual;
    return { auto, income, expense, balance: income - expense };
  }, [entries, memberIncome]);

  async function handleDelete(entry: FinanceEntry) {
    if (!window.confirm(`¿Eliminar «${entry.concept}» (${EUR.format(entry.amount)})?`)) return;
    setBusyId(entry.id);
    try {
      await deleteFinanceEntry(entry.id, entry.invoice_path);
      await load();
    } catch (e) {
      console.error(e);
      window.alert('No se pudo eliminar el movimiento.');
    } finally {
      setBusyId(null);
    }
  }

  async function openInvoice(entry: FinanceEntry) {
    if (!entry.invoice_path) return;
    try {
      const url = await getInvoiceUrl(entry.invoice_path);
      window.open(url, '_blank', 'noopener');
    } catch {
      window.alert('No se pudo abrir la factura.');
    }
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-white">Ingresos y gastos</h2>
        <button onClick={() => setCreating(true)} className="btn-primary !px-3.5 !py-2 text-xs">
          <Plus className="h-4 w-4" /> Añadir
        </button>
      </div>

      {/* Selector de mes */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          onClick={() => setYm((v) => shiftYM(v, -1))}
          className="btn-icon"
          aria-label="Mes anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-semibold text-zinc-200">{formatYM(ym)}</p>
          {ym !== currentYM() && (
            <button
              onClick={() => setYm(currentYM())}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] font-medium text-zinc-400 transition hover:text-white"
            >
              Este mes
            </button>
          )}
        </div>
        <button
          onClick={() => setYm((v) => shiftYM(v, 1))}
          className="btn-icon"
          aria-label="Mes siguiente"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Totales del mes */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        <div className="card min-w-0 p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            <TrendingUp className="h-3.5 w-3.5 text-accent-400" /> Ingresos
          </p>
          <p className="mt-1 truncate font-display text-base font-bold text-accent-300 sm:text-lg">
            {EUR.format(totals.income)}
          </p>
        </div>
        <div className="card min-w-0 p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            <TrendingDown className="h-3.5 w-3.5 text-brand-300" /> Gastos
          </p>
          <p className="mt-1 truncate font-display text-base font-bold text-brand-300 sm:text-lg">
            {EUR.format(totals.expense)}
          </p>
        </div>
        <div className="card min-w-0 p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            <Wallet className="h-3.5 w-3.5 text-amber-400" /> Balance
          </p>
          <p
            className={`mt-1 truncate font-display text-base font-bold sm:text-lg ${
              totals.balance >= 0 ? 'text-white' : 'text-brand-300'
            }`}
          >
            {EUR.format(totals.balance)}
          </p>
        </div>
      </div>

      {/* Evolución de los últimos 6 meses (hasta el mes seleccionado) */}
      {history !== null && <FinanceChart data={history} />}

      {/* Cuotas de socios: ingreso automático calculado en vivo */}
      {memberIncome !== null && (
        <div className="card mb-2 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowBreakdown((v) => !v)}
            className="flex w-full min-w-0 items-center gap-3 p-3.5 text-left"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-500/15 text-accent-300 ring-1 ring-accent-500/25">
              <Users className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-semibold text-white">
                Cuotas de socios
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 ring-1 ring-white/10">
                  Automático
                </span>
              </p>
              <p className="mt-0.5 text-xs text-zinc-500">
                {memberIncome.length === 0
                  ? 'Sin socios activos este mes'
                  : `${memberIncome.length} ${memberIncome.length === 1 ? 'socio activo' : 'socios activos'} · según su plan o la cuota estándar`}
              </p>
            </div>
            <p className="shrink-0 font-display text-sm font-bold text-accent-300">
              +{EUR.format(totals.auto)}
            </p>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${showBreakdown ? 'rotate-180' : ''}`}
            />
          </button>
          {showBreakdown && memberIncome.length > 0 && (
            <div className="border-t border-white/5 px-3.5 py-2">
              {memberIncome.map((r) => (
                <div key={r.member_id} className="flex min-w-0 items-center gap-2 py-1.5">
                  <p className="min-w-0 flex-1 truncate text-xs text-zinc-300">{r.member_name}</p>
                  <p className="shrink-0 text-[11px] text-zinc-500">{r.plan_name}</p>
                  <p className="w-20 shrink-0 text-right text-xs font-semibold text-zinc-200">
                    {EUR.format(r.amount)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <p className="mb-3 text-sm text-brand-300">{error}</p>}

      {entries === null ? (
        <div className="flex items-center justify-center py-12 text-zinc-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-zinc-500">
          Sin movimientos en {formatYM(ym).toLowerCase()}. Pulsa «Añadir» para registrar el primero.
        </p>
      ) : (
        <div className="space-y-2">
          {entries.map((e) => (
            <motion.div
              key={e.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="card flex min-w-0 items-center gap-3 p-3.5"
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${
                  e.kind === 'income'
                    ? 'bg-accent-500/15 text-accent-300 ring-accent-500/25'
                    : 'bg-brand-500/10 text-brand-300 ring-brand-500/20'
                }`}
              >
                {e.kind === 'income' ? (
                  <TrendingUp className="h-4 w-4" />
                ) : (
                  <TrendingDown className="h-4 w-4" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{e.concept}</p>
                <p className="mt-0.5 text-xs capitalize text-zinc-500">
                  {formatEntryDate(e.entry_date)}
                </p>
              </div>
              <p
                className={`shrink-0 font-display text-sm font-bold ${
                  e.kind === 'income' ? 'text-accent-300' : 'text-brand-300'
                }`}
              >
                {e.kind === 'income' ? '+' : '−'}
                {EUR.format(e.amount)}
              </p>
              {e.invoice_path && (
                <button
                  onClick={() => void openInvoice(e)}
                  className="btn-icon !text-accent-300 hover:!text-accent-200"
                  aria-label="Ver factura"
                  title="Ver factura"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => setEditing(e)}
                className="btn-icon"
                aria-label="Editar movimiento"
                title="Editar"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={() => void handleDelete(e)}
                disabled={busyId === e.id}
                className="btn-icon hover:!text-brand-300"
                aria-label="Eliminar movimiento"
                title="Eliminar"
              >
                {busyId === e.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </button>
            </motion.div>
          ))}
        </div>
      )}

      <EntryModal
        open={creating || editing !== null}
        entry={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={load}
      />
    </section>
  );
}

function EntryModal({
  open,
  entry,
  onClose,
  onSaved,
}: {
  open: boolean;
  entry: FinanceEntry | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [kind, setKind] = useState<FinanceKind>('income');
  const [concept, setConcept] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [existingInvoice, setExistingInvoice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const mobile = isMobileDevice();

  useEffect(() => {
    if (open) {
      setKind(entry?.kind ?? 'income');
      setConcept(entry?.concept ?? '');
      setAmount(entry ? String(entry.amount) : '');
      setDate(entry?.entry_date ?? todayISO());
      setInvoiceFile(null);
      setExistingInvoice(entry?.invoice_path ?? null);
      setError(null);
    }
  }, [open, entry]);

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (f) setInvoiceFile(f);
    e.target.value = ''; // permite volver a elegir el mismo archivo
  }

  async function viewExisting() {
    if (!existingInvoice) return;
    try {
      window.open(await getInvoiceUrl(existingInvoice), '_blank', 'noopener');
    } catch {
      setError('No se pudo abrir la factura.');
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const value = Number(amount.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) {
      setError('Introduce un importe válido mayor que 0.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Factura: subir la nueva, o borrar la anterior si se quitó / cambió el tipo
      let invoicePath = kind === 'expense' ? existingInvoice : null;
      if (kind === 'expense' && invoiceFile) {
        invoicePath = await uploadInvoice(invoiceFile);
      }
      if (entry?.invoice_path && entry.invoice_path !== invoicePath) {
        await deleteInvoice(entry.invoice_path).catch(() => undefined);
      }
      const input = {
        kind,
        concept: concept.trim(),
        amount: Math.round(value * 100) / 100,
        entry_date: date,
        invoice_path: invoicePath,
      };
      if (entry) await updateFinanceEntry(entry.id, input);
      else await createFinanceEntry(input);
      await onSaved();
      onClose();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'No se pudo guardar el movimiento.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={entry ? 'Editar movimiento' : 'Nuevo movimiento'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Tipo */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setKind('income')}
            className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
              kind === 'income'
                ? 'border-accent-500/40 bg-accent-500/10 text-accent-300'
                : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <TrendingUp className="h-4 w-4" /> Ingreso
          </button>
          <button
            type="button"
            onClick={() => setKind('expense')}
            className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
              kind === 'expense'
                ? 'border-brand-500/40 bg-brand-500/10 text-brand-300'
                : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <TrendingDown className="h-4 w-4" /> Gasto
          </button>
        </div>

        <div>
          <label htmlFor="fin-concept" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Concepto
          </label>
          <input
            id="fin-concept"
            required
            maxLength={120}
            className="input"
            placeholder={kind === 'income' ? 'Cuota de agosto · Juan' : 'Vendas y guantes'}
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="fin-amount" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Importe (€)
            </label>
            <input
              id="fin-amount"
              required
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              className="input"
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="fin-date" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Fecha
            </label>
            <input
              id="fin-date"
              required
              type="date"
              className="input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>

        {/* Factura adjunta (solo gastos): foto con la cámara o archivo imagen/PDF */}
        {kind === 'expense' && (
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Factura <span className="normal-case text-zinc-600">(opcional)</span>
            </label>

            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={pickFile}
            />
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={pickFile}
            />

            {invoiceFile ? (
              <div className="flex items-center gap-2.5 rounded-xl border border-accent-500/25 bg-accent-500/10 px-3 py-2.5">
                <FileText className="h-4 w-4 shrink-0 text-accent-300" />
                <p className="min-w-0 flex-1 truncate text-xs text-zinc-200">
                  {invoiceFile.name}
                  <span className="ml-1.5 text-zinc-500">
                    {invoiceFile.size < 1024 * 1024
                      ? `${Math.max(1, Math.round(invoiceFile.size / 1024))} KB`
                      : `${(invoiceFile.size / (1024 * 1024)).toFixed(1)} MB`}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => setInvoiceFile(null)}
                  className="shrink-0 rounded-lg p-1 text-zinc-500 transition hover:text-zinc-200"
                  aria-label="Quitar factura"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : existingInvoice ? (
              <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                <Paperclip className="h-4 w-4 shrink-0 text-accent-300" />
                <button
                  type="button"
                  onClick={() => void viewExisting()}
                  className="min-w-0 flex-1 truncate text-left text-xs font-medium text-zinc-200 underline-offset-2 hover:underline"
                >
                  Ver factura adjunta
                </button>
                <button
                  type="button"
                  onClick={() => setExistingInvoice(null)}
                  className="shrink-0 rounded-lg p-1 text-zinc-500 transition hover:text-brand-300"
                  aria-label="Quitar factura"
                  title="Quitar factura"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 px-3 py-2.5 text-xs font-medium text-zinc-300 transition hover:border-white/30 hover:text-white"
                >
                  <Upload className="h-4 w-4" /> Subir imagen o PDF
                </button>
                {mobile && (
                  <button
                    type="button"
                    onClick={() => cameraRef.current?.click()}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 px-3 py-2.5 text-xs font-medium text-zinc-300 transition hover:border-white/30 hover:text-white"
                  >
                    <Camera className="h-4 w-4" /> Hacer foto
                  </button>
                )}
              </div>
            )}
          </div>
        )}

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
