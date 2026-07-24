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
}

export type SlotInput = Omit<ScheduleSlot, 'id'>;
export type ClassTypeInput = Omit<ClassType, 'id'>;

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
