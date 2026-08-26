import { supabase, isSupabaseConfigured } from './supabase';
import { DEMO_CLASS_TYPES, DEMO_SLOTS } from './demoData';
import type {
  AppSettings,
  Booking,
  BookingCounts,
  ClassType,
  ClassTypeInput,
  FinanceEntry,
  FinanceEntryInput,
  Member,
  MemberIncomeRow,
  MemberInput,
  MyBookingRow,
  Plan,
  PlanInput,
  ScheduleSlot,
  SlotInput,
  WeekStatus,
} from './types';
import { countKey } from './types';
import { mondayOfWeekISO, shiftISO, todayISO } from './dates';

const LS_SETTINGS = 'rmbox_settings_v1';
const LS_PLANS = 'rmbox_plans_v2';
const DEFAULT_SETTINGS: AppSettings = { weekly_class_limit: 3, default_monthly_fee: 60 };

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
  NOT_AUTHENTICATED: 'Inicia sesión para reservar.',
  NOT_FOUND: 'No se encontró la reserva.',
  TOO_FAR: 'Todavía no puedes reservar esta clase. Las reservas se abren 2 días antes.',
  CLASS_STARTED: 'Esta clase ya ha empezado.',
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

/** Estado semanal del socio: clases usadas / límite. `refISO` = cualquier
 *  fecha de la semana objetivo (por defecto, la semana actual). */
export async function fetchWeekStatus(refISO?: string): Promise<WeekStatus> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('my_week_status', { p_ref: refISO ?? null });
    if (error) throw error;
    const d = data as { used: number; limit: number; unlimited: boolean };
    return { used: Number(d.used), limit: Number(d.limit), unlimited: Boolean(d.unlimited) };
  }
  const limit = readLS<AppSettings>(LS_SETTINGS, DEFAULT_SETTINGS).weekly_class_limit;
  const monday = mondayOfWeekISO(refISO ?? todayISO());
  const nextMonday = shiftISO(monday, 7);
  const used = readLS<Booking[]>(LS_BOOKINGS, []).filter(
    (b) => b.class_date >= monday && b.class_date < nextMonday,
  ).length;
  return { used, limit, unlimited: false };
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
      .select('weekly_class_limit, default_monthly_fee')
      .eq('id', true)
      .single();
    if (error) throw error;
    const row = data as { weekly_class_limit: number; default_monthly_fee: string | number };
    return {
      weekly_class_limit: Number(row.weekly_class_limit),
      default_monthly_fee: Number(row.default_monthly_fee),
    };
  }
  return { ...DEFAULT_SETTINGS, ...readLS<Partial<AppSettings>>(LS_SETTINGS, {}) };
}

export async function updateAppSettings(patch: AppSettings): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase
      .from('app_settings')
      .update({
        weekly_class_limit: patch.weekly_class_limit,
        default_monthly_fee: patch.default_monthly_fee,
        updated_at: new Date().toISOString(),
      })
      .eq('id', true);
    if (error) throw error;
    return;
  }
  writeLS(LS_SETTINGS, patch);
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
