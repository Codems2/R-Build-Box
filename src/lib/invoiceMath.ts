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

/** Primera letra en mayúscula (los planes pueden estar escritos en minúscula) */
export const capFirst = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
