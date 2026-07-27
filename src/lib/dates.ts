/** Fecha (YYYY-MM-DD) de la próxima sesión de un hueco semanal.
 *  Si la clase es hoy pero aún no ha empezado, cuenta hoy. */
export function nextOccurrenceISO(dayOfWeek: number, startTime: string): string {
  const now = new Date();
  const todayDow = (now.getDay() + 6) % 7; // 0 = Lunes
  let diff = (dayOfWeek - todayDow + 7) % 7;
  if (diff === 0) {
    const [h, m] = startTime.split(':').map(Number);
    const start = new Date(now);
    start.setHours(h, m, 0, 0);
    if (start <= now) diff = 7;
  }
  const d = new Date(now);
  d.setDate(now.getDate() + diff);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Días de diferencia entre una fecha ISO y hoy (0 = hoy, 1 = mañana…) */
export function daysFromTodayISO(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(`${iso}T00:00:00`);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

/** Desplaza una fecha ISO un número de días */
export function shiftISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Ventana de reserva para socios: hoy y hasta 2 días en el futuro */
export const BOOKING_WINDOW_DAYS = 2;

/** Fecha ISO de hoy (hora local del navegador) */
export function todayISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Lunes (ISO) de la semana que contiene la fecha dada */
export function mondayOfWeekISO(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const dow = (d.getDay() + 6) % 7; // 0 = Lunes
  d.setDate(d.getDate() - dow);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Las 7 fechas ISO (Lun→Dom) de la semana que empieza en `mondayISO` */
export function weekDatesISO(mondayISO: string): string[] {
  return Array.from({ length: 7 }, (_, i) => shiftISO(mondayISO, i));
}

/** Día de la semana (0 = Lunes … 6 = Domingo) de una fecha ISO */
export function dowOfISO(iso: string): number {
  return (new Date(`${iso}T00:00:00`).getDay() + 6) % 7;
}

/** «27 jul – 2 ago» */
export function formatWeekRange(mondayISO: string): string {
  const a = new Date(`${mondayISO}T00:00:00`);
  const b = new Date(`${shiftISO(mondayISO, 6)}T00:00:00`);
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(d);
  return `${fmt(a)} – ${fmt(b)}`;
}

/** «lun 27» para las cabeceras de día */
export function formatDayShort(iso: string): { name: string; num: string } {
  const d = new Date(`${iso}T00:00:00`);
  return {
    name: new Intl.DateTimeFormat('es-ES', { weekday: 'short' }).format(d).replace('.', ''),
    num: String(d.getDate()),
  };
}

/** «lunes, 27 de julio» */
export function formatDateES(iso: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${iso}T00:00:00`));
}
