import { supabase, isSupabaseConfigured } from './supabase';
import { DEMO_CLASS_TYPES, DEMO_SLOTS } from './demoData';
import type {
  AppSettings,
  BillingSettings,
  Booking,
  BookingCounts,
  ClassCredit,
  ClassType,
  ClassTypeInput,
  MemberUsage,
  FinanceEntry,
  FinanceEntryInput,
  InvoiceItemInput,
  InvoiceKind,
  InvoiceLine,
  InvoiceParty,
  IssuedInvoice,
  ManualInvoiceClient,
  ManualInvoiceLine,
  Member,
  MemberBilling,
  MonthPaymentStatus,
  MemberIncomeRow,
  MemberInput,
  MyBookingRow,
  Plan,
  PlanInput,
  ScheduleSlot,
  SlotException,
  SlotInput,
  WeekStatus,
} from './types';
import { countKey, memberFullName } from './types';
import { capFirst, invoiceTotals, lineAmounts, round2, VAT_RATE } from './invoiceMath';
import { mondayOfWeekISO, shiftISO, todayISO } from './dates';

const LS_SETTINGS = 'rmbox_settings_v1';
const LS_PLANS = 'rmbox_plans_v2';
const DEFAULT_SETTINGS: AppSettings = { weekly_class_limit: 3, default_monthly_fee: 60, courtesy_classes: 2, booking_window_days: 2, logo_url: null };

const LS_SLOTS = 'rmbox_slots_v1';
const LS_SLOT_EXCEPTIONS = 'rmbox_slot_exceptions_v1';
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

/** Elimina la clase entera: si es recurrente, desaparece de todas las semanas. */
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
  writeLS(
    LS_SLOT_EXCEPTIONS,
    readLS<SlotException[]>(LS_SLOT_EXCEPTIONS, []).filter((e) => e.slot_id !== id),
  );
}

/** Sesiones sueltas eliminadas de clases recurrentes */
export async function fetchSlotExceptions(): Promise<SlotException[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.from('slot_exceptions').select('slot_id, class_date');
    if (error) throw error;
    return data as SlotException[];
  }
  return readLS<SlotException[]>(LS_SLOT_EXCEPTIONS, []);
}

/**
 * Elimina SOLO la sesión de un día concreto. Si la clase es recurrente sigue
 * existiendo el resto de semanas; si es puntual, se borra la clase entera.
 * Devuelve cuántas reservas de ese día se han cancelado.
 */
export async function deleteSlotOccurrence(
  slotId: string,
  classDate: string,
): Promise<{ bookings_removed: number }> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('delete_class_occurrence', {
      p_slot_id: slotId,
      p_class_date: classDate,
    });
    if (error) throw toBookingError(error.message);
    const d = data as { bookings_removed?: number };
    return { bookings_removed: Number(d?.bookings_removed ?? 0) };
  }
  const slot = readLS(LS_SLOTS, DEMO_SLOTS).find((s) => s.id === slotId);
  const bookings = readLS<Booking[]>(LS_BOOKINGS, []);
  const removed = bookings.filter((b) => b.slot_id === slotId && b.class_date === classDate).length;
  writeLS(
    LS_BOOKINGS,
    bookings.filter((b) => !(b.slot_id === slotId && b.class_date === classDate)),
  );
  if (slot && !slot.is_recurring) {
    writeLS(LS_SLOTS, readLS(LS_SLOTS, DEMO_SLOTS).filter((s) => s.id !== slotId));
  } else {
    const list = readLS<SlotException[]>(LS_SLOT_EXCEPTIONS, []);
    if (!list.some((e) => e.slot_id === slotId && e.class_date === classDate)) {
      writeLS(LS_SLOT_EXCEPTIONS, [...list, { slot_id: slotId, class_date: classDate }]);
    }
  }
  return { bookings_removed: removed };
}

// ---------------------------------------------------------------------------
// Reservas (vinculadas al socio, con límite de clases por semana)
// ---------------------------------------------------------------------------

export class BookingError extends Error {}

const BOOKING_ERROR_MESSAGES: Record<string, string> = {
  CLASS_FULL: 'La clase está completa: no quedan plazas.',
  ALREADY_BOOKED: 'Ya tienes una reserva para esta sesión.',
  DATE_IN_PAST: 'Esa sesión ya ha pasado.',
  DATE_MISMATCH: 'La fecha no corresponde a esta clase.',
  SLOT_NOT_FOUND: 'Esta clase ya no está disponible.',
  MEMBERSHIP_INACTIVE: 'Tu cuenta está inactiva. Ponte al día con el pago para reservar.',
  WEEKLY_LIMIT: 'Has alcanzado tu límite de clases de esta semana.',
  MONTHLY_LIMIT: 'Has alcanzado el máximo de clases de este mes de tu plan.',
  NOT_ADMIN: 'Solo un administrador puede hacer esto.',
  BAD_NAME: 'Escribe el nombre del invitado.',
  BAD_CONTACT: 'El teléfono es demasiado largo.',
  NOT_AUTHENTICATED: 'Inicia sesión para reservar.',
  NOT_FOUND: 'No se encontró la reserva.',
  TOO_FAR: 'Todavía no puedes reservar esta clase. Las reservas se abren 2 días antes.',
  CLASS_STARTED: 'Esta clase ya ha empezado.',
  CLASS_CANCELLED: 'Esa sesión se ha cancelado.',
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

/** Reservas futuras del socio que ha iniciado sesión */
export async function fetchMyBookings(): Promise<MyBookingRow[]> {
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  if (isSupabaseConfigured && supabase) {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return [];
    const { data, error } = await supabase
      .from('bookings')
      .select('id, slot_id, class_date')
      .eq('user_id', uid)
      .eq('status', 'booked')
      .gte('class_date', iso);
    if (error) throw error;
    return data as MyBookingRow[];
  }
  return readLS<Booking[]>(LS_BOOKINGS, [])
    .filter((b) => b.class_date >= iso)
    .map((b) => ({ id: b.id, slot_id: b.slot_id, class_date: b.class_date }));
}

/** Reserva una clase (consume un cupo de la semana). */
export async function bookClass(slotId: string, classDate: string): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.rpc('book_class', {
      p_slot_id: slotId,
      p_class_date: classDate,
    });
    if (error) throw toBookingError(error.message);
    return;
  }
  // Demo: reserva local sin control real del límite semanal
  const bookings = readLS<Booking[]>(LS_BOOKINGS, []);
  if (bookings.some((b) => b.slot_id === slotId && b.class_date === classDate)) {
    throw new BookingError(BOOKING_ERROR_MESSAGES.ALREADY_BOOKED);
  }
  writeLS(LS_BOOKINGS, [
    ...bookings,
    { id: newId(), slot_id: slotId, class_date: classDate, name: 'Socio Demo', contact: null },
  ]);
}

