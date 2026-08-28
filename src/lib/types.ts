export type SlotKind = 'regular' | 'personal' | 'low';

export interface ClassType {
  id: string;
  name: string;
  description: string | null;
  color: string;
}

export interface ScheduleSlot {
  id: string;
  class_type_id: string | null;
  /** Título libre cuando el hueco no pertenece a un tipo de clase */
  title: string | null;
  /** 0 = Lunes … 6 = Domingo */
  day_of_week: number;
  /** Formato HH:MM (24h) */
  start_time: string;
  duration_min: number;
  capacity: number | null;
  kind: SlotKind;
  note: string | null;
  is_active: boolean;
  /** Se repite cada semana (true) o es una clase puntual (false) */
  is_recurring: boolean;
  /** Fecha de la clase: puntual = ese día; recurrente = fecha de inicio */
  class_date: string | null;
}

/** Una sesión concreta de un hueco en una fecha (lo que se muestra y reserva) */
export interface Session {
  slot: ScheduleSlot;
  date: string; // ISO YYYY-MM-DD
}

export type SlotInput = Omit<ScheduleSlot, 'id'>;
export type ClassTypeInput = Omit<ClassType, 'id'>;

/** Ajustes globales configurables por el admin */
export interface AppSettings {
  /** Máximo de clases que un socio puede reservar por semana */
  weekly_class_limit: number;
  /** Cuota mensual estándar (€) para socios sin plan */
  default_monthly_fee: number;
  /** Clases de cortesía tras vencer el mes (0 = sin cortesía) */
  courtesy_classes: number;
  /** URL del logo personalizado (null = logo por defecto) */
  logo_url: string | null;
}

/** Plan de mensualidad (tarifa configurable por el admin) */
export interface Plan {
  id: string;
  name: string;
  monthly_price: number;
  description: string | null;
}

export type PlanInput = Omit<Plan, 'id'>;

/** Cuota mensual que aporta un socio activo (cálculo automático) */
export interface MemberIncomeRow {
  member_id: string;
  member_name: string;
  plan_name: string;
  amount: number;
}

/** Estado semanal de reservas del socio (clases usadas / límite) */
export interface WeekStatus {
  used: number;
  limit: number;
  /** Los admins no tienen límite */
  unlimited: boolean;
}

export type FinanceKind = 'income' | 'expense';

/** Apunte de ingresos/gastos del box (solo admin) */
export interface FinanceEntry {
  id: string;
  kind: FinanceKind;
  concept: string;
  amount: number;
  /** Fecha del movimiento (YYYY-MM-DD) */
  entry_date: string;
  /** Factura adjunta (ruta en Storage), solo gastos */
  invoice_path: string | null;
  created_at?: string;
}

export type FinanceEntryInput = Omit<FinanceEntry, 'id' | 'created_at'>;

export interface Member {
  id: string;
  member_no: number;
  role: 'user' | 'admin';
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  activated: boolean;
  membership_active: boolean;
  plan_id: string | null;
  plan_name: string | null;
  /** Fecha hasta la que tiene pagada la mensualidad (YYYY-MM-DD) */
  paid_until: string | null;
  /** Clases de cortesía ya usadas (reservas con fecha posterior a paid_until) */
  courtesy_used?: number;
  /** Deuda de clases arrastrada al periodo pagado */
  class_debt?: number;
  created_at?: string;
}

/** Reserva propia del socio (para marcar y cancelar en el calendario) */
export interface MyBookingRow {
  id: string;
  slot_id: string;
  class_date: string;
}

export interface MemberInput {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
}

export function memberFullName(m: {
  first_name: string | null;
  last_name: string | null;
  email?: string | null;
}): string {
  const name = [m.first_name, m.last_name].filter(Boolean).join(' ').trim();
  return name || m.email || 'Socio';
}

export interface Booking {
  id: string;
  slot_id: string;
  /** Fecha concreta de la sesión (YYYY-MM-DD) */
  class_date: string;
  name: string;
  contact: string | null;
  created_at?: string;
}

/** Clave de ocupación por sesión: `${slot_id}|${class_date}` */
export type BookingCounts = Record<string, number>;

export const countKey = (slotId: string, classDate: string) => `${slotId}|${classDate}`;

export const DAY_NAMES = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
];

export const DAY_NAMES_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export const KIND_META: Record<
  SlotKind,
  { label: string; badgeClass: string; dotClass: string }
> = {
  regular: {
    label: 'Clase',
    badgeClass: 'bg-brand-500/15 text-brand-300 ring-brand-500/30',
    dotClass: 'bg-brand-400',
  },
  personal: {
    label: 'Personal',
    badgeClass: 'bg-accent-500/15 text-accent-300 ring-accent-500/30',
    dotClass: 'bg-accent-400',
  },
  low: {
    label: 'Baja ocupación',
    badgeClass: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
    dotClass: 'bg-amber-400',
  },
};

export function slotTitle(slot: ScheduleSlot, classTypes: ClassType[]): string {
  if (slot.title) return slot.title;
  const type = classTypes.find((t) => t.id === slot.class_type_id);
  return type ? type.name : 'Clase';
}

export function slotColor(slot: ScheduleSlot, classTypes: ClassType[]): string {
  const type = classTypes.find((t) => t.id === slot.class_type_id);
  if (type) return type.color;
  if (slot.kind === 'personal') return '#2DD4BF';
  if (slot.kind === 'low') return '#F59E0B';
  return '#D92B53';
}

export function endTime(start: string, durationMin: number): string {
  const [h, m] = start.split(':').map(Number);
  const total = h * 60 + m + durationMin;
  const eh = Math.floor(total / 60) % 24;
  const em = total % 60;
  return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
}

export function formatTime(t: string): string {
  return t.slice(0, 5);
}

export function sortSlots(slots: ScheduleSlot[]): ScheduleSlot[] {
  return [...slots].sort(
    (a, b) =>
      a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time),
  );
}
