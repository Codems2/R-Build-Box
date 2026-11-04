import { AlertTriangle, CheckCircle2, Download, Mail, Phone, User } from 'lucide-react';
import { saveIssuedInvoicePdf } from '../../lib/api';
import { buildInvoicePdf, downloadPdf, invoiceFileName, loadInvoiceLogo } from '../../lib/invoicePdf';
import { formatDateES } from '../../lib/dates';
import { memberFullName, type IssuedInvoice, type Member } from '../../lib/types';

const EUR = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

export interface EmisionPdf {
  inv: IssuedInvoice;
  /** null si no se pudo generar el PDF (se puede regenerar desde «Facturas») */
  bytes: Uint8Array | null;
  aviso: string | null;
}

/**
 * Tras emitir: genera el PDF, lo descarga en el dispositivo y lo sube a
 * «Facturas». Si algo falla, la factura sigue emitida y se avisa.
 */
export async function emitirPdf(inv: IssuedInvoice, logoUrl: string | null): Promise<EmisionPdf> {
  let bytes: Uint8Array;
  try {
    bytes = await buildInvoicePdf(inv, await loadInvoiceLogo(logoUrl));
  } catch (err) {
    console.error(err);
    return {
      inv,
      bytes: null,
      aviso: 'La factura está emitida, pero no se pudo generar el PDF. Descárgala desde «Facturas».',
    };
  }
  downloadPdf(bytes, invoiceFileName(inv));
  try {
    await saveIssuedInvoicePdf(inv, bytes);
    return { inv, bytes, aviso: null };
  } catch {
    return {
      inv,
      bytes,
      aviso:
        'La factura está emitida y descargada, pero no se pudo subir el PDF a la nube. Podrás descargarla igualmente desde «Facturas».',
    };
  }
}

/** Pantalla de «factura emitida» con opción de volver a descargarla */
export function InvoiceIssuedView({ emision, onClose }: { emision: EmisionPdf; onClose: () => void }) {
  const { inv, bytes, aviso } = emision;
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-2 py-1 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-500/15 text-accent-300 ring-1 ring-accent-500/25">
          <CheckCircle2 className="h-6 w-6" />
        </span>
        <p className="font-display text-base font-bold text-white">Factura {inv.code}</p>
        <p className="text-xs text-zinc-400">
          {inv.client.name} · {EUR.format(inv.total)} · {formatDateES(inv.issue_date)}
        </p>
        {bytes && !aviso && (
          <p className="text-xs text-zinc-500">
            Se ha descargado en este dispositivo y queda guardada en «Facturas».
          </p>
        )}
      </div>
      {aviso && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {aviso}
        </p>
      )}
      <div className="flex gap-2 pt-1">
        {bytes && (
          <button
            type="button"
            onClick={() => downloadPdf(bytes, invoiceFileName(inv))}
            className="btn-ghost flex-1 whitespace-nowrap"
          >
            <Download className="h-4 w-4 shrink-0" /> Descargar
          </button>
        )}
        <button type="button" onClick={onClose} className="btn-primary flex-1">
          Cerrar
        </button>
      </div>
    </div>
  );
}

/** Datos del socio que saldrán en la factura: solo los que tenga rellenos */
export function ClientPreview({ member }: { member: Member }) {
  return (
    <div className="space-y-1 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Saldrá en la factura</p>
      <p className="flex min-w-0 items-center gap-2 text-xs text-zinc-200">
        <User className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
        <span className="truncate">{memberFullName(member)}</span>
      </p>
      {member.phone?.trim() && (
        <p className="flex min-w-0 items-center gap-2 text-xs text-zinc-200">
          <Phone className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
          <span className="truncate">{member.phone.trim()}</span>
        </p>
      )}
      {member.email?.trim() && (
        <p className="flex min-w-0 items-center gap-2 text-xs text-zinc-200">
          <Mail className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
          <span className="truncate">{member.email.trim()}</span>
        </p>
      )}
    </div>
  );
}

/** Aviso de que faltan los datos fiscales del box */
export function IssuerMissing() {
  return (
    <p className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-200">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      Faltan los datos fiscales del box (nombre y NIF). Añádelos en Configuración → Datos de
      facturación.
    </p>
  );
}
