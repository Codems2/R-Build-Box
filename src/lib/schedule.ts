import type { ScheduleSlot, Session } from './types';
import { shiftISO } from './dates';

/**
 * Resuelve las sesiones concretas (hueco + fecha) que caen en la semana que
 * empieza en `mondayISO`:
 *  - Recurrentes: aparecen su día de la semana, desde su fecha de inicio.
 *  - Puntuales: aparecen solo en su fecha, si cae dentro de la semana.
 */
export function sessionsForWeek(slots: ScheduleSlot[], mondayISO: string): Session[] {
  const sunday = shiftISO(mondayISO, 6);
  const out: Session[] = [];
  for (const slot of slots) {
    if (slot.is_recurring) {
      const date = shiftISO(mondayISO, slot.day_of_week);
      if (!slot.class_date || date >= slot.class_date) out.push({ slot, date });
    } else if (slot.class_date && slot.class_date >= mondayISO && slot.class_date <= sunday) {
      out.push({ slot, date: slot.class_date });
    }
  }
  return out;
}
