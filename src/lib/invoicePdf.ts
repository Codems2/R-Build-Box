/**
 * PDF de las facturas emitidas, con la maquetación de la plantilla Word del box
 * (factura completa) y los colores de la web. Se genera en el navegador con
 * pdf-lib, que se carga solo cuando hace falta.
 *
 * Sin VERI*FACTU: ni QR ni la frase «VERI*FACTU» (el box aún no está obligado).
 * Contenido según el art. 6 del Reglamento de facturación (RD 1619/2012).
 *
 * Coordenadas en puntos, con «y» medida desde arriba y en la línea base.
 */
import type { PDFFont, RGB } from 'pdf-lib';
import type { InvoiceLine, IssuedInvoice } from './types';
import { round2 } from './invoiceMath';

const PAG = { w: 595.5, h: 842 }; // A4 de la plantilla (11910 × 16840 twips)

const HEX = {
  marca: '#C21E45', // brand-600 de la web: barras y total
  tinta: '#131113', // ink-900: título, importes y cabecera de la tabla
  texto: '#71717A', // zinc-500: etiquetas y datos secundarios
  filete: '#E4E4E7', // zinc-200
  fondo: '#F4F4F5', // zinc-100: caja del destinatario
};

const BORDE = { izq: 45.4, der: 550.0 };
const LOGO = { x: 45.5, lado: 80 };
const EMISOR_X = 147.4;

// Tabla de detalle (columnas de la plantilla)
const T = {
  cabAlto: 18,
  concepto: { x: 53.5, maxW: 200 },
  cant: { centro: 317.9 },
  precio: { der: 400.6 },
  iva: { x: 430.6 },
  importe: { der: 541.9 },
};
const TOT = { x: 301.8, txt: 311.9, der: 540.0 };

/** Letras latinas que no se descomponen en letra + tilde */
const SIN_TILDE: Record<string, string> = {
  Ł: 'L', ł: 'l', Đ: 'D', đ: 'd', Ħ: 'H', ħ: 'h', ı: 'i', Ŀ: 'L', ŀ: 'l', Ŧ: 'T', ŧ: 't',
};

const fmt2 = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt4 = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
/** Cantidad: entera en el box; en asesorías puede llevar decimales (1,5 h) */
const fmtCant = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });
const eur = (n: number) => `${fmt2.format(n)} €`;
const fechaES = (iso: string) => iso.split('-').reverse().join('/');

/**
 * Precio unitario sin IVA: con 2 decimales si cuadra con el importe de la
 * línea; si no (p. ej. 3 × 5,7851 €), con hasta 4 para que la cuenta salga.
 */
function precioUnitario(l: InvoiceLine): string {
  const u2 = round2(l.unit_price);
  if (round2(u2 * l.quantity) === round2(l.base)) return eur(u2);
  return `${fmt4.format(l.unit_price)} €`;
}

function hexToRgb(rgb: (r: number, g: number, b: number) => RGB, h: string): RGB {
  return rgb(
    parseInt(h.slice(1, 3), 16) / 255,
    parseInt(h.slice(3, 5), 16) / 255,
    parseInt(h.slice(5, 7), 16) / 255,
  );
}

/** Nombre de archivo: F2026-00001_Nombre_Apellido.pdf */
export function invoiceFileName(inv: IssuedInvoice): string {
  const slug =
    Array.from(inv.client.name, (c) => SIN_TILDE[c] ?? c)
      .join('')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 40) || 'cliente';
  return `${inv.code}_${slug}.pdf`;
}

