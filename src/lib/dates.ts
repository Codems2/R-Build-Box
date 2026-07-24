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

/** «lunes, 27 de julio» */
export function formatDateES(iso: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${iso}T00:00:00`));
}
