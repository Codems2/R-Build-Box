import { useEffect, useState } from 'react';
import { FilePlus, Loader2, Receipt } from 'lucide-react';
import Modal from '../Modal';
import { ClientPreview, emitirPdf, InvoiceIssuedView, IssuerMissing, type EmisionPdf } from './InvoiceShared';
import { fetchBillingSettings, issueInvoiceFromPayments } from '../../lib/api';
import { invoiceTotals, lineAmounts, VAT_RATE } from '../../lib/invoiceMath';
import { formatDateES, todayISO } from '../../lib/dates';
import { useAuth } from '../../lib/auth';
import { memberFullName, type Member, type MonthPaymentStatus } from '../../lib/types';

const EUR = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const mesActual = () =>
  new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

/**
 * Factura de las cuotas del mes en curso de un socio (desde la lista de
 * socios). Antes de emitir se enseña qué entra: una factura emitida no se
 * puede borrar, así que un toque sin querer no debe crearla.
 */
export default function PaymentsInvoiceModal({
  member,
  status,
  onClose,
  onIssued,
}: {
  member: Member | null;
  status: MonthPaymentStatus | null;
  onClose: () => void;
  onIssued: () => void;
}) {
  const { logoUrl } = useAuth();
  const [emisorOk, setEmisorOk] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<EmisionPdf | null>(null);

  useEffect(() => {
    if (!member) return;
    setSaving(false);
    setError(null);
    setResultado(null);
    setEmisorOk(null);
    let active = true;
    fetchBillingSettings()
      .then((b) => active && setEmisorOk(Boolean(b.issuer_name?.trim() && b.issuer_nif?.trim())))
      .catch(() => active && setEmisorOk(true)); // si no se puede comprobar, lo dirá el servidor
    return () => {
      active = false;
    };
    // Solo al abrir para otro socio: al recargar la lista tras emitir no se
    // debe borrar la pantalla de «factura emitida»
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member?.id]);

  if (!member) return null;

  const pendientes = status?.pending ?? [];
  const totales = invoiceTotals(pendientes.map((p) => lineAmounts(p.amount, 1)));

  async function handleEmitir() {
    if (!member || saving) return;
    setSaving(true);
    setError(null);
    try {
      const inv = await issueInvoiceFromPayments(member.id);
      setResultado(await emitirPdf(inv, logoUrl));
      onIssued();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo emitir la factura.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={member !== null}
      onClose={onClose}
      title={resultado ? 'Factura emitida' : `Factura · ${memberFullName(member)}`}
    >
      {resultado ? (
        <InvoiceIssuedView emision={resultado} onClose={onClose} />
      ) : emisorOk === null ? (
        <div className="flex items-center justify-center py-10 text-zinc-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          {!emisorOk && <IssuerMissing />}

          <ClientPreview member={member} />

          {/* Cuotas que entran */}
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Cuotas de {mesActual()}
            </p>
            {pendientes.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/10 px-3 py-2.5 text-xs text-zinc-500">
                No tiene cuotas de este mes pendientes de facturar.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {pendientes.map((p) => (
                  <li
                    key={p.id}
                    className="flex min-w-0 items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
                  >
                    <Receipt className="h-4 w-4 shrink-0 text-accent-300" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-zinc-100">{p.concept}</p>
                      <p className="text-[11px] text-zinc-500">
                        Pago del {formatDateES(p.entry_date).replace(/^[^,]+,\s*/, '')}
                      </p>
                    </div>
                    <p className="shrink-0 text-xs font-semibold tabular-nums text-zinc-100">
                      {EUR.format(p.amount)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Fecha y totales */}
          {pendientes.length > 0 && (
            <div className="space-y-1 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs">
              <div className="flex justify-between text-zinc-400">
                <span>Fecha de la factura</span>
                <span className="tabular-nums">{todayISO().split('-').reverse().join('/')} (hoy)</span>
              </div>
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
            </div>
          )}

          {error && <p className="text-sm text-brand-300">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleEmitir()}
              disabled={saving || !emisorOk || pendientes.length === 0}
              className="btn-primary flex-1 whitespace-nowrap"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Generando…
                </>
              ) : (
                <>
                  <FilePlus className="h-4 w-4 shrink-0" /> Generar factura
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