export async function buildInvoicePdf(inv: IssuedInvoice, logoPng: Uint8Array | null): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const C = {
    marca: hexToRgb(rgb, HEX.marca),
    tinta: hexToRgb(rgb, HEX.tinta),
    texto: hexToRgb(rgb, HEX.texto),
    filete: hexToRgb(rgb, HEX.filete),
    fondo: hexToRgb(rgb, HEX.fondo),
    blanco: rgb(1, 1, 1),
  };

  const pdf = await PDFDocument.create();
  pdf.setTitle(`Factura ${inv.code}`);
  pdf.setAuthor(inv.issuer.name);
  pdf.setLanguage('es-ES');
  const page = pdf.addPage([PAG.w, PAG.h]);
  const reg = await pdf.embedFont(StandardFonts.Helvetica); // métricas de Arial
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Las fuentes estándar solo cubren el alfabeto latino (WinAnsi): cualquier
  // otro carácter se cambia por su letra base o por «?» en lugar de fallar.
  const soportados = new Set(reg.getCharacterSet());
  const limpio = (t: string) =>
    Array.from(t.normalize('NFC').replace(/\s+/g, ' '))
      .map((ch) => {
        if (soportados.has(ch.codePointAt(0)!)) return ch;
        if (SIN_TILDE[ch]) return SIN_TILDE[ch];
        const base = ch.normalize('NFD')[0];
        return base && soportados.has(base.codePointAt(0)!) ? base : '?';
      })
      .join('');

  const Y = (top: number) => PAG.h - top;
  const texto = (t: string, x: number, base: number, size: number, font: PDFFont, color: RGB) =>
    page.drawText(limpio(t), { x, y: Y(base), size, font, color });
  const ancho = (t: string, size: number, font: PDFFont) => font.widthOfTextAtSize(limpio(t), size);
  const derecha = (t: string, der: number, base: number, size: number, font: PDFFont, color: RGB) =>
    texto(t, der - ancho(t, size, font), base, size, font, color);
  const centro = (t: string, cx: number, base: number, size: number, font: PDFFont, color: RGB) =>
    texto(t, cx - ancho(t, size, font) / 2, base, size, font, color);
  const filete = (y: number, grosor = 0.6, x0: number = BORDE.izq, x1 = 551.0) =>
    page.drawLine({ start: { x: x0, y: Y(y) }, end: { x: x1, y: Y(y) }, thickness: grosor, color: C.filete });
  const rect = (x0: number, y0: number, x1: number, y1: number, color: RGB) =>
    page.drawRectangle({ x: x0, y: Y(y1), width: x1 - x0, height: y1 - y0, color });
  const barra = (x: number, y0: number, y1: number) =>
    page.drawLine({ start: { x, y: Y(y0) }, end: { x, y: Y(y1) }, thickness: 3.1, color: C.marca });
  const partir = (t: string, font: PDFFont, size: number, maxW: number) => {
    const lineas: string[] = [];
    let linea = '';
    for (const p of limpio(t).split(' ')) {
      const prueba = linea ? `${linea} ${p}` : p;
      if (font.widthOfTextAtSize(prueba, size) > maxW && linea) {
        lineas.push(linea);
        linea = p;
      } else linea = prueba;
    }
    if (linea) lineas.push(linea);
    return lineas;
  };

  // ===== Emisor (con el logo a la izquierda) =================================
  const emisor = [
    inv.issuer.nif ? `NIF ${inv.issuer.nif}` : null,
    inv.issuer.address1,
    inv.issuer.address2,
  ].filter((l): l is string => Boolean(l));
  let logoDibujado = false;
  // Las asesorías no llevan el logo del box
  if (logoPng && inv.kind !== 'asesoria') {
    try {
      const img = await pdf.embedPng(logoPng);
      const s = Math.min(LOGO.lado / img.width, LOGO.lado / img.height);
      const w = img.width * s;
      const h = img.height * s;
      // Centrado en vertical con el bloque de texto del emisor
      const arriba = 75.8 - 8;
      const abajo = 89.8 + Math.max(0, emisor.length - 1) * 11.5 + 2;
      const top = Math.max(36, (arriba + abajo) / 2 - h / 2);
      page.drawImage(img, { x: LOGO.x, y: Y(top + h), width: w, height: h });
      logoDibujado = true;
    } catch {
      /* logo ilegible: la factura sale igual, sin él */
    }
  }
  const xEmisor = logoDibujado ? EMISOR_X : LOGO.x;
  texto(inv.issuer.name, xEmisor, 75.8, 11, bold, C.tinta);
  emisor.forEach((l, i) => texto(l, xEmisor, 89.8 + i * 11.5, 8.5, reg, C.texto));
  filete(154.2, 0.8, 45.7);

  // ===== Título, número y fecha ==============================================
  barra(46.8, 176.4, 192.4);
  texto('FACTURA', 55.5, 188.4, 11, bold, C.tinta);
  for (const [x, etq, valor] of [
    [387.0, 'Nº DE FACTURA', inv.code],
    [474.7, 'FECHA DE EXPEDICIÓN', fechaES(inv.issue_date)],
  ] as const) {
    texto(etq, x, 179.6, 6.5, bold, C.texto);
    texto(valor, x, 191.6, 10, bold, C.tinta);
  }

  // ===== Destinatario: solo los datos que tenga el cliente ===================
  const cliente = [
    inv.client.nif ? `NIF ${inv.client.nif}` : null,
    inv.client.address1,
    inv.client.address2,
    inv.client.phone ? `Tel. ${inv.client.phone}` : null,
    inv.client.email,
  ].filter((l): l is string => Boolean(l));
  const cajaTop = 227.6;
  const nombreBase = 252.9;
  const ultimaBase = cliente.length ? 265.4 + (cliente.length - 1) * 11.5 : nombreBase;
  const cajaAbajo = ultimaBase + 6.8;
  rect(45.5, cajaTop, 550.2, cajaAbajo, C.fondo);
  barra(47.0, cajaTop, cajaAbajo);
  texto('DESTINATARIO', 57.7, 240.0, 7, bold, C.texto);
  texto(inv.client.name, 57.7, nombreBase, 10, bold, C.tinta);
  cliente.forEach((l, i) => texto(l, 57.7, 265.4 + i * 11.5, 8.5, reg, C.texto));

  // ===== Detalle =============================================================
  const cabTop = cajaAbajo + 47.3;
  rect(BORDE.izq, cabTop, 549.8, cabTop + T.cabAlto, C.tinta);
  const cabBase = cabTop + 12;
  texto('CONCEPTO', 53.5, cabBase, 7, bold, C.blanco);
  texto('CANT.', 300.0, cabBase, 7, bold, C.blanco);
  texto('PRECIO UNIT.', 354.1, cabBase, 7, bold, C.blanco);
  texto('IVA', 440.1, cabBase, 7, bold, C.blanco);
  texto('IMPORTE', 510.2, cabBase, 7, bold, C.blanco);

  let base = cabTop + T.cabAlto + 14; // primera línea del primer concepto
  let ultimoFilete = cabTop + T.cabAlto;
  for (const l of inv.lines) {
    const conc = partir(l.concept, bold, 9, T.concepto.maxW);
    conc.forEach((c, k) => texto(c, T.concepto.x, base + k * 11.5, 9, bold, C.tinta));
    centro(fmtCant.format(l.quantity), T.cant.centro, base, 9, reg, C.tinta);
    derecha(precioUnitario(l), T.precio.der, base, 9, reg, C.tinta);
    texto(`${fmt2.format(l.vat_rate).replace(',00', '')} %`, T.iva.x, base, 9, reg, C.tinta);
    derecha(eur(l.base), T.importe.der, base, 9, reg, C.tinta);
    let fin = base + (conc.length - 1) * 11.5;
    if (l.detail) {
      const det = partir(l.detail, reg, 7.5, T.concepto.maxW);
      det.forEach((d, k) => texto(d, T.concepto.x, fin + 11.5 + k * 10, 7.5, reg, C.texto));
      fin += 11.5 + (det.length - 1) * 10;
    }
    ultimoFilete = fin + 6.8;
    filete(ultimoFilete, 0.6, BORDE.izq, 549.9);
    base = ultimoFilete + 14.3;
  }

  // ===== Totales =============================================================
  let yt = ultimoFilete + 31.1;
  const iva = `${fmt2.format(inv.vat_rate).replace(',00', '')} %`;
  for (const [etq, valor] of [
    ['Base imponible', eur(inv.base)],
    [`IVA (${iva}) sobre ${eur(inv.base)}`, eur(inv.vat)],
  ]) {
    texto(etq, TOT.txt, yt, 9, reg, C.texto);
    derecha(valor, TOT.der, yt, 9, reg, C.tinta);
    yt += 16;
  }
  const totTop = yt - 16 + 5;
  rect(TOT.x, totTop, BORDE.der, totTop + 25, C.marca);
  texto('TOTAL', TOT.txt, totTop + 17, 10, bold, C.blanco);
  derecha(eur(inv.total), TOT.der + 0.4, totTop + 17.5, 11, bold, C.blanco);

  // ===== Pie (solo el filete, como en la plantilla) ==========================
  filete(787.5, 0.6, 45.8);

  return pdf.save();
}

/**
 * Logo del box en PNG (máx. 600 px) para incrustarlo en la factura: el de
 * Ajustes si lo hay, si no el de la app. null si no se puede cargar.
 */
export async function loadInvoiceLogo(url: string | null): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url ?? '/logo.png', { mode: 'cors' });
    if (!res.ok) throw new Error('logo');
    const bmp = await createImageBitmap(await res.blob());
    const s = Math.min(1, 600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * s));
    c.height = Math.max(1, Math.round(bmp.height * s));
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('logo');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob>((ok, ko) =>
      c.toBlob((b) => (b ? ok(b) : ko(new Error('logo'))), 'image/png'),
    );
    return new Uint8Array(await blob.arrayBuffer());
  } catch {
    return url ? loadInvoiceLogo(null) : null;
  }
}

/** Descarga un PDF en el dispositivo */
export function downloadPdf(bytes: Uint8Array, fileName: string): void {
  const url = URL.createObjectURL(new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Margen para que el navegador (sobre todo en iOS) termine de leer el archivo
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
