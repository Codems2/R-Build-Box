import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Check, ChevronDown, Loader2, Minus, Plus, Search, X } from 'lucide-react';
import Modal from '../Modal';
import { matchesQuery } from './MemberFilters';
import { ClientPreview, emitirPdf, InvoiceIssuedView, IssuerMissing, type EmisionPdf } from './InvoiceShared';
import {
  fetchAppSettings,
  fetchBillingSettings,
  fetchLastInvoiceDate,
  fetchMembers,
  fetchPlans,
  issueInvoice,
} from '../../lib/api';
import { capFirst, invoiceTotals, lineAmounts, VAT_RATE } from '../../lib/invoiceMath';
import { todayISO } from '../../lib/dates';
import { useAuth } from '../../lib/auth';
import { memberFullName, type IssuedInvoice, type Member } from '../../lib/types';

const EUR = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const fechaES = (iso: string) => iso.split('-').reverse().join('/');

/** Lo que se puede facturar: la cuota estándar y los planes con precio */
interface Producto {
  key: string;
  plan_id: string | null;
  name: string;
  detail: string | null;
  price: number;
}

interface Datos {
  members: Member[];
  productos: Producto[];
  emisorOk: boolean;
  ultimaFecha: string | null;
}

const LABEL = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400';

/**
 * Generar factura: cliente (lista con buscador), productos (selección
 * múltiple con cantidades) y fecha. Al guardar, la base de datos asigna el
 * número, el PDF se descarga en el dispositivo y se guarda en «Facturas».
 */
