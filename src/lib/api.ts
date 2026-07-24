import { supabase, isSupabaseConfigured } from './supabase';
import { DEMO_CLASS_TYPES, DEMO_SLOTS } from './demoData';
import type {
  ClassType,
  ClassTypeInput,
  ScheduleSlot,
  SlotInput,
} from './types';

const LS_SLOTS = 'rmbox_slots_v1';
const LS_TYPES = 'rmbox_class_types_v1';

function readLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLS(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

const newId = () =>
  `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// ---------------------------------------------------------------------------
// Tipos de clase
// ---------------------------------------------------------------------------

export async function fetchClassTypes(): Promise<ClassType[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('class_types')
      .select('*')
      .order('name');
    if (error) throw error;
    return data as ClassType[];
  }
  return readLS(LS_TYPES, DEMO_CLASS_TYPES);
}

export async function createClassType(input: ClassTypeInput): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('class_types').insert(input);
    if (error) throw error;
    return;
  }
  const types = readLS(LS_TYPES, DEMO_CLASS_TYPES);
  writeLS(LS_TYPES, [...types, { ...input, id: newId() }]);
}

export async function updateClassType(
  id: string,
  input: ClassTypeInput,
): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase
      .from('class_types')
      .update(input)
      .eq('id', id);
    if (error) throw error;
    return;
  }
  const types = readLS(LS_TYPES, DEMO_CLASS_TYPES);
  writeLS(
    LS_TYPES,
    types.map((t) => (t.id === id ? { ...t, ...input } : t)),
  );
}

export async function deleteClassType(id: string): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('class_types').delete().eq('id', id);
    if (error) throw error;
    return;
  }
  writeLS(
    LS_TYPES,
    readLS(LS_TYPES, DEMO_CLASS_TYPES).filter((t) => t.id !== id),
  );
  // Los huecos que apuntaban a este tipo pasan a ser huecos sueltos
  writeLS(
    LS_SLOTS,
    readLS(LS_SLOTS, DEMO_SLOTS).map((s) =>
      s.class_type_id === id ? { ...s, class_type_id: null } : s,
    ),
  );
}

// ---------------------------------------------------------------------------
// Huecos del horario
// ---------------------------------------------------------------------------

export async function fetchSlots(includeInactive = false): Promise<
  ScheduleSlot[]
> {
  if (isSupabaseConfigured && supabase) {
    let query = supabase
      .from('schedule_slots')
      .select('*')
      .order('day_of_week')
      .order('start_time');
    if (!includeInactive) query = query.eq('is_active', true);
    const { data, error } = await query;
    if (error) throw error;
    return (data as ScheduleSlot[]).map((s) => ({
      ...s,
      start_time: s.start_time.slice(0, 5),
    }));
  }
  const slots = readLS(LS_SLOTS, DEMO_SLOTS);
  return includeInactive ? slots : slots.filter((s) => s.is_active);
}

export async function createSlot(input: SlotInput): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('schedule_slots').insert(input);
    if (error) throw error;
    return;
  }
  const slots = readLS(LS_SLOTS, DEMO_SLOTS);
  writeLS(LS_SLOTS, [...slots, { ...input, id: newId() }]);
}

export async function updateSlot(id: string, input: SlotInput): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase
      .from('schedule_slots')
      .update(input)
      .eq('id', id);
    if (error) throw error;
    return;
  }
  const slots = readLS(LS_SLOTS, DEMO_SLOTS);
  writeLS(
    LS_SLOTS,
    slots.map((s) => (s.id === id ? { ...s, ...input } : s)),
  );
}

export async function deleteSlot(id: string): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase
      .from('schedule_slots')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return;
  }
  writeLS(
    LS_SLOTS,
    readLS(LS_SLOTS, DEMO_SLOTS).filter((s) => s.id !== id),
  );
}