/** Cancela una reserva propia. Devuelve `true` si hubo penalización por
 *  cancelación tardía (dentro de la última hora): la plaza se libera pero la
 *  clase sigue contando en el límite semanal. */
export async function cancelMyBooking(bookingId: string): Promise<boolean> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('cancel_my_booking', { p_booking_id: bookingId });
    if (error) throw toBookingError(error.message);
    return Boolean((data as { penalized?: boolean })?.penalized);
  }
  writeLS(
    LS_BOOKINGS,
    readLS<Booking[]>(LS_BOOKINGS, []).filter((b) => b.id !== bookingId),
  );
  return false;
}

/** Solo admin: apunta a un cliente invitado (sin cuenta) a una sesión. */
export async function bookGuest(
  slotId: string,
  classDate: string,
  name: string,
  contact: string | null,
): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.rpc('book_guest', {
      p_slot_id: slotId,
      p_class_date: classDate,
      p_name: name,
      p_contact: contact,
    });
    if (error) throw toBookingError(error.message);
    return;
  }
  const bookings = readLS<Booking[]>(LS_BOOKINGS, []);
  writeLS(LS_BOOKINGS, [
    ...bookings,
    { id: newId(), slot_id: slotId, class_date: classDate, name, contact },
  ]);
}

/** Estado semanal del socio: clases usadas / límite. `refISO` = cualquier
 *  fecha de la semana objetivo (por defecto, la semana actual). */
export async function fetchWeekStatus(refISO?: string): Promise<WeekStatus> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('my_week_status', { p_ref: refISO ?? null });
    if (error) throw error;
    const d = data as {
      used: number;
      limit: number;
      unlimited: boolean;
      courtesy_used?: number;
      courtesy_limit?: number;
      monthly_used?: number;
      monthly_limit?: number | null;
    };
    return {
      used: Number(d.used),
      limit: Number(d.limit),
      unlimited: Boolean(d.unlimited),
      courtesy_used: d.courtesy_used != null ? Number(d.courtesy_used) : 0,
      courtesy_limit: d.courtesy_limit != null ? Number(d.courtesy_limit) : 0,
      monthly_used: d.monthly_used != null ? Number(d.monthly_used) : 0,
      monthly_limit: d.monthly_limit != null ? Number(d.monthly_limit) : null,
    };
  }
  const settings = { ...DEFAULT_SETTINGS, ...readLS<Partial<AppSettings>>(LS_SETTINGS, {}) };
  const monday = mondayOfWeekISO(refISO ?? todayISO());
  const nextMonday = shiftISO(monday, 7);
  const used = readLS<Booking[]>(LS_BOOKINGS, []).filter(
    (b) => b.class_date >= monday && b.class_date < nextMonday,
  ).length;
  return { used, limit: settings.weekly_class_limit, unlimited: false, courtesy_limit: settings.courtesy_classes, courtesy_used: 0 };
}

/** Demo: clases de cortesía usadas por el socio (reservas tras el mes vencido) */
export function demoCourtesyUsed(paidUntil: string | null | undefined): number {
  if (!paidUntil) return 0;
  return readLS<Booking[]>(LS_BOOKINGS, []).filter((b) => b.class_date > paidUntil).length;
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
      .eq('status', 'booked')
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

// ---------------------------------------------------------------------------
// Consumo de clases y devolución de créditos (solo admin)
// ---------------------------------------------------------------------------

const LS_CREDITS = 'rmbox_class_credits_v1';

/** Lunes de la semana de `iso` */
function weekStartOf(iso: string): string {
  return mondayOfWeekISO(iso);
}

/** Detalle de consumo de un socio: semana en curso, mes, reservas y créditos */
export async function fetchMemberUsage(memberId: string): Promise<MemberUsage> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('member_class_usage', { p_member_id: memberId });
    if (error) throw error;
    const d = data as MemberUsage;
    return {
      ...d,
      week_used: Number(d.week_used),
      week_limit: Number(d.week_limit),
      month_used: Number(d.month_used),
      month_limit: d.month_limit != null ? Number(d.month_limit) : null,
      courtesy_used: Number(d.courtesy_used ?? 0),
      week_bookings: d.week_bookings ?? [],
      credits: d.credits ?? [],
    };
  }
  // Demo: todas las reservas locales son del socio de prueba
  const today = todayISO();
  const week = weekStartOf(today);
  const weekEnd = shiftISO(week, 7);
  const month = today.slice(0, 7);
  const bookings = readLS<Booking[]>(LS_BOOKINGS, []);
  const credits = readLS<(ClassCredit & { user_id: string })[]>(LS_CREDITS, []).filter(
    (c) => c.user_id === memberId,
  );
  const sum = (list: ClassCredit[]) => list.reduce((s, c) => s + c.amount, 0);
  const slots = readLS(LS_SLOTS, DEMO_SLOTS);
  const types = readLS<ClassType[]>(LS_TYPES, DEMO_CLASS_TYPES);
  const member = readLS<Member[]>(LS_MEMBERS, []).find((m) => m.id === memberId);
  const plan = readLS<Plan[]>(LS_PLANS, []).find((p) => p.id === member?.plan_id);
  const settings = readLS<Partial<AppSettings>>(LS_SETTINGS, {});
  const weekCredits = credits.filter((c) => c.credit_date >= week && c.credit_date < weekEnd);
  const monthCredits = credits.filter((c) => c.credit_date.startsWith(month));
  const weekBookings = bookings.filter((b) => b.class_date >= week && b.class_date < weekEnd);
  return {
    week_start: week,
    week_used: Math.max(0, weekBookings.length - sum(weekCredits)),
    week_limit: plan?.weekly_limit ?? settings.weekly_class_limit ?? 3,
    month_used: Math.max(
      0,
      bookings.filter((b) => b.class_date.startsWith(month)).length - sum(monthCredits),
    ),
    month_limit: plan?.monthly_limit ?? null,
    courtesy_used: 0,
    week_bookings: weekBookings.map((b) => {
      const slot = slots.find((s) => s.id === b.slot_id);
      return {
        id: b.id,
        class_date: b.class_date,
        status: 'booked' as const,
        start_time: slot?.start_time ?? null,
        title:
          slot?.title ?? types.find((t) => t.id === slot?.class_type_id)?.name ?? 'Clase',
      };
    }),
    credits: monthCredits,
  };
}

/** Devuelve N clases a un socio, imputadas a la fecha indicada (hoy por defecto) */
export async function grantClassCredit(
  memberId: string,
  amount: number,
  date?: string,
  reason?: string | null,
): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.rpc('grant_class_credit', {
      p_member_id: memberId,
      p_amount: amount,
      p_date: date ?? null,
      p_reason: reason ?? null,
    });
    if (error) throw new Error(error.message);
    return;
  }
  writeLS(LS_CREDITS, [
    ...readLS<(ClassCredit & { user_id: string })[]>(LS_CREDITS, []),
    {
      id: newId(),
      user_id: memberId,
      credit_date: date ?? todayISO(),
      amount,
      reason: reason?.trim() || null,
      created_at: new Date().toISOString(),
    },
  ]);
}

