/**
 * Cálculo de importes de las facturas emitidas. Es la misma regla que aplica
 * issue_invoice en la base de datos (migración 0029), que es la que manda;
 * aquí se usa para la vista previa del formulario y para el modo demo.
 *
 * Los precios de los planes son precios finales, con IVA incluido: de cada
 * línea se saca la base imponible redondeada al céntimo y el IVA es la
 * diferencia, así el total coincide siempre con lo que paga el socio.
 */

/** IVA de las cuotas y clases del box */
export const VAT_RATE = 21;

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function lineAmounts(priceWithVat: number, quantity: number): { total: number; base: number } {
  const total = round2(priceWithVat * quantity);
  return { total, base: round2(total / (1 + VAT_RATE / 100)) };
}

export function invoiceTotals(lines: { total: number; base: number }[]): {
  base: number;
  vat: number;
  total: number;
} {
  const total = round2(lines.reduce((s, l) => s + l.total, 0));
  const base = round2(lines.reduce((s, l) => s + l.base, 0));
  return { base, vat: round2(total - base), total };
}

/**
 * Asesorías: el precio se escribe SIN IVA. La base de cada línea es
 * cantidad × precio y el IVA se calcula sobre la base total (como
 * issue_manual_invoice en la base de datos).
 */
export function manualLineAmounts(quantity: number, price: number): { base: number; total: number } {
  const base = round2(quantity * price);
  return { base, total: round2(base * (1 + VAT_RATE / 100)) };
}

export function manualTotals(lines: { base: number }[]): { base: number; vat: number; total: number } {
  const base = round2(lines.reduce((s, l) => s + l.base, 0));
  const vat = round2((base * VAT_RATE) / 100);
  return { base, vat, total: round2(base + vat) };
}

/** Número escrito a mano («1,5», «40.00»…) o null si no es válido */
export function parseAmount(v: string): number | null {
  const t = v.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Primera letra en mayúscula (los planes pueden estar escritos en minúscula) */
export const capFirst = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