export default function GenerateInvoiceModal({
  open,
  onClose,
  onIssued,
}: {
  open: boolean;
  onClose: () => void;
  onIssued?: () => void;
}) {
  const { logoUrl } = useAuth();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [clientId, setClientId] = useState<string | null>(null);
  const [clientOpen, setClientOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [productsOpen, setProductsOpen] = useState(false);
  const [fecha, setFecha] = useState(todayISO());

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<EmisionPdf | null>(null);

  // Cada vez que se abre: formulario limpio y datos frescos
  useEffect(() => {
    if (!open) return;
    setDatos(null);
    setLoadError(null);
    setClientId(null);
    setClientOpen(false);
    setQuery('');
    setCantidades({});
    setProductsOpen(false);
    setFecha(todayISO());
    setError(null);
    setResultado(null);
    let active = true;
    Promise.all([fetchMembers(), fetchPlans(), fetchAppSettings(), fetchBillingSettings(), fetchLastInvoiceDate()])
      .then(([members, plans, settings, billing, ultimaFecha]) => {
        if (!active) return;
        const productos: Producto[] = [
          ...(settings.default_monthly_fee > 0
            ? [
                {
                  key: 'standard',
                  plan_id: null,
                  name: 'Cuota estándar',
                  detail: 'Cuota mensual',
                  price: settings.default_monthly_fee,
                },
              ]
            : []),
          ...plans
            .filter((p) => p.monthly_price > 0)
            .map((p) => ({
              key: p.id,
              plan_id: p.id,
              name: capFirst(p.name.trim()),
              detail: p.description?.trim() ? capFirst(p.description.trim()) : null,
              price: p.monthly_price,
            })),
        ];
        setDatos({
          members: [...members].sort((a, b) => memberFullName(a).localeCompare(memberFullName(b), 'es')),
          productos,
          emisorOk: Boolean(billing.issuer_name?.trim() && billing.issuer_nif?.trim()),
          ultimaFecha,
        });
      })
      .catch(() => active && setLoadError('No se pudieron cargar los socios y los productos.'));
    return () => {
      active = false;
    };
  }, [open]);

  const cliente = datos?.members.find((m) => m.id === clientId) ?? null;
  const filtrados = useMemo(
    () => (datos?.members ?? []).filter((m) => matchesQuery(m, query)),
    [datos, query],
  );
  const elegidos = (datos?.productos ?? []).filter((p) => (cantidades[p.key] ?? 0) > 0);
  const lineas = elegidos.map((p) => ({ ...p, qty: cantidades[p.key], ...lineAmounts(p.price, cantidades[p.key]) }));
  const totales = invoiceTotals(lineas);

  const hoy = todayISO();
  const fechaError = !fecha
    ? 'Indica la fecha de la factura.'
    : fecha > hoy
      ? 'La fecha no puede ser posterior a hoy.'
      : datos?.ultimaFecha && fecha < datos.ultimaFecha
        ? `No puede ser anterior a la última factura emitida (${fechaES(datos.ultimaFecha)}).`
        : null;
  const listo = Boolean(datos?.emisorOk && cliente && lineas.length > 0 && !fechaError);

  function toggleProducto(key: string) {
    setCantidades((c) => {
      const next = { ...c };
      if ((next[key] ?? 0) > 0) delete next[key];
      else next[key] = 1;
      return next;
    });
  }

  function cambiarCantidad(key: string, delta: number) {
    setCantidades((c) => {
      const n = Math.min(99, (c[key] ?? 0) + delta);
      const next = { ...c };
      if (n <= 0) delete next[key];
      else next[key] = n;
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!listo || !cliente || saving) return;
    setSaving(true);
    setError(null);

    // 1. La base de datos asigna el número y guarda la factura
    let inv: IssuedInvoice;
    try {
      inv = await issueInvoice(
        cliente.id,
        fecha,
        lineas.map((l) => ({ plan_id: l.plan_id, quantity: l.qty })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo emitir la factura.');
      setSaving(false);
      return;
    }

    // 2. PDF: se descarga en el dispositivo y se sube a «Facturas»
    setResultado(await emitirPdf(inv, logoUrl));
    setSaving(false);
    onIssued?.();
  }

  // ===== Factura emitida ======================================================
  if (resultado) {
    return (
      <Modal open={open} onClose={onClose} title="Factura emitida">
        <InvoiceIssuedView emision={resultado} onClose={onClose} />
      </Modal>
    );
  }

  // ===== Formulario ===========================================================
  return (
    <Modal open={open} onClose={onClose} title="Generar factura">
      {!datos ? (
        <div className="flex items-center justify-center py-10 text-zinc-400">
          {loadError ? (
            <p className="text-sm text-brand-300">{loadError}</p>
          ) : (
            <Loader2 className="h-5 w-5 animate-spin" />
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {!datos.emisorOk && <IssuerMissing />}

          {/* ===== Cliente ===== */}
          <div>
            <p id="inv-client-label" className={LABEL}>
              Cliente
            </p>
            <button
              type="button"
              aria-haspopup="listbox"
              aria-expanded={clientOpen}
              aria-labelledby="inv-client-label"
              onClick={() => {
                setClientOpen((v) => !v);
                setProductsOpen(false);
              }}
              className="input flex items-center gap-2 text-left"
            >
              <span className={`min-w-0 flex-1 truncate ${cliente ? 'text-zinc-100' : 'text-zinc-500'}`}>
                {cliente ? memberFullName(cliente) : 'Selecciona un cliente'}
              </span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${clientOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {clientOpen && (
              <div className="mt-1.5 overflow-hidden rounded-xl border border-white/10 bg-ink-800">
                <div className="relative border-b border-white/5">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar por nombre, email o teléfono"
                    aria-label="Buscar cliente"
                    className="w-full bg-transparent py-2.5 pl-9 pr-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
                  />
                </div>
                <ul role="listbox" aria-labelledby="inv-client-label" className="max-h-56 overflow-y-auto p-1">
                  {filtrados.length === 0 ? (
                    <li className="px-3 py-3 text-center text-xs text-zinc-500">Ningún socio coincide</li>
                  ) : (
                    filtrados.map((m) => {
                      const sel = m.id === clientId;
                      return (
                        <li key={m.id}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={sel}
                            onClick={() => {
                              setClientId(m.id);
                              setClientOpen(false);
                              setQuery('');
                            }}
                            className={`flex w-full min-w-0 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                              sel ? 'bg-brand-600/20 text-white' : 'text-zinc-300 hover:bg-white/[0.05]'
                            }`}
                          >
                            <span className="min-w-0 flex-1 truncate">{memberFullName(m)}</span>
                            <span className="shrink-0 text-[11px] tabular-nums text-zinc-500">#{m.member_no}</span>
                            {sel && <Check className="h-4 w-4 shrink-0 text-brand-300" />}
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              </div>
            )}

            {/* Lo que saldrá del cliente: solo los datos que tenga rellenos */}
            {cliente && !clientOpen && (
              <div className="mt-2">
                <ClientPreview member={cliente} />
              </div>
            )}
          </div>

          {/* ===== Productos (selección múltiple) ===== */}
          <div>
            <p id="inv-products-label" className={LABEL}>
              Productos
            </p>
            <button
              type="button"
              aria-haspopup="listbox"
              aria-expanded={productsOpen}
              aria-labelledby="inv-products-label"
              onClick={() => {
                setProductsOpen((v) => !v);
                setClientOpen(false);
              }}
              className="input flex items-center gap-2 text-left"
            >
              <span className={`min-w-0 flex-1 truncate ${elegidos.length ? 'text-zinc-100' : 'text-zinc-500'}`}>
                {elegidos.length === 0
                  ? 'Selecciona uno o varios productos'
                  : elegidos.map((p) => p.name).join(', ')}
              </span>
              {elegidos.length > 0 && (
                <span className="shrink-0 rounded-full bg-brand-600/20 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-brand-200">
                  {elegidos.length}
                </span>
              )}
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${productsOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {productsOpen && (
              <ul
                role="listbox"
                aria-multiselectable="true"
                aria-labelledby="inv-products-label"
                className="mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-ink-800 p-1"
              >
                {datos.productos.length === 0 ? (
                  <li className="px-3 py-3 text-center text-xs text-zinc-500">
                    No hay planes con precio. Créalos en la pestaña de planes.
                  </li>
                ) : (
                  datos.productos.map((p) => {
                    const sel = (cantidades[p.key] ?? 0) > 0;
                    return (
                      <li key={p.key}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={sel}
                          onClick={() => toggleProducto(p.key)}
                          className={`flex w-full min-w-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition ${
                            sel ? 'bg-brand-600/15' : 'hover:bg-white/[0.05]'
                          }`}
                        >
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                              sel ? 'border-brand-500 bg-brand-600 text-white' : 'border-white/20'
                            }`}
                          >
                            {sel && <Check className="h-3 w-3" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-zinc-100">{p.name}</span>
                            {p.detail && <span className="block truncate text-[11px] text-zinc-500">{p.detail}</span>}
                          </span>
                          <span className="shrink-0 text-xs font-semibold tabular-nums text-zinc-300">
                            {EUR.format(p.price)}
                          </span>
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            )}

            {/* Seleccionados, con su cantidad */}
            {lineas.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {lineas.map((l) => (
                  <div
                    key={l.key}
                    className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-white/10 bg-white/[0.03] py-1.5 pl-3 pr-1.5"
                  >
                    {/* En pantallas estrechas, cantidad e importe bajan a otra línea */}
                    <div className="min-w-[8rem] flex-1">
                      <p className="truncate text-xs font-semibold text-zinc-100">{l.name}</p>
                      <p className="whitespace-nowrap text-[11px] tabular-nums text-zinc-500">
                        {EUR.format(l.price)} / ud.
                      </p>
                    </div>
                    <div className="ml-auto flex shrink-0 items-center gap-2">
                      <div className="flex shrink-0 items-center rounded-lg border border-white/10">
                        <button
                          type="button"
                          onClick={() => cambiarCantidad(l.key, -1)}
                          aria-label={`Una unidad menos de ${l.name}`}
                          className="flex h-8 w-8 items-center justify-center text-zinc-400 transition hover:text-white"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-6 text-center text-xs font-semibold tabular-nums text-white">
                          {l.qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => cambiarCantidad(l.key, 1)}
                          disabled={l.qty >= 99}
                          aria-label={`Una unidad más de ${l.name}`}
                          className="flex h-8 w-8 items-center justify-center text-zinc-400 transition hover:text-white disabled:opacity-40"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <p className="w-16 shrink-0 text-right text-xs font-semibold tabular-nums text-zinc-100">
                        {EUR.format(l.total)}
                      </p>
                      <button
                        type="button"
                        onClick={() => toggleProducto(l.key)}
                        aria-label={`Quitar ${l.name}`}
                        className="flex h-8 w-7 shrink-0 items-center justify-center text-zinc-500 transition hover:text-brand-300"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ===== Fecha ===== */}
          <div>
            <label htmlFor="inv-date" className={LABEL}>
              Fecha de la factura
            </label>
            <input
              id="inv-date"
              type="date"
              required
              className="input"
              value={fecha}
              max={hoy}
              min={datos.ultimaFecha ?? undefined}
              onChange={(e) => setFecha(e.target.value)}
            />
            {fechaError && fecha && <p className="mt-1.5 text-xs text-brand-300">{fechaError}</p>}
          </div>

          {/* ===== Totales ===== */}
          {lineas.length > 0 && (
            <div className="space-y-1 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs">
              <div className="flex justify-between text-zinc-400">
                <span>Base imponible</span>
                <span className="tabular-nums">{EUR.format(totales.base)}</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>IVA ({VAT_RATE} %)</span>
                <span className="tabular-nums">{EUR.format(totales.vat)}</span>
              </div>
              <div className="flex justify-between border-t border-white/5 pt-1.5 text-sm font-bold text-white">
                <span>Total</span>
                <span className="tabular-nums">{EUR.format(totales.total)}</span>
              </div>
              <p className="text-[11px] text-zinc-500">Los precios de los planes llevan el IVA incluido.</p>
            </div>
          )}

          {error && <p className="text-sm text-brand-300">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">
              Cerrar
            </button>
            <button type="submit" disabled={!listo || saving} className="btn-primary flex-1">
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Guardando…
                </>
              ) : (
                'Guardar'
              )}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
