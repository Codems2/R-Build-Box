import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Briefcase, Check, ChevronDown, Dumbbell, Loader2, Minus, Plus, Search, X } from 'lucide-react';
import Modal from '../Modal';
import { matchesQuery } from './MemberFilters';
import {
  ClientPreview,
  emitirPdf,
  InvoiceIssuedView,
  IssuerMissing,
  memberParty,
  type EmisionPdf,
} from './InvoiceShared';
import {
  fetchAppSettings,
  fetchBillingSettings,
  fetchLastInvoiceDate,
  fetchMembers,
  fetchMembersBilling,
  fetchPlans,
  issueInvoice,
  issueManualInvoice,
  updateMemberBilling,
} from '../../lib/api';
import {
  capFirst,
  invoiceTotals,
  lineAmounts,
  manualLineAmounts,
  manualTotals,
  parseAmount,
  round2,
  VAT_RATE,
} from '../../lib/invoiceMath';
import { todayISO } from '../../lib/dates';
import { useAuth } from '../../lib/auth';
import { memberFullName, type IssuedInvoice, type Member, type MemberBilling } from '../../lib/types';

const EUR = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const fechaES = (iso: string) => iso.split('-').reverse().join('/');
const LABEL = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400';
const OPCIONAL = <span className="normal-case text-zinc-600">(opcional)</span>;

type Pestana = 'box' | 'asesoria';
const PESTANAS: { key: Pestana; label: string; icon: typeof Dumbbell }[] = [
  { key: 'box', label: 'Box Thai', icon: Dumbbell },
  { key: 'asesoria', label: 'Asesorías', icon: Briefcase },
];

/** Aviso de fecha: ni futura ni anterior a la última factura de su serie */
function errorDeFecha(fecha: string, ultima: string | null): string | null {
  if (!fecha) return 'Indica la fecha de la factura.';
  if (fecha > todayISO()) return 'La fecha no puede ser posterior a hoy.';
  if (ultima && fecha < ultima) return `No puede ser anterior a la última factura de esta serie (${fechaES(ultima)}).`;
  return null;
}