/** Deshace una devolución de clases */
export async function deleteClassCredit(id: string): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.rpc('delete_class_credit', { p_id: id });
    if (error) throw new Error(error.message);
    return;
  }
  writeLS(
    LS_CREDITS,
    readLS<(ClassCredit & { user_id: string })[]>(LS_CREDITS, []).filter((c) => c.id !== id),
  );
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
      membership_active: false,
      plan_id: null,
      plan_name: null,
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

/** Solo admin: editar los datos de contacto de un socio (nombre, teléfono). */
export async function updateMemberProfile(
  memberId: string,
  patch: { first_name?: string | null; last_name?: string | null; phone?: string | null },
): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('profiles').update(patch).eq('id', memberId);
    if (error) throw error;
    return;
  }
  writeLS(
    LS_MEMBERS,
    readLS<Member[]>(LS_MEMBERS, []).map((m) => (m.id === memberId ? { ...m, ...patch } : m)),
  );
}

/** Solo admin: registra un pago (activa + suma un mes; ingreso opcional). */
export async function registerPayment(
  memberId: string,
  createIncome: boolean,
  amount?: number | null,
  paidAt?: string | null,
): Promise<{ paid_until: string; income_created: boolean; courtesy_reset: number }> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('register_payment', {
      p_member_id: memberId,
      p_create_income: createIncome,
      p_amount: amount ?? null,
      p_paid_at: paidAt ?? null,
    });
    if (error) throw error;
    const d = data as { paid_until: string; income_created: boolean; courtesy_reset?: number };
    return { ...d, courtesy_reset: d.courtesy_reset ?? 0 };
  }
  // Demo: mes rodante sobre localStorage + ingreso opcional
  const members = readLS<Member[]>(LS_MEMBERS, []);
  const m = members.find((x) => x.id === memberId);
  const today = todayISO();
  const ref = paidAt || today; // fecha de referencia del pago (indicada o hoy)
  // Las clases de cortesía usadas se perdonan al pagar: el contador vuelve a 0
  const courtesyReset = m?.paid_until && m.paid_until < today ? m.courtesy_used ?? 0 : 0;
  const base = m?.paid_until && m.paid_until > ref ? m.paid_until : ref;
  const d = new Date(`${base}T00:00:00`);
  d.setMonth(d.getMonth() + 1);
  const paidUntil = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  writeLS(
    LS_MEMBERS,
    members.map((x) =>
      x.id === memberId
        ? {
            ...x,
            membership_active: true,
            paid_until: paidUntil,
            class_debt: 0,
            courtesy_used: 0,
            week_used: Math.max(0, (x.week_used ?? 0) - courtesyReset),
            month_used: Math.max(0, (x.month_used ?? 0) - courtesyReset),
          }
        : x,
    ),
  );
  let income = false;
  const value = amount ?? readLS<Partial<AppSettings>>(LS_SETTINGS, {}).default_monthly_fee ?? 60;
  if (createIncome && value > 0) {
    const name = m ? memberFullNameLS(m) : 'Socio';
    writeLS(LS_FINANCE, [
      ...readLS<FinanceEntry[]>(LS_FINANCE, []),
      {
        id: newId(),
        kind: 'income',
        concept: `Cuota · ${name}`,
        amount: value,
        entry_date: ref,
        invoice_path: null,
        member_id: memberId,
      },
    ]);
    income = true;
  }
  return { paid_until: paidUntil, income_created: income, courtesy_reset: courtesyReset };
}

/** Solo admin: activar/desactivar la membresía o cambiar el plan de un socio */
export async function updateMemberMembership(
  memberId: string,
  patch: { membership_active?: boolean; plan_id?: string | null },
): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('profiles').update(patch).eq('id', memberId);
    if (error) throw error;
    return;
  }
  writeLS(
    LS_MEMBERS,
    readLS<Member[]>(LS_MEMBERS, []).map((m) =>
      m.id === memberId ? { ...m, ...patch } : m,
    ),
  );
}

// ---------------------------------------------------------------------------
// Ajustes de la app (solo admin edita; los socios los leen)
// ---------------------------------------------------------------------------

export async function fetchAppSettings(): Promise<AppSettings> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('app_settings')
      .select('weekly_class_limit, default_monthly_fee, courtesy_classes, booking_window_days, logo_url')
      .eq('id', true)
      .single();
    if (error) throw error;
    const row = data as {
      weekly_class_limit: number;
      default_monthly_fee: string | number;
      courtesy_classes: number;
      booking_window_days: number;
      logo_url: string | null;
    };
    return {
      weekly_class_limit: Number(row.weekly_class_limit),
      default_monthly_fee: Number(row.default_monthly_fee),
      courtesy_classes: Number(row.courtesy_classes),
      booking_window_days: Number(row.booking_window_days),
      logo_url: row.logo_url ?? null,
    };
  }
  return { ...DEFAULT_SETTINGS, ...readLS<Partial<AppSettings>>(LS_SETTINGS, {}) };
}

export async function updateAppSettings(patch: {
  weekly_class_limit: number;
  default_monthly_fee: number;
  courtesy_classes: number;
  booking_window_days: number;
}): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase
      .from('app_settings')
      .update({
        weekly_class_limit: patch.weekly_class_limit,
        default_monthly_fee: patch.default_monthly_fee,
        courtesy_classes: patch.courtesy_classes,
        booking_window_days: patch.booking_window_days,
        updated_at: new Date().toISOString(),
      })
      .eq('id', true);
    if (error) throw error;
    return;
  }
  const cur = readLS<Partial<AppSettings>>(LS_SETTINGS, {});
  writeLS(LS_SETTINGS, { ...cur, ...patch });
}

// ---------------------------------------------------------------------------
// Logo y branding (bucket público `branding`)
// ---------------------------------------------------------------------------

export interface PwaIcons {
  any192: string;
  any512: string;
  maskable: string;
}
export interface Branding {
  logo: string | null;
  icons: PwaIcons | null;
}

/** Logo + iconos de la app. Legible sin sesión vía get_branding(). */
export async function fetchBranding(): Promise<Branding> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('get_branding');
    if (error || !data) return { logo: null, icons: null };
    const d = data as { logo: string | null; icons: PwaIcons | null };
    return { logo: d.logo ?? null, icons: d.icons ?? null };
  }
  const ls = readLS<{ logo_url?: string; pwa_icons?: PwaIcons }>(LS_SETTINGS, {});
  return { logo: ls.logo_url ?? null, icons: ls.pwa_icons ?? null };
}

/** URL del logo configurado (o null). */
export async function fetchLogoUrl(): Promise<string | null> {
  return (await fetchBranding()).logo;
}

