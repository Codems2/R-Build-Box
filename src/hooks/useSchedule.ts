import { useCallback, useEffect, useState } from 'react';
import { fetchClassTypes, fetchSlots } from '../lib/api';
import type { ClassType, ScheduleSlot } from '../lib/types';
import { sortSlots } from '../lib/types';

export function useSchedule(includeInactive = false) {
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [classTypes, setClassTypes] = useState<ClassType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setError(null);
      const [s, t] = await Promise.all([
        fetchSlots(includeInactive),
        fetchClassTypes(),
      ]);
      setSlots(sortSlots(s));
      setClassTypes(t);
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

  return { slots, classTypes, loading, error, reload };
}
