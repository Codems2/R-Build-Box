import { countKey, type ScheduleSlot, type Session, type SlotException } from './types';
import { shiftISO } from './dates';

/** Conjunto de claves `slotId|fecha` de sesiones eliminadas una a una */
export function exceptionSet(exceptions: SlotException[]): Set<string> {
  return new Set(exceptions.map((e) => countKey(e.slot_id, e.class_date)));
}

/**
 * Resuelve las sesiones concretas (hueco + fecha) que caen en la semana que
 * empieza en `mondayISO`:
 *  - Recurrentes: aparecen su día de la semana, desde su fecha de inicio.
 *  - Puntuales: aparecen solo en su fecha, si cae dentro de la semana.
 *
 * Las sesiones que el admin ha eliminado sueltas (`exceptions`) no aparecen.
 */
export function sessionsForWeek(
  slots: ScheduleSlot[],
  mondayISO: string,
  exceptions: SlotException[] = [],
): Session[] {
  const sunday = shiftISO(mondayISO, 6);
  const skip = exceptionSet(exceptions);
  const out: Session[] = [];
  for (const slot of slots) {
    if (slot.is_recurring) {
      const date = shiftISO(mondayISO, slot.day_of_week);
      if (!slot.class_date || date >= slot.class_date) out.push({ slot, date });
    } else if (slot.class_date && slot.class_date >= mondayISO && slot.class_date <= sunday) {
      out.push({ slot, date: slot.class_date });
    }
  }
  return out.filter((s) => !skip.has(countKey(s.slot.id, s.date)));
}