/** Dibuja el logo centrado sobre un fondo de marca y devuelve un canvas cuadrado */
async function renderIconCanvas(bitmap: ImageBitmap, size: number, frac: number, bg = '#0B0A0B') {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('No se pudo procesar la imagen.');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);
  const target = size * frac;
  const s = target / Math.max(bitmap.width, bitmap.height);
  const w = bitmap.width * s;
  const h = bitmap.height * s;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h);
  return c;
}
const canvasBlob = (c: HTMLCanvasElement) =>
  new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('canvas'))), 'image/png'));

/**
 * Imagen 1200x630 (Open Graph) con el logo centrado sobre el fondo de marca.
 * La usa la vista previa al compartir el enlace (WhatsApp, redes…). Se guarda
 * en una ruta FIJA del bucket para que <meta og:image> —que es estático— apunte
 * siempre a la versión actual del logo sin necesidad de redesplegar.
 */
const OG_PATH = 'og.png';
async function renderOgCanvas(bitmap: ImageBitmap, bg = '#0B0A0B') {
  const w = 1200;
  const h = 630;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('No se pudo procesar la imagen.');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const target = h * 0.78;
  const s = target / Math.max(bitmap.width, bitmap.height);
  const lw = bitmap.width * s;
  const lh = bitmap.height * s;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, (w - lw) / 2, (h - lh) / 2, lw, lh);
  return c;
}

/** (Re)genera y sube la imagen OG a la ruta fija. No corta el flujo si falla. */
async function updateOgImage(bitmap: ImageBitmap): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    const blob = await canvasBlob(await renderOgCanvas(bitmap));
    await supabase.storage
      .from('branding')
      .upload(OG_PATH, blob, { contentType: 'image/png', upsert: true, cacheControl: '60' });
  } catch {
    /* si falla, la vista previa conserva la imagen anterior */
  }
}

// Especificaciones de los iconos: [nombre, tamaño, fracción del logo]
const ICON_SPECS: [keyof PwaIcons, number, number][] = [
  ['any192', 192, 0.82],
  ['any512', 512, 0.82],
  ['maskable', 512, 0.62],
];

/** Rutas de storage a limpiar a partir de un branding anterior */
function brandingPaths(b: Branding): string[] {
  const urls = [b.logo, b.icons?.any192, b.icons?.any512, b.icons?.maskable].filter(Boolean) as string[];
  return urls
    .map((u) => u.split('/branding/')[1]?.split('?')[0])
    .filter((p): p is string => Boolean(p) && !p.startsWith('data:'));
}

/** Sube un logo nuevo, genera los iconos de la app y guarda todo. Solo admin. */
export async function uploadLogo(file: File): Promise<Branding> {
  if (!file.type.startsWith('image/')) throw new Error('El logo debe ser una imagen (PNG, JPG o WebP).');
  if (file.size > 3 * 1024 * 1024) throw new Error('El logo no puede superar los 3 MB.');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('No se pudo leer la imagen. Prueba con un PNG o JPG.');
  }

  if (isSupabaseConfigured && supabase) {
    const prev = await fetchBranding();
    const rid = crypto.randomUUID();
    const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    // Logo original (para mostrar dentro de la web)
    const logoPath = `logo-${rid}.${ext}`;
    const up = await supabase.storage.from('branding').upload(logoPath, file, { contentType: file.type, upsert: true });
    if (up.error) throw new Error('No se pudo subir el logo. Inténtalo de nuevo.');
    const logoUrl = supabase.storage.from('branding').getPublicUrl(logoPath).data.publicUrl;
    // Iconos de la PWA
    const icons = {} as PwaIcons;
    for (const [key, sz, frac] of ICON_SPECS) {
      const blob = await canvasBlob(await renderIconCanvas(bitmap, sz, frac));
      const ip = `${key}-${rid}.png`;
      const r = await supabase.storage.from('branding').upload(ip, blob, { contentType: 'image/png', upsert: true });
      if (r.error) throw new Error('No se pudieron generar los iconos.');
      icons[key] = supabase.storage.from('branding').getPublicUrl(ip).data.publicUrl;
    }
    // Vista previa al compartir (Open Graph), en ruta fija -> se actualiza sola
    await updateOgImage(bitmap);
    const { error: upErr } = await supabase
      .from('app_settings')
      .update({ logo_url: logoUrl, pwa_icons: icons, updated_at: new Date().toISOString() })
      .eq('id', true);
    if (upErr) throw upErr;
    // Limpia los archivos del branding anterior
    const old = brandingPaths(prev);
    if (old.length) await supabase.storage.from('branding').remove(old).catch(() => undefined);
    return { logo: logoUrl, icons };
  }

  // Demo: logo + iconos como data URLs en localStorage
  const logoUrl: string = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(new Error('No se pudo leer el archivo.'));
    r.readAsDataURL(file);
  });
  const icons = {} as PwaIcons;
  for (const [key, sz, frac] of ICON_SPECS) {
    icons[key] = (await renderIconCanvas(bitmap, sz, frac)).toDataURL('image/png');
  }
  writeLS(LS_SETTINGS, { ...readLS<Record<string, unknown>>(LS_SETTINGS, {}), logo_url: logoUrl, pwa_icons: icons });
  return { logo: logoUrl, icons };
}

/** Vuelve al logo/iconos por defecto. Solo admin. */
export async function resetLogo(): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const prev = await fetchBranding();
    const { error } = await supabase
      .from('app_settings')
      .update({ logo_url: null, pwa_icons: null, updated_at: new Date().toISOString() })
      .eq('id', true);
    if (error) throw error;
    const old = brandingPaths(prev);
    if (old.length) await supabase.storage.from('branding').remove(old).catch(() => undefined);
    // Regenera la vista previa a partir del logo por defecto (paquete de la app)
    try {
      const bmp = await createImageBitmap(await (await fetch('/logo.png')).blob());
      await updateOgImage(bmp);
    } catch {
      /* ignore */
    }
    return;
  }
  const cur = readLS<Record<string, unknown>>(LS_SETTINGS, {});
  delete cur.logo_url;
  delete cur.pwa_icons;
  writeLS(LS_SETTINGS, cur);
}

// ---------------------------------------------------------------------------
// Planes de mensualidad (el admin los gestiona; los socios pueden leerlos)
// ---------------------------------------------------------------------------

export async function fetchPlans(): Promise<Plan[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('plans')
      .select('*')
      .order('monthly_price');
    if (error) throw error;
    return (data as (Omit<Plan, 'monthly_price'> & { monthly_price: string | number })[]).map(
      (p) => ({ ...p, monthly_price: Number(p.monthly_price) }),
    );
  }
  return readLS<Plan[]>(LS_PLANS, []);
}

export async function createPlan(input: PlanInput): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('plans').insert(input);
    if (error) throw error;
    return;
  }
  writeLS(LS_PLANS, [...readLS<Plan[]>(LS_PLANS, []), { ...input, id: newId() }]);
}

export async function updatePlan(id: string, input: PlanInput): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('plans').update(input).eq('id', id);
    if (error) throw error;
    return;
  }
  writeLS(
    LS_PLANS,
    readLS<Plan[]>(LS_PLANS, []).map((p) => (p.id === id ? { ...p, ...input } : p)),
  );
}

