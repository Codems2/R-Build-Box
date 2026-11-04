/**
 * Borradores de factura: se generan en el navegador con los mismos cálculos
 * que la base de datos, pero sin número ni guardarse en ningún sitio. Sirven
 * para revisar o enseñar la factura antes de emitirla.
 */
import type { BillingSettings, InvoiceKind, InvoiceLine, InvoiceParty, IssuedInvoice } from './types';
import { invoiceTotals, lineAmounts, VAT_RATE } from './invoiceMath';
import { DRAFT_CODE } from './invoicePdf';

/** Línea con precio final (IVA incluido), igual que las del box y los bonos */
export function draftLine(concept: string, detail: string | null, priceWithVat: number, quantity: number): InvoiceLine {
  const { total, base } = lineAmounts(priceWithVat, quantity);
  return {
    concept,
    detail,
    quantity,
    unit_price: Math.round((priceWithVat / (1 + VAT_RATE / 100)) * 10000) / 10000,
    unit_price_with_vat: priceWithVat,
    vat_rate: VAT_RATE,
    base,
    total,
  };
}

export function draftInvoice(
  kind: InvoiceKind,
  issueDate: string,
  issuer: BillingSettings,
  client: InvoiceParty,
  lines: InvoiceLine[],
): IssuedInvoice {
  return {
    id: 'borrador',
    series: '',
    number: 0,
    code: DRAFT_CODE,
    kind,
    issue_date: issueDate,
    member_id: null,
    issuer: {
      name: issuer.issuer_name ?? '',
      nif: issuer.issuer_nif,
      address1: issuer.issuer_address1,
      address2: issuer.issuer_address2,
    },
    client,
    lines,
    vat_rate: VAT_RATE,
    ...invoiceTotals(lines),
    pdf_path: null,
  };
}
