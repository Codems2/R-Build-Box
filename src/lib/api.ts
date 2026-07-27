import { supabase, isSupabaseConfigured } from './supabase';
import { DEMO_CLASS_TYPES, DEMO_SLOTS } from './demoData';
import type {
  Booking,
  BookingCounts,
  ClassType,
  ClassTypeInput,
  Member,
  MemberInput,
  ScheduleSlot,
  SlotInput,
} from './types';
import { countKey } from './types';

const LS_SLOTS = 'rmbox_slots_v1';
const LS_TYPES = 'rmbox_class_types_v1';
const LS_BOOKINGS = 'rmbox_bookings_v1';
const LS_MEMBERS = 'rmbox_members_v1';

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
  writeLS(
    LS_BOOKINGS,
    readLS<Booking[]>(LS_BOOKINGS, []).filter((b) => b.slot_id !== id),
  );
}

// ---------------------------------------------------------------------------
// Reservas de plazas
// ---------------------------------------------------------------------------

export class BookingError extends Error {}

const BOOKING_ERROR_MESSAGES: Record<string, string> = {
  CLASS_FULL: 'La clase está completa: no quedan plazas.',
  ALREADY_BOOKED: 'Ya hay una reserva a ese nombre para esta sesión.',
  DATE_IN_PAST: 'Esa sesión ya ha pasado.',
  DATE_MISMATCH: 'La fecha no corresponde a esta clase.',
  SLOT_NOT_FOUND: 'Esta clase ya no está disponible.',
};

function toBookingError(raw: string): BookingError {
  const code = Object.keys(BOOKING_ERROR_MESSAGES).find((c) => raw.includes(c));
  return new BookingError(
    code ? BOOKING_ERROR_MESSAGES[code] : 'No se pudo completar la reserva. Inténtalo de nuevo.',
  );
}

/** Plazas ocupadas por sesión futura, clave `${slot_id}|${class_date}` */
export async function fetchBookingCounts(): Promise<BookingCounts> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('get_booking_counts');
    if (error) throw error;
    const counts: BookingCounts = {};
    for (const row of data as { slot_id: string; class_date: string; cnt: number }[]) {
      counts[countKey(row.slot_id, row.class_date)] = Number(row.cnt);
    }
    return counts;
  }
  const counts: BookingCounts = {};
  for (const b of readLS<Booking[]>(LS_BOOKINGS, [])) {
    const key = countKey(b.slot_id, b.class_date);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export async function createBooking(
  slot: ScheduleSlot,
  classDate: string,
  name: string,
  contact: string,
): Promise<{ id: string; cancel_token: string }> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('create_booking', {
      p_slot_id: slot.id,
      p_class_date: classDate,
      p_name: name,
      p_contact: contact || null,
    });
    if (error) throw toBookingError(error.message);
    return data as { id: string; cancel_token: string };
  }
  const bookings = readLS<Booking[]>(LS_BOOKINGS, []);
  const sameSession = bookings.filter(
    (b) => b.slot_id === slot.id && b.class_date === classDate,
  );
  if (slot.capacity != null && sameSession.length >= slot.capacity) {
    throw new BookingError(BOOKING_ERROR_MESSAGES.CLASS_FULL);
  }
  if (sameSession.some((b) => b.name.trim().toLowerCase() === name.trim().toLowerCase())) {
    throw new BookingError(BOOKING_ERROR_MESSAGES.ALREADY_BOOKED);
  }
  const id = newId();
  writeLS(LS_BOOKINGS, [
    ...bookings,
    { id, slot_id: slot.id, class_date: classDate, name: name.trim(), contact: contact || null },
  ]);
  return { id, cancel_token: id };
}

export async function cancelBooking(id: string, token: string): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.rpc('cancel_booking', { p_id: id, p_token: token });
    if (error) throw error;
    return;
  }
  writeLS(
    LS_BOOKINGS,
    readLS<Booking[]>(LS_BOOKINGS, []).filter((b) => b.id !== id),
  );
}

/** Solo admin: reservas futuras de un hueco */
export async function fetchSlotBookings(slotId: string): Promise<Booking[]> {
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('slot_id', slotId)
      .gte('class_date', iso)
      .order('class_date')
      .order('created_at');
    if (error) throw error;
    return data as Booking[];
  }
  return readLS<Booking[]>(LS_BOOKINGS, [])
    .filter((b) => b.slot_id === slotId && b.class_date >= iso)
    .sort((a, b) => a.class_date.localeCompare(b.class_date));
}

/** Solo admin: eliminar una reserva */
export async function deleteBooking(id: string): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('bookings').delete().eq('id', id);
    if (error) throw error;
    return;
  }
  writeLS(
    LS_BOOKINGS,
    readLS<Booking[]>(LS_BOOKINGS, []).filter((b) => b.id !== id),
  );
}

// ---------------------------------------------------------------------------
// Socios (solo admin)
// ---------------------------------------------------------------------------

const setPasswordUrl = () => `${window.location.origin}/set-password`;

export async function fetchMembers(): Promise<Member[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('list_members');
    if (error) throw error;
    return data as Member[];
  }
  return readLS<Member[]>(LS_MEMBERS, []);
}

export async function inviteMember(input: MemberInput): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.functions.invoke('invite-user', {
      body: {
        action: 'invite',
        email: input.email.trim().toLowerCase(),
        first_name: input.first_name.trim(),
        last_name: input.last_name.trim(),
        phone: input.phone.trim() || null,
        redirectTo: setPasswordUrl(),
      },
    });
    if (error) throw new Error(await readInvokeError(error, 'No se pudo enviar la invitación.'));
    if (data?.error) throw new Error(data.error);
    return;
  }
  // Demo: alta local sin email
  const members = readLS<Member[]>(LS_MEMBERS, []);
  const nextNo = members.reduce((m, x) => Math.max(m, x.member_no), 1) + 1;
  writeLS(LS_MEMBERS, [
    ...members,
    {
      id: newId(),
      member_no: nextNo,
      role: 'user',
      email: input.email.trim().toLowerCase(),
      first_name: input.first_name.trim(),
      last_name: input.last_name.trim(),
      phone: input.phone.trim() || null,
      activated: false,
    },
  ]);
}

export async function resendInvite(email: string): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.functions.invoke('invite-user', {
      body: { action: 'resend', email, redirectTo: setPasswordUrl() },
    });
    if (error) throw new Error(await readInvokeError(error, 'No se pudo reenviar la invitación.'));
    if (data?.error) throw new Error(data.error);
    return;
  }
}

export async function deleteMember(userId: string): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.functions.invoke('invite-user', {
      body: { action: 'delete', user_id: userId },
    });
    if (error) throw new Error(await readInvokeError(error, 'No se pudo eliminar el socio.'));
    if (data?.error) throw new Error(data.error);
    return;
  }
  writeLS(
    LS_MEMBERS,
    readLS<Member[]>(LS_MEMBERS, []).filter((m) => m.id !== userId),
  );
}

/** Extrae el mensaje de error del cuerpo JSON de una Edge Function */
async function readInvokeError(error: unknown, fallback: string): Promise<string> {
  const ctx = (error as { context?: Response })?.context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.json();
      if (body?.error) return body.error as string;
    } catch {
      /* ignore */
    }
  }
  return error instanceof Error ? error.message : fallback;
}