export async function deletePlan(id: string): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('plans').delete().eq('id', id);
    if (error) throw error;
    return;
  }
  writeLS(
    LS_PLANS,
    readLS<Plan[]>(LS_PLANS, []).filter((p) => p.id !== id),
  );
}

/** Solo admin: cuotas mensuales automáticas de los socios activos.
 *  Con plan → precio del plan; sin plan → cuota estándar. */
export async function fetchMemberIncome(): Promise<MemberIncomeRow[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('member_income');
    if (error) throw error;
    return (data as (Omit<MemberIncomeRow, 'amount'> & { amount: string | number })[]).map(
      (r) => ({ ...r, amount: Number(r.amount) }),
    );
  }
  const fee = (await fetchAppSettings()).default_monthly_fee;
  const plans = readLS<Plan[]>(LS_PLANS, []);
  return readLS<Member[]>(LS_MEMBERS, [])
    .filter((m) => m.role !== 'admin' && m.membership_active)
    .map((m) => {
      const plan = plans.find((p) => p.id === m.plan_id);
      return {
        member_id: m.id,
        member_name: memberFullNameLS(m),
        plan_name: plan?.name ?? 'Cuota estándar',
        amount: plan?.monthly_price ?? fee,
      };
    });
}

const memberFullNameLS = (m: Member) =>
  [m.first_name, m.last_name].filter(Boolean).join(' ').trim() || m.email || 'Socio';

// ---------------------------------------------------------------------------
// Finanzas: ingresos y gastos (solo admin, RLS lo garantiza)
// ---------------------------------------------------------------------------

const LS_FINANCE = 'rmbox_finance_v1';

/** Movimientos entre dos fechas (ambas incluidas), más recientes primero */
export async function fetchFinanceEntries(
  fromISO: string,
  toISO: string,
): Promise<FinanceEntry[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('finance_entries')
      .select('*')
      .gte('entry_date', fromISO)
      .lte('entry_date', toISO)
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw error;
    // numeric llega como string desde PostgREST
    return (data as (Omit<FinanceEntry, 'amount'> & { amount: string | number })[]).map((e) => ({
      ...e,
      amount: Number(e.amount),
    }));
  }
  return readLS<FinanceEntry[]>(LS_FINANCE, [])
    .filter((e) => e.entry_date >= fromISO && e.entry_date <= toISO)
    .sort((a, b) => b.entry_date.localeCompare(a.entry_date));
}

export async function createFinanceEntry(input: FinanceEntryInput): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('finance_entries').insert(input);
    if (error) throw error;
    return;
  }
  writeLS(LS_FINANCE, [...readLS<FinanceEntry[]>(LS_FINANCE, []), { ...input, id: newId() }]);
}

export async function updateFinanceEntry(id: string, input: FinanceEntryInput): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('finance_entries').update(input).eq('id', id);
    if (error) throw error;
    return;
  }
  writeLS(
    LS_FINANCE,
    readLS<FinanceEntry[]>(LS_FINANCE, []).map((e) => (e.id === id ? { ...e, ...input } : e)),
  );
}

export async function deleteFinanceEntry(id: string, invoicePath?: string | null): Promise<void> {
  if (invoicePath) await deleteInvoice(invoicePath).catch(() => undefined);
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('finance_entries').delete().eq('id', id);
    if (error) throw error;
    return;
  }
  writeLS(
    LS_FINANCE,
    readLS<FinanceEntry[]>(LS_FINANCE, []).filter((e) => e.id !== id),
  );
}

// ---------------------------------------------------------------------------
// Facturas de gastos (bucket privado `invoices`, solo admin)
// ---------------------------------------------------------------------------

const INVOICE_MAX_BYTES = 10 * 1024 * 1024;

/** Sube una factura (imagen o PDF) y devuelve su ruta en Storage. */
export async function uploadInvoice(file: File): Promise<string> {
  if (file.size > INVOICE_MAX_BYTES) {
    throw new Error('La factura no puede superar los 10 MB.');
  }
  if (isSupabaseConfigured && supabase) {
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('invoices').upload(path, file, {
      contentType: file.type || undefined,
    });
    if (error) throw new Error('No se pudo subir la factura. Inténtalo de nuevo.');
    return path;
  }
  // Demo: la factura se guarda embebida como data URL (solo archivos pequeños)
  if (file.size > 2 * 1024 * 1024) throw new Error('Modo demo: máximo 2 MB.');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(file);
  });
}

/** URL temporal (1 h) para ver una factura. */
export async function getInvoiceUrl(path: string): Promise<string> {
  if (path.startsWith('data:')) return path; // demo
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.storage.from('invoices').createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) throw new Error('No se pudo abrir la factura.');
    return data.signedUrl;
  }
  return path;
}

/** Descarga el contenido de una factura (para empaquetar en ZIP). */
export async function downloadInvoiceBytes(path: string): Promise<Uint8Array> {
  if (path.startsWith('data:')) {
    const blob = await (await fetch(path)).blob(); // demo
    return new Uint8Array(await blob.arrayBuffer());
  }
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.storage.from('invoices').download(path);
    if (error || !data) throw new Error('No se pudo descargar una factura.');
    return new Uint8Array(await data.arrayBuffer());
  }
  throw new Error('No se pudo descargar la factura.');
}

/** Borra una factura del bucket (al eliminar o sustituir el adjunto). */
export async function deleteInvoice(path: string): Promise<void> {
  if (path.startsWith('data:')) return; // demo
  if (isSupabaseConfigured && supabase) {
    await supabase.storage.from('invoices').remove([path]);
  }
}

// ---------------------------------------------------------------------------
// Facturas emitidas a los socios (solo admin)
//
// La base de datos asigna el número (correlativo por año) y guarda una foto de
// los datos; el PDF se genera en el navegador (lib/invoicePdf) y se sube al
// bucket `invoices`, en emitidas/<año>/<número>.pdf.
// ---------------------------------------------------------------------------

const LS_BILLING = 'rmbox_billing_v1';
const LS_ISSUED = 'rmbox_issued_invoices_v1';

const EMPTY_BILLING: BillingSettings = {
  issuer_name: null,
  issuer_nif: null,
  issuer_address1: null,
  issuer_address2: null,
};

/** Datos fiscales del box (emisor de las facturas) */
export async function fetchBillingSettings(): Promise<BillingSettings> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('billing_settings')
      .select('issuer_name, issuer_nif, issuer_address1, issuer_address2')
      .eq('id', true)
      .maybeSingle();
    if (error) throw error;
    return (data as BillingSettings | null) ?? EMPTY_BILLING;
  }
  return { ...EMPTY_BILLING, ...readLS<Partial<BillingSettings>>(LS_BILLING, {}) };
}

