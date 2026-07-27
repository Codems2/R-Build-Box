import type { ClassType, ScheduleSlot } from './types';

export const DEMO_CLASS_TYPES: ClassType[] = [
  {
    id: 'ct-iniciacion',
    name: 'Muay Thai · Iniciación',
    description: 'Fundamentos, técnica básica y acondicionamiento.',
    color: '#EE7794',
  },
  {
    id: 'ct-adultos',
    name: 'Muay Thai · Adultos',
    description: 'Clase general para todos los niveles.',
    color: '#D92B53',
  },
  {
    id: 'ct-avanzado',
    name: 'Avanzado · Competición',
    description: 'Trabajo técnico-táctico orientado a competición.',
    color: '#9E1838',
  },
  {
    id: 'ct-sparring',
    name: 'Sparring',
    description: 'Sparring controlado. Obligatorio equipo completo.',
    color: '#F59E0B',
  },
  {
    id: 'ct-personal',
    name: 'Entrenamiento personal',
    description: 'Sesión individual con entrenador. Reserva previa.',
    color: '#2DD4BF',
  },
];

let n = 0;
const id = () => `slot-${++n}`;
const slot = (
  day: number,
  start: string,
  duration: number,
  typeId: string | null,
  kind: ScheduleSlot['kind'] = 'regular',
  extra: Partial<ScheduleSlot> = {},
): ScheduleSlot => ({
  id: id(),
  class_type_id: typeId,
  title: null,
  day_of_week: day,
  start_time: start,
  duration_min: duration,
  capacity: kind === 'personal' ? 1 : 16,
  kind,
  note: null,
  is_active: true,
  is_recurring: true,
  class_date: null,
  ...extra,
});

export const DEMO_SLOTS: ScheduleSlot[] = [
  // Mañanas
  slot(0, '10:00', 60, 'ct-adultos'),
  slot(2, '10:00', 60, 'ct-adultos'),
  slot(4, '10:00', 60, 'ct-adultos'),
  // Huecos personales al mediodía
  slot(1, '12:00', 45, 'ct-personal', 'personal', {
    note: 'Reserva por WhatsApp',
  }),
  slot(3, '12:00', 45, 'ct-personal', 'personal', {
    note: 'Reserva por WhatsApp',
  }),
  // Tarde
  slot(0, '18:00', 60, 'ct-iniciacion'),
  slot(1, '18:00', 60, 'ct-iniciacion'),
  slot(2, '18:00', 60, 'ct-iniciacion'),
  slot(3, '18:00', 60, 'ct-iniciacion'),
  slot(0, '19:15', 75, 'ct-adultos'),
  slot(1, '19:15', 75, 'ct-adultos'),
  slot(2, '19:15', 75, 'ct-adultos'),
  slot(3, '19:15', 75, 'ct-adultos'),
  slot(4, '19:15', 75, 'ct-avanzado'),
  slot(2, '20:45', 60, 'ct-sparring'),
  slot(4, '20:45', 60, 'ct-sparring'),
  // Baja ocupación
  slot(4, '16:30', 60, null, 'low', {
    title: 'Sala libre · Trabajo al saco',
    capacity: 6,
    note: 'Grupo reducido, ideal para pulir técnica',
  }),
  // Sábado
  slot(5, '11:00', 90, 'ct-avanzado'),
  slot(5, '12:45', 45, 'ct-personal', 'personal'),
];