/**
 * Generar factura, con dos pestañas:
 *  · Box Thai: cliente de la lista de socios, productos de los planes (precio
 *    con IVA incluido) y fecha. El NIF y la dirección se guardan en su ficha.
 *  · Asesorías: todo escrito a mano; precios sin IVA (se suma el 21 %) y
 *    numeración propia (serie A).
 * Al guardar, la factura se descarga en el dispositivo y queda en «Facturas».
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
  const [pestana, setPestana] = useState<Pestana>('box');
  const [resultado, setResultado] = useState<EmisionPdf | null>(null);

  useEffect(() => {
    if (open) {
      setPestana('box');
      setResultado(null);
    }
  }, [open]);

  const alEmitir = (e: EmisionPdf) => {
    setResultado(e);
    onIssued?.();
  };

  if (resultado) {
    return (
      <Modal open={open} onClose={onClose} title="Factura emitida">
        <InvoiceIssuedView emision={resultado} onClose={onClose} />
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Generar factura">
      {/* Pestañas, con el mismo estilo que las del panel. Sin layoutId: dentro
          de un modal (AnimatePresence) impedía que el modal terminara de
          cerrarse y dejaba una capa invisible bloqueando la página. */}
      <div role="tablist" className="mb-4 flex gap-1 rounded-2xl border border-white/5 bg-white/[0.03] p-1">
        {PESTANAS.map((t) => {
          const activa = pestana === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={activa}
              onClick={() => setPestana(t.key)}
              className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-medium transition sm:text-sm ${
                activa
                  ? 'bg-white/[0.07] text-white ring-1 ring-white/10'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <t.icon className="h-4 w-4" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Las dos se quedan montadas para no perder lo escrito al cambiar */}
      <div role="tabpanel" hidden={pestana !== 'box'}>
        <BoxThaiForm onClose={onClose} onIssued={alEmitir} />
      </div>
      <div role="tabpanel" hidden={pestana !== 'asesoria'}>
        <AsesoriaForm onClose={onClose} onIssued={alEmitir} />
      </div>
    </Modal>
  );
}

// ===========================================================================
// Pestaña Box Thai
// ===========================================================================

/** Lo que se puede facturar: la cuota estándar y los planes con precio */
interface Producto {
  key: string;
  plan_id: string | null;
  name: string;
  detail: string | null;
  price: number;
}

interface DatosBox {
  members: Member[];
  billing: Record<string, MemberBilling>;
  productos: Producto[];
  emisorOk: boolean;
  ultimaFecha: string | null;
}

const SIN_DATOS: MemberBilling = { nif: null, address1: null, address2: null };

function BoxThaiForm({ onClose, onIssued }: { onClose: () => void; onIssued: (e: EmisionPdf) => void }) {
  const { logoUrl } = useAuth();
  const [datos, setDatos] = useState<DatosBox | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [clientId, setClientId] = useState<string | null>(null);
  const [clientOpen, setClientOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [fiscal, setFiscal] = useState<MemberBilling>(SIN_DATOS);
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [productsOpen, setProductsOpen] = useState(false);
  const [fecha, setFecha] = useState(todayISO());

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Al montarse (cada vez que se abre el modal): datos frescos
  useEffect(() => {
    let active = true;
    Promise.all([
      fetchMembers(),
      fetchMembersBilling(),
      fetchPlans(),
      fetchAppSettings(),
      fetchBillingSettings(),
      fetchLastInvoiceDate('box'),
    ])
      .then(([members, billing, plans, settings, emisor, ultimaFecha]) => {
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
          billing,
          productos,
          emisorOk: Boolean(emisor.issuer_name?.trim() && emisor.issuer_nif?.trim()),
          ultimaFecha,
        });
      })
      .catch(() => active && setLoadError('No se pudieron cargar los socios y los productos.'));
    return () => {
      active = false;
    };
  }, []);

  const cliente = datos?.members.find((m) => m.id === clientId) ?? null;
  const filtrados = useMemo(
    () => (datos?.members ?? []).filter((m) => matchesQuery(m, query)),
    [datos, query],
  );
  const elegidos = (datos?.productos ?? []).filter((p) => (cantidades[p.key] ?? 0) > 0);
  const lineas = elegidos.map((p) => ({ ...p, qty: cantidades[p.key], ...lineAmounts(p.price, cantidades[p.key]) }));
  const totales = invoiceTotals(lineas);

  const nifLimpio = (fiscal.nif ?? '').replace(/[\s-]/g, '');
  const nifError = nifLimpio && (nifLimpio.length < 3 || nifLimpio.length > 20) ? 'El NIF no parece válido.' : null;
  const fechaError = errorDeFecha(fecha, datos?.ultimaFecha ?? null);
  const listo = Boolean(datos?.emisorOk && cliente && lineas.length > 0 && !fechaError && !nifError);

  function elegirCliente(m: Member) {
    setClientId(m.id);
    setClientOpen(false);
    setQuery('');
    setFiscal(datos?.billing[m.id] ?? SIN_DATOS);
  }

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
    if (!listo || !cliente || !datos || saving) return;
    setSaving(true);
    setError(null);

    // 1. NIF y dirección a la ficha del socio, si han cambiado
    const antes = datos.billing[cliente.id] ?? SIN_DATOS;
    const norm = (v: string | null) => (v ?? '').trim();
    const cambiado =
      norm(fiscal.nif) !== norm(antes.nif) ||
      norm(fiscal.address1) !== norm(antes.address1) ||
      norm(fiscal.address2) !== norm(antes.address2);

    // 2. La base de datos asigna el número y guarda la factura
    let inv: IssuedInvoice;
    try {
      if (cambiado) {
        await updateMemberBilling(cliente.id, fiscal);
        setDatos((d) => (d ? { ...d, billing: { ...d.billing, [cliente.id]: fiscal } } : d));
      }
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

    // 3. PDF: se descarga en el dispositivo y se sube a «Facturas»
    const emision = await emitirPdf(inv, logoUrl);
    setSaving(false);
    onIssued(emision);
  }

  if (!datos) {
    return (
      <div className="flex items-center justify-center py-10 text-zinc-400">
        {loadError ? <p className="text-sm text-brand-300">{loadError}</p> : <Loader2 className="h-5 w-5 animate-spin" />}
      </div>
    );
  }

  return (
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
                        onClick={() => elegirCliente(m)}
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

        {cliente && !clientOpen && (
          <div className="mt-2 space-y-3">
            {/* NIF y dirección: se guardan en la ficha del socio */}
            <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
              <div>
                <label htmlFor="box-nif" className={LABEL}>
                  NIF {OPCIONAL}
                </label>
                <input
                  id="box-nif"
                  maxLength={20}
                  className="input uppercase"
                  placeholder="00000000T"
                  value={fiscal.nif ?? ''}
                  onChange={(e) => setFiscal((f) => ({ ...f, nif: e.target.value }))}
                />
              </div>
              <div>
                <label htmlFor="box-addr1" className={LABEL}>
                  Dirección {OPCIONAL}
                </label>
                <input
                  id="box-addr1"
                  maxLength={120}
                  className="input"
                  placeholder="Calle, número y piso"
                  value={fiscal.address1 ?? ''}
                  onChange={(e) => setFiscal((f) => ({ ...f, address1: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label htmlFor="box-addr2" className={LABEL}>
                Código postal, localidad y provincia {OPCIONAL}
              </label>
              <input
                id="box-addr2"
                maxLength={120}
                className="input"
                placeholder="00000, Localidad, Provincia"
                value={fiscal.address2 ?? ''}
                onChange={(e) => setFiscal((f) => ({ ...f, address2: e.target.value }))}
              />
              <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-600">
                Se guardan en la ficha del socio para sus próximas facturas.
              </p>
              {nifError && <p className="mt-1 text-xs text-brand-300">{nifError}</p>}
            </div>
            {/* Lo que saldrá del cliente: solo los datos que tenga rellenos */}
            <ClientPreview party={memberParty(cliente, fiscal)} />
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
            {elegidos.length === 0 ? 'Selecciona uno o varios productos' : elegidos.map((p) => p.name).join(', ')}
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
                    <span className="w-6 text-center text-xs font-semibold tabular-nums text-white">{l.qty}</span>
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

      <CampoFecha id="inv-date" fecha={fecha} onFecha={setFecha} ultima={datos.ultimaFecha} error={fechaError} />

      {lineas.length > 0 && <Totales {...totales} nota="Los precios de los planes llevan el IVA incluido." />}

      {error && <p className="text-sm text-brand-300">{error}</p>}
      <Botones onClose={onClose} listo={listo} saving={saving} />
    </form>
  );
}

// ===========================================================================
// Pestaña Asesorías: todo a mano, precios sin IVA
// ===========================================================================

interface FilaManual {
  id: number;
  concept: string;
  qty: string;
  price: string;
}

let siguienteFila = 1;
const filaVacia = (): FilaManual => ({ id: siguienteFila++, concept: '', qty: '1', price: '' });

function AsesoriaForm({ onClose, onIssued }: { onClose: () => void; onIssued: (e: EmisionPdf) => void }) {
  const [cargado, setCargado] = useState<{ emisorOk: boolean; ultimaFecha: string | null } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [nombre, setNombre] = useState('');
  const [nif, setNif] = useState('');
  const [dir1, setDir1] = useState('');
  const [dir2, setDir2] = useState('');
  const [filas, setFilas] = useState<FilaManual[]>(() => [filaVacia()]);
  const [fecha, setFecha] = useState(todayISO());
  const [intentado, setIntentado] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([fetchBillingSettings(), fetchLastInvoiceDate('asesoria')])
      .then(([emisor, ultimaFecha]) => {
        if (active) setCargado({ emisorOk: Boolean(emisor.issuer_name?.trim() && emisor.issuer_nif?.trim()), ultimaFecha });
      })
      .catch(() => active && setLoadError('No se pudieron cargar los datos de facturación.'));
    return () => {
      active = false;
    };
  }, []);

  // Cada fila: cantidad y precio válidos y su importe sin IVA
  const lineas = filas.map((f) => {
    const qty = parseAmount(f.qty);
    const price = parseAmount(f.price);
    const qtyOk = qty !== null && qty > 0 && qty <= 9999 && round2(qty) === qty;
    const priceOk = price !== null && price > 0 && price <= 999999;
    const conceptOk = f.concept.trim().length > 0;
    const importe = qtyOk && priceOk ? manualLineAmounts(qty, round2(price)).base : null;
    return { ...f, qtyN: qty, priceN: price, qtyOk, priceOk, conceptOk, base: importe ?? 0, ok: qtyOk && priceOk && conceptOk };
  });
  const totales = manualTotals(lineas.filter((l) => l.ok));

  const nifLimpio = nif.replace(/[\s-]/g, '');
  const faltan = {
    nombre: !nombre.trim(),
    nif: nifLimpio.length < 3 || nifLimpio.length > 20,
    dir1: !dir1.trim(),
  };
  const fechaError = errorDeFecha(fecha, cargado?.ultimaFecha ?? null);
  const listo = Boolean(
    cargado?.emisorOk &&
      !faltan.nombre &&
      !faltan.nif &&
      !faltan.dir1 &&
      lineas.length > 0 &&
      lineas.every((l) => l.ok) &&
      !fechaError,
  );

  const cambiarFila = (id: number, k: 'concept' | 'qty' | 'price', v: string) =>
    setFilas((fs) => fs.map((f) => (f.id === id ? { ...f, [k]: v } : f)));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIntentado(true);
    if (!listo || saving) return;
    setSaving(true);
    setError(null);
    let inv: IssuedInvoice;
    try {
      inv = await issueManualInvoice(
        fecha,
        { name: nombre, nif, address1: dir1, address2: dir2.trim() || null },
        lineas.map((l) => ({ concept: l.concept, quantity: l.qtyN!, price: round2(l.priceN!) })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo emitir la factura.');
      setSaving(false);
      return;
    }
    // Las asesorías no llevan el logo del box
    const emision = await emitirPdf(inv, null);
    setSaving(false);
    onIssued(emision);
  }

  if (!cargado) {
    return (
      <div className="flex items-center justify-center py-10 text-zinc-400">
        {loadError ? <p className="text-sm text-brand-300">{loadError}</p> : <Loader2 className="h-5 w-5 animate-spin" />}
      </div>
    );
  }

  const marca = (mal: boolean) => (intentado && mal ? ' !border-brand-500/60' : '');

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {!cargado.emisorOk && <IssuerMissing />}

      {/* ===== Cliente ===== */}
      <div className="space-y-3">
        <div>
          <label htmlFor="ase-name" className={LABEL}>
            Nombre y apellidos o razón social
          </label>
          <input
            id="ase-name"
            maxLength={120}
            className={`input${marca(faltan.nombre)}`}
            placeholder="Cliente"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
          <div>
            <label htmlFor="ase-nif" className={LABEL}>
              NIF
            </label>
            <input
              id="ase-nif"
              maxLength={20}
              className={`input uppercase${marca(faltan.nif)}`}
              placeholder="B00000000"
              value={nif}
              onChange={(e) => setNif(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="ase-addr1" className={LABEL}>
              Dirección
            </label>
            <input
              id="ase-addr1"
              maxLength={120}
              className={`input${marca(faltan.dir1)}`}
              placeholder="Calle, número y piso"
              value={dir1}
              onChange={(e) => setDir1(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label htmlFor="ase-addr2" className={LABEL}>
            Código postal, localidad y provincia {OPCIONAL}
          </label>
          <input
            id="ase-addr2"
            maxLength={120}
            className="input"
            placeholder="00000, Localidad, Provincia"
            value={dir2}
            onChange={(e) => setDir2(e.target.value)}
          />
        </div>
      </div>

      {/* ===== Conceptos ===== */}
      <div>
        <p className={LABEL}>Productos o servicios</p>
        <div className="space-y-2">
          {lineas.map((l, i) => (
            <div key={l.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-2">
              <div className="flex items-center gap-2">
                <input
                  maxLength={120}
                  aria-label={`Concepto de la línea ${i + 1}`}
                  className={`input !py-2 text-sm${marca(!l.conceptOk)}`}
                  placeholder="Concepto (p. ej. Asesoría fiscal trimestral)"
                  value={l.concept}
                  onChange={(e) => cambiarFila(l.id, 'concept', e.target.value)}
                />
                {filas.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setFilas((fs) => fs.filter((f) => f.id !== l.id))}
                    aria-label={`Quitar la línea ${i + 1}`}
                    className="flex h-8 w-7 shrink-0 items-center justify-center text-zinc-500 transition hover:text-brand-300"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  inputMode="decimal"
                  aria-label={`Cantidad de la línea ${i + 1}`}
                  className={`input !w-16 shrink-0 !px-2.5 !py-2 text-center text-sm${marca(!l.qtyOk)}`}
                  value={l.qty}
                  onChange={(e) => cambiarFila(l.id, 'qty', e.target.value)}
                />
                <span className="shrink-0 text-xs text-zinc-500">×</span>
                <div className="relative min-w-0 flex-1">
                  <input
                    inputMode="decimal"
                    aria-label={`Precio sin IVA de la línea ${i + 1}`}
                    className={`input !py-2 pr-7 text-sm${marca(!l.priceOk)}`}
                    placeholder="Precio sin IVA"
                    value={l.price}
                    onChange={(e) => cambiarFila(l.id, 'price', e.target.value)}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">
                    €
                  </span>
                </div>
                <p className="w-[4.5rem] shrink-0 text-right text-xs font-semibold tabular-nums text-zinc-100">
                  {l.qtyOk && l.priceOk ? EUR.format(l.base) : '—'}
                </p>
              </div>
            </div>
          ))}
        </div>
        {filas.length < 10 && (
          <button
            type="button"
            onClick={() => setFilas((fs) => [...fs, filaVacia()])}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 px-3 py-2.5 text-xs font-medium text-zinc-300 transition hover:border-white/30 hover:text-white"
          >
            <Plus className="h-4 w-4" /> Añadir otra línea
          </button>
        )}
      </div>

      <CampoFecha id="ase-date" fecha={fecha} onFecha={setFecha} ultima={cargado.ultimaFecha} error={fechaError} />

      <Totales {...totales} nota={`Precios sin IVA: se suma el ${VAT_RATE} %.`} />

      {intentado && !listo && !error && (
        <p className="text-xs text-brand-300">
          Completa el nombre, el NIF y la dirección del cliente, y el concepto, la cantidad y el precio de cada línea.
        </p>
      )}
      {error && <p className="text-sm text-brand-300">{error}</p>}
      <Botones onClose={onClose} listo={Boolean(cargado.emisorOk) && !saving} saving={saving} />
    </form>
  );
}

// ===========================================================================
// Piezas comunes de las dos pestañas
// ===========================================================================

function CampoFecha({
  id,
  fecha,
  onFecha,
  ultima,
  error,
}: {
  id: string;
  fecha: string;
  onFecha: (v: string) => void;
  ultima: string | null;
  error: string | null;
}) {
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        Fecha de la factura
      </label>
      <input
        id={id}
        type="date"
        required
        className="input"
        value={fecha}
        max={todayISO()}
        min={ultima ?? undefined}
        onChange={(e) => onFecha(e.target.value)}
      />
      {error && fecha && <p className="mt-1.5 text-xs text-brand-300">{error}</p>}
    </div>
  );
}

function Totales({ base, vat, total, nota }: { base: number; vat: number; total: number; nota: string }) {
  return (
    <div className="space-y-1 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs">
      <div className="flex justify-between text-zinc-400">
        <span>Base imponible</span>
        <span className="tabular-nums">{EUR.format(base)}</span>
      </div>
      <div className="flex justify-between text-zinc-400">
        <span>IVA ({VAT_RATE} %)</span>
        <span className="tabular-nums">{EUR.format(vat)}</span>
      </div>
      <div className="flex justify-between border-t border-white/5 pt-1.5 text-sm font-bold text-white">
        <span>Total</span>
        <span className="tabular-nums">{EUR.format(total)}</span>
      </div>
      <p className="text-[11px] text-zinc-500">{nota}</p>
    </div>
  );
}

function Botones({ onClose, listo, saving }: { onClose: () => void; listo: boolean; saving: boolean }) {
  return (
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
  );
}