export async function updateBillingSettings(input: BillingSettings): Promise<void> {
  const clean = (v: string | null) => (v && v.trim() ? v.trim().replace(/\s+/g, ' ') : null);
  const row: BillingSettings = {
    issuer_name: clean(input.issuer_name),
    issuer_nif: clean(input.issuer_nif)?.replace(/[\s-]/g, '').toUpperCase() ?? null,
    issuer_address1: clean(input.issuer_address1),
    issuer_address2: clean(input.issuer_address2),
  };
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase
      .from('billing_settings')
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq('id', true);
    if (error) throw error;
    return;
  }
  writeLS(LS_BILLING, row);
}

const INVOICE_ERROR_MESSAGES: Record<string, string> = {
  ISSUER_MISSING: 'Faltan los datos de facturación del box. Complétalos en Configuración.',
  MEMBER_NOT_FOUND: 'No se ha encontrado el cliente.',
  DATE_IN_FUTURE: 'La fecha de la factura no puede ser posterior a hoy.',
  NO_ITEMS: 'Añade al menos un producto.',
  TOO_MANY_ITEMS: 'Una factura admite como máximo 10 productos.',
  BAD_QUANTITY: 'Las cantidades deben estar entre 1 y 99.',
  PLAN_NOT_FOUND: 'Uno de los productos ya no existe. Recarga la página.',
  NO_PAYMENTS: 'Este socio no tiene cuotas de este mes pendientes de facturar.',
  CLIENT_NAME_MISSING: 'Escribe el nombre y apellidos (o la razón social) del cliente.',
  CLIENT_NIF_MISSING: 'Escribe el NIF del cliente.',
  CLIENT_ADDRESS_MISSING: 'Escribe la dirección del cliente.',
  BAD_CONCEPT: 'Cada línea necesita un concepto (máx. 120 caracteres).',
  BAD_AMOUNT: 'Revisa las cantidades y los precios: deben ser números.',
  BAD_PRICE: 'Los precios deben ser mayores que 0.',
  ZERO_PRICE: 'Uno de los productos no tiene precio.',
  NOT_ADMIN: 'Solo un administrador puede emitir facturas.',
};

function invoiceError(raw: string): Error {
  const before = /DATE_BEFORE_LAST:(\S+)/.exec(raw);
  if (before) {
    return new Error(
      `La fecha no puede ser anterior a la de la última factura emitida (${before[1]}).`,
    );
  }
  const code = Object.keys(INVOICE_ERROR_MESSAGES).find((c) => raw.includes(c));
  return new Error(code ? INVOICE_ERROR_MESSAGES[code] : 'No se pudo emitir la factura. Inténtalo de nuevo.');
}

/** numeric llega como texto o número según la vía: lo dejamos siempre en número */
function normalizeInvoice(raw: unknown): IssuedInvoice {
  const r = raw as IssuedInvoice;
  return {
    ...r,
    number: Number(r.number),
    vat_rate: Number(r.vat_rate),
    base: Number(r.base),
    vat: Number(r.vat),
    total: Number(r.total),
    lines: (r.lines ?? []).map((l) => ({
      ...l,
      quantity: Number(l.quantity),
      unit_price: Number(l.unit_price),
      unit_price_with_vat: Number(l.unit_price_with_vat),
      vat_rate: Number(l.vat_rate),
      base: Number(l.base),
      total: Number(l.total),
    })),
  };
}

/** Emite la factura: asigna número, guarda la foto de los datos y la devuelve */
export async function issueInvoice(
  memberId: string,
  issueDate: string,
  items: InvoiceItemInput[],
): Promise<IssuedInvoice> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('issue_invoice', {
      p_member_id: memberId,
      p_issue_date: issueDate,
      p_items: items,
    });
    if (error) throw invoiceError(error.message);
    return normalizeInvoice(data);
  }
  return issueInvoiceDemo(memberId, issueDate, items);
}

/** Demo: misma lógica que issue_invoice, guardada en este navegador */
async function issueInvoiceDemo(
  memberId: string,
  issueDate: string,
  items: InvoiceItemInput[],
): Promise<IssuedInvoice> {
  const billing = await fetchBillingSettings();
  if (!billing.issuer_name || !billing.issuer_nif) throw invoiceError('ISSUER_MISSING');
  const member = readLS<Member[]>(LS_MEMBERS, []).find((m) => m.id === memberId);
  if (!member) throw invoiceError('MEMBER_NOT_FOUND');
  if (!issueDate || issueDate > todayISO()) throw invoiceError('DATE_IN_FUTURE');
  if (items.length === 0) throw invoiceError('NO_ITEMS');
  if (items.length > 10) throw invoiceError('TOO_MANY_ITEMS');

  const merged = new Map<string, InvoiceItemInput>();
  for (const it of items) {
    const k = it.plan_id ?? '';
    merged.set(k, { plan_id: it.plan_id, quantity: (merged.get(k)?.quantity ?? 0) + it.quantity });
  }
  const plans = readLS<Plan[]>(LS_PLANS, []);
  const fee = (await fetchAppSettings()).default_monthly_fee;
  const lines: InvoiceLine[] = [];
  for (const it of merged.values()) {
    if (!Number.isInteger(it.quantity) || it.quantity < 1 || it.quantity > 99) {
      throw invoiceError('BAD_QUANTITY');
    }
    const plan = it.plan_id ? plans.find((p) => p.id === it.plan_id) : null;
    if (it.plan_id && !plan) throw invoiceError('PLAN_NOT_FOUND');
    const price = plan ? plan.monthly_price : fee;
    if (!(price > 0)) throw invoiceError('ZERO_PRICE');
    const { total, base } = lineAmounts(price, it.quantity);
    lines.push({
      concept: plan ? capFirst(plan.name.trim()) : 'Cuota estándar',
      detail: plan ? (plan.description?.trim() ? capFirst(plan.description.trim()) : null) : 'Cuota mensual',
      quantity: it.quantity,
      unit_price: Math.round((price / (1 + VAT_RATE / 100)) * 10000) / 10000,
      unit_price_with_vat: price,
      vat_rate: VAT_RATE,
      base,
      total,
    });
  }
  return createIssuedDemo(member, issueDate, lines, billing);
}

/** Demo: parte común de emitir (numeración correlativa y foto de los datos) */
/** Demo: factura del box para un socio (precios con IVA incluido) */
function createIssuedDemo(
  member: Member,
  issueDate: string,
  lines: InvoiceLine[],
  billing: BillingSettings,
): IssuedInvoice {
  const t = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);
  const client: InvoiceParty = { name: memberFullName(member) };
  if (t(member.nif)) client.nif = t(member.nif)!.toUpperCase();
  if (t(member.address1)) client.address1 = t(member.address1);
  if (t(member.address2)) client.address2 = t(member.address2);
  if (t(member.phone)) client.phone = t(member.phone);
  if (t(member.email)) client.email = t(member.email);
  return createInvoiceDemo({
    prefix: 'F',
    kind: 'box',
    memberId: member.id,
    client,
    issueDate,
    lines,
    ...invoiceTotals(lines),
    billing,
  });
}

