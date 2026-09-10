import { useCallback, useEffect, useState } from 'react';
import { fetchClassTypes, fetchSlotExceptions, fetchSlots } from '../lib/api';
import type { ClassType, ScheduleSlot, SlotException } from '../lib/types';
import { sortSlots } from '../lib/types';

export function useSchedule(includeInactive = false) {
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [classTypes, setClassTypes] = useState<ClassType[]>([]);
  // Sesiones sueltas eliminadas de clases recurrentes
  const [exceptions, setExceptions] = useState<SlotException[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setError(null);
      const [s, t, x] = await Promise.all([
        fetchSlots(includeInactive),
        fetchClassTypes(),
        fetchSlotExceptions().catch(() => [] as SlotException[]),
      ]);
      setSlots(sortSlots(s));
      setClassTypes(t);
      setExceptions(x);
    } catch (e) {
      console.error(e);
      setError('No se pudieron cargar los horarios. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  }, [includeInactive]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { slots, classTypes, exceptions, loading, error, reload };
}