/** Demo: alta de una factura en su serie (numeración correlativa por serie) */
function createInvoiceDemo(o: {
  prefix: 'F' | 'A';
  kind: InvoiceKind;
  memberId: string | null;
  client: InvoiceParty;
  issueDate: string;
  lines: InvoiceLine[];
  base: number;
  vat: number;
  total: number;
  billing: BillingSettings;
}): IssuedInvoice {
  const { billing, issueDate } = o;
  if (!billing.issuer_name || !billing.issuer_nif) throw invoiceError('ISSUER_MISSING');
  const series = `${o.prefix}${issueDate.slice(0, 4)}`;
  const all = readLS<IssuedInvoice[]>(LS_ISSUED, []);
  const same = all.filter((i) => i.series === series);
  const lastDate = same.reduce<string | null>((d, i) => (!d || i.issue_date > d ? i.issue_date : d), null);
  if (lastDate && issueDate < lastDate) {
    throw invoiceError(`DATE_BEFORE_LAST:${lastDate.split('-').reverse().join('/')}`);
  }
  const number = same.reduce((n, i) => Math.max(n, i.number), 0) + 1;
  const inv: IssuedInvoice = {
    id: newId(),
    series,
    number,
    code: `${series}-${String(number).padStart(5, '0')}`,
    kind: o.kind,
    issue_date: issueDate,
    member_id: o.memberId,
    issuer: {
      name: billing.issuer_name,
      nif: billing.issuer_nif,
      address1: billing.issuer_address1,
      address2: billing.issuer_address2,
    },
    client: o.client,
    lines: o.lines,
    vat_rate: VAT_RATE,
    base: o.base,
    vat: o.vat,
    total: o.total,
    pdf_path: null,
    created_at: new Date().toISOString(),
  };
  writeLS(LS_ISSUED, [...all, inv]);
  return inv;
}

// ----- Facturas de asesorías deportivas (bonos escritos a mano) ---------------

/** Emite una factura de asesoría (serie A): cliente y bonos escritos a mano, precio con IVA */
export async function issueManualInvoice(
  issueDate: string,
  client: ManualInvoiceClient,
  lines: ManualInvoiceLine[],
): Promise<IssuedInvoice> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('issue_manual_invoice', {
      p_issue_date: issueDate,
      p_client: client,
      p_lines: lines,
    });
    if (error) throw invoiceError(error.message);
    return normalizeInvoice(data);
  }
  // Demo: mismas comprobaciones que issue_manual_invoice
  const billing = await fetchBillingSettings();
  if (!billing.issuer_name || !billing.issuer_nif) throw invoiceError('ISSUER_MISSING');
  if (!issueDate || issueDate > todayISO()) throw invoiceError('DATE_IN_FUTURE');
  const sp = (v: string | null | undefined) => (v ?? '').replace(/\s+/g, ' ').trim();
  const name = sp(client.name);
  const nif = (client.nif ?? '').replace(/[\s-]/g, '').toUpperCase();
  const address1 = sp(client.address1);
  const address2 = sp(client.address2);
  if (!name || name.length > 120) throw invoiceError('CLIENT_NAME_MISSING');
  if (nif.length < 3 || nif.length > 20) throw invoiceError('CLIENT_NIF_MISSING');
  if (!address1 || address1.length > 120 || address2.length > 120) throw invoiceError('CLIENT_ADDRESS_MISSING');
  if (lines.length === 0) throw invoiceError('NO_ITEMS');
  if (lines.length > 10) throw invoiceError('TOO_MANY_ITEMS');
  // Bonos: cantidad entera y precio final con IVA incluido (como el box)
  const built: InvoiceLine[] = lines.map((l) => {
    const concept = sp(l.concept);
    if (!concept || concept.length > 120) throw invoiceError('BAD_CONCEPT');
    if (!Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > 99) throw invoiceError('BAD_QUANTITY');
    if (!(l.price > 0) || l.price > 999999) throw invoiceError('BAD_PRICE');
    const price = round2(l.price);
    const { base, total } = lineAmounts(price, l.quantity);
    return {
      concept,
      detail: null,
      quantity: l.quantity,
      unit_price: Math.round((price / (1 + VAT_RATE / 100)) * 10000) / 10000,
      unit_price_with_vat: price,
      vat_rate: VAT_RATE,
      base,
      total,
    };
  });
  return createInvoiceDemo({
    prefix: 'A',
    kind: 'asesoria',
    memberId: null,
    client: { name, nif, address1, ...(address2 ? { address2 } : {}) },
    issueDate,
    lines: built,
    ...invoiceTotals(built),
    billing,
  });
}

// ----- NIF y dirección de los socios ------------------------------------------

/** NIF y dirección de cada socio (solo admin) */
export async function fetchMembersBilling(): Promise<Record<string, MemberBilling>> {
  const out: Record<string, MemberBilling> = {};
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.from('profiles').select('id, nif, address1, address2');
    if (error) throw error;
    for (const r of (data ?? []) as (MemberBilling & { id: string })[]) {
      out[r.id] = { nif: r.nif ?? null, address1: r.address1 ?? null, address2: r.address2 ?? null };
    }
    return out;
  }
  for (const m of readLS<Member[]>(LS_MEMBERS, [])) {
    out[m.id] = { nif: m.nif ?? null, address1: m.address1 ?? null, address2: m.address2 ?? null };
  }
  return out;
}

/** Guarda el NIF y la dirección en la ficha del socio (vacío = se borra) */
export async function updateMemberBilling(memberId: string, b: MemberBilling): Promise<void> {
  const clean = (v: string | null) => (v && v.trim() ? v.trim().replace(/\s+/g, ' ') : null);
  const patch: MemberBilling = {
    nif: clean(b.nif)?.replace(/[\s-]/g, '').toUpperCase() ?? null,
    address1: clean(b.address1),
    address2: clean(b.address2),
  };
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('profiles').update(patch).eq('id', memberId);
    if (error) throw new Error('No se pudieron guardar el NIF y la dirección del socio.');
    return;
  }
  writeLS(
    LS_MEMBERS,
    readLS<Member[]>(LS_MEMBERS, []).map((m) => (m.id === memberId ? { ...m, ...patch } : m)),
  );
}

// ----- Facturar las cuotas del mes desde la lista de socios -----------------

/** Nombre sin tildes, en minúsculas y con espacios simples (como norm_person_name) */
const normName = (s: string | null | undefined) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/** Demo: socio de una cuota, por su enlace o por el nombre del concepto */
function demoMemberOfEntry(e: FinanceEntry, members: Member[]): string | null {
  if (e.member_id) return e.member_id;
  const c = normName(e.concept);
  if (!c.startsWith('cuota') || !e.concept.includes('·')) return null;
  const n = normName(e.concept.slice(e.concept.lastIndexOf('·') + 1));
  const hits = members.filter((m) => normName(memberFullName(m)) === n || normName(m.email) === n);
  return hits.length === 1 ? hits[0].id : null;
}

/** Demo: cuotas del mes en curso (hasta hoy) */
function demoMonthIncome(): FinanceEntry[] {
  const today = todayISO();
  const first = `${today.slice(0, 7)}-01`;
  return readLS<FinanceEntry[]>(LS_FINANCE, []).filter(
    (e) => e.kind === 'income' && e.entry_date >= first && e.entry_date <= today,
  );
}

/** Cuotas del mes de cada socio: pendientes de facturar y facturas ya hechas */
export async function fetchMonthPaymentsStatus(): Promise<Record<string, MonthPaymentStatus>> {
  const out: Record<string, MonthPaymentStatus> = {};
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('month_payments_status');
    if (error) throw error;
    for (const r of (data ?? []) as MonthPaymentStatus[]) {
      out[r.member_id] = {
        member_id: r.member_id,
        pending: (r.pending ?? []).map((p) => ({ ...p, amount: Number(p.amount) })),
        invoiced: r.invoiced ?? [],
      };
    }
    return out;
  }
  const members = readLS<Member[]>(LS_MEMBERS, []);
  const issued = readLS<IssuedInvoice[]>(LS_ISSUED, []);
  for (const e of demoMonthIncome().sort((a, b) => a.entry_date.localeCompare(b.entry_date))) {
    const mid = demoMemberOfEntry(e, members);
    if (!mid) continue;
    const s = (out[mid] ??= { member_id: mid, pending: [], invoiced: [] });
    if (e.issued_invoice_id) {
      const code = issued.find((i) => i.id === e.issued_invoice_id)?.code;
      if (code && !s.invoiced.includes(code)) s.invoiced.push(code);
    } else {
      s.pending.push({ id: e.id, entry_date: e.entry_date, amount: e.amount, concept: e.concept });
    }
  }
  return out;
}

/** Factura, con fecha de hoy, las cuotas del mes en curso aún sin facturar del socio */
export async function issueInvoiceFromPayments(memberId: string): Promise<IssuedInvoice> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('issue_invoice_from_payments', { p_member_id: memberId });
    if (error) throw invoiceError(error.message);
    return normalizeInvoice(data);
  }
  // Demo: misma lógica que issue_invoice_from_payments
  const members = readLS<Member[]>(LS_MEMBERS, []);
  const member = members.find((m) => m.id === memberId);
  if (!member) throw invoiceError('MEMBER_NOT_FOUND');
  const pagos = demoMonthIncome()
    .filter((e) => !e.issued_invoice_id && demoMemberOfEntry(e, members) === memberId)
    .sort((a, b) => a.entry_date.localeCompare(b.entry_date));
  if (pagos.length === 0) throw invoiceError('NO_PAYMENTS');
  if (pagos.length > 10) throw invoiceError('TOO_MANY_ITEMS');
  const plan = readLS<Plan[]>(LS_PLANS, []).find((p) => p.id === member.plan_id) ?? null;
  const fee = (await fetchAppSettings()).default_monthly_fee;
  const lines: InvoiceLine[] = pagos.map((e) => {
    const pago = `Pago del ${e.entry_date.split('-').reverse().join('/')}`;
    let concept = 'Cuota mensual';
    let detail = pago;
    if (plan && plan.monthly_price === e.amount) {
      concept = capFirst(plan.name.trim());
      detail = [plan.description?.trim() ? capFirst(plan.description.trim()) : null, pago]
        .filter(Boolean)
        .join(' · ');
    } else if (!plan && e.amount === fee) {
      concept = 'Cuota estándar';
      detail = `Cuota mensual · ${pago}`;
    }
    const { total, base } = lineAmounts(e.amount, 1);
    return {
      concept,
      detail,
      quantity: 1,
      unit_price: Math.round((e.amount / (1 + VAT_RATE / 100)) * 10000) / 10000,
      unit_price_with_vat: e.amount,
      vat_rate: VAT_RATE,
      base,
      total,
    };
  });
  const inv = createIssuedDemo(member, todayISO(), lines, await fetchBillingSettings());
  const ids = new Set(pagos.map((p) => p.id));
  writeLS(
    LS_FINANCE,
    readLS<FinanceEntry[]>(LS_FINANCE, []).map((e) =>
      ids.has(e.id) ? { ...e, issued_invoice_id: inv.id, member_id: memberId } : e,
    ),
  );
  return inv;
}

/** Facturas emitidas entre dos fechas (incluidas), de la más reciente a la más antigua */
export async function fetchIssuedInvoices(fromISO: string, toISO: string): Promise<IssuedInvoice[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('issued_invoices')
      .select('*')
      .gte('issue_date', fromISO)
      .lte('issue_date', toISO)
      .order('issue_date', { ascending: false })
      .order('number', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(normalizeInvoice);
  }
  return readLS<IssuedInvoice[]>(LS_ISSUED, [])
    .filter((i) => i.issue_date >= fromISO && i.issue_date <= toISO)
    .sort((a, b) => b.issue_date.localeCompare(a.issue_date) || b.number - a.number);
}

/** Fecha de la última factura emitida (las nuevas no pueden ser anteriores) */
export async function fetchLastInvoiceDate(kind: InvoiceKind = 'box'): Promise<string | null> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('issued_invoices')
      .select('issue_date')
      .eq('kind', kind)
      .order('issue_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (data as { issue_date: string } | null)?.issue_date ?? null;
  }
  return readLS<IssuedInvoice[]>(LS_ISSUED, [])
    .filter((i) => (i.kind ?? 'box') === kind)
    .reduce<string | null>((d, i) => (!d || i.issue_date > d ? i.issue_date : d), null);
}

/** Sube el PDF de una factura emitida y apunta su ruta. Devuelve la ruta. */
export async function saveIssuedInvoicePdf(inv: IssuedInvoice, bytes: Uint8Array): Promise<string> {
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/pdf' });
  if (isSupabaseConfigured && supabase) {
    const path = `emitidas/${inv.series.slice(1)}/${inv.code}.pdf`;
    const { error: upErr } = await supabase.storage
      .from('invoices')
      .upload(path, blob, { contentType: 'application/pdf', upsert: true });
    if (upErr) throw new Error('No se pudo guardar el PDF de la factura.');
    const { error } = await supabase.rpc('attach_invoice_pdf', { p_invoice_id: inv.id, p_path: path });
    if (error) throw new Error('No se pudo guardar el PDF de la factura.');
    return path;
  }
  // Demo: el PDF se guarda embebido como data URL
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('No se pudo guardar el PDF de la factura.'));
    reader.readAsDataURL(blob);
  });
  writeLS(
    LS_ISSUED,
    readLS<IssuedInvoice[]>(LS_ISSUED, []).map((i) => (i.id === inv.id ? { ...i, pdf_path: dataUrl } : i)),
  );
  return dataUrl;
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
