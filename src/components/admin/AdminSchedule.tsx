import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Repeat,
  Trash2,
  Users,
} from 'lucide-react';
import SlotForm from './SlotForm';
import BookingsModal from './BookingsModal';
import { useSchedule } from '../../hooks/useSchedule';
import { createSlot, deleteSlot, updateSlot } from '../../lib/api';
import { sessionsForWeek } from '../../lib/schedule';
import {
  formatDayShort,
  formatWeekRange,
  mondayOfWeekISO,
  shiftISO,
  todayISO,
  weekDatesISO,
} from '../../lib/dates';
import {
  KIND_META,
  endTime,
  formatTime,
  slotColor,
  slotTitle,
  type ScheduleSlot,
  type Session,
  type SlotInput,
} from '../../lib/types';

export default function AdminSchedule() {
  const { slots, classTypes, reload } = useSchedule(true);
  const [weekMonday, setWeekMonday] = useState(() => mondayOfWeekISO(todayISO()));
  const weekDates = useMemo(() => weekDatesISO(weekMonday), [weekMonday]);
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduleSlot | null>(null);
  const [formDate, setFormDate] = useState(todayISO());
  const [viewingBookings, setViewingBookings] = useState<ScheduleSlot | null>(null);

  useEffect(() => {
    const t = todayISO();
    setSelectedDate(t >= weekMonday && t <= shiftISO(weekMonday, 6) ? t : weekMonday);
  }, [weekMonday]);

  const byDate = useMemo(() => {
    const map: Record<string, Session[]> = {};
    for (const d of weekDates) map[d] = [];
    for (const s of sessionsForWeek(slots, weekMonday)) map[s.date]?.push(s);
    for (const d of weekDates) map[d].sort((a, b) => a.slot.start_time.localeCompare(b.slot.start_time));
    return map;
  }, [slots, weekMonday, weekDates]);

  function openNew(date: string) {
    setEditing(null);
    setFormDate(date);
    setFormOpen(true);
  }
  function openEdit(slot: ScheduleSlot) {
    setEditing(slot);
    setFormDate(slot.class_date ?? selectedDate);
    setFormOpen(true);
  }

  async function handleSave(input: SlotInput, id?: string) {
    if (id) await updateSlot(id, input);
    else await createSlot(input);
    await reload();
  }
  async function handleDelete(slot: ScheduleSlot) {
    const msg = slot.is_recurring
      ? `¿Eliminar «${slotTitle(slot, classTypes)}»? Es una clase recurrente: se quitará de TODAS las semanas.`
      : `¿Eliminar «${slotTitle(slot, classTypes)}» del ${slot.class_date}?`;
    if (!window.confirm(msg)) return;
    await deleteSlot(slot.id);
    await reload();
  }
  async function toggleActive(slot: ScheduleSlot) {
    const { id, ...rest } = slot;
    await updateSlot(id, { ...rest, is_active: !slot.is_active });
    await reload();
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-white">Horario</h2>
        <button onClick={() => openNew(selectedDate)} className="btn-primary !px-3.5 !py-2 text-xs">
          <Plus className="h-4 w-4" /> Añadir clase
        </button>
      </div>

      {/* Selector de semana */}
      <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-2">
        <button
          onClick={() => setWeekMonday(shiftISO(weekMonday, -7))}
          className="btn-icon"
          aria-label="Semana anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="font-display text-sm font-bold capitalize text-white">
          {formatWeekRange(weekMonday)}
        </p>
        <button
          onClick={() => setWeekMonday(shiftISO(weekMonday, 7))}
          className="btn-icon"
          aria-label="Semana siguiente"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Selector de día */}
      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
        {weekDates.map((d) => {
          const active = selectedDate === d;
          const isToday = d === todayISO();
          const { name, num } = formatDayShort(d);
          const n = byDate[d].length;
          return (
            <button
              key={d}
              onClick={() => setSelectedDate(d)}
              className={`relative flex shrink-0 flex-col items-center rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
                active ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="admin-day-pill"
                  className="absolute inset-0 rounded-xl bg-brand-600 shadow-glow"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                />
              )}
              <span className="relative z-10 capitalize">{name}</span>
              <span className={`relative z-10 text-xs ${active ? 'text-white' : isToday ? 'text-brand-300' : 'text-zinc-500'}`}>
                {num}
              </span>
              <span className={`relative z-10 text-[9px] ${active ? 'text-white/70' : 'text-zinc-600'}`}>
                {n === 0 ? '—' : n}
              </span>
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="popLayout">
        <motion.div
          key={selectedDate}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="space-y-2.5"
        >
          {byDate[selectedDate].length === 0 ? (
            <button
              onClick={() => openNew(selectedDate)}
              className="w-full rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-zinc-500 transition hover:border-white/20 hover:text-zinc-300"
            >
              Sin clases este día. Pulsa para añadir una.
            </button>
          ) : (
            byDate[selectedDate].map(({ slot }) => {
              const color = slotColor(slot, classTypes);
              const kind = KIND_META[slot.kind];
              const actions = (
                <>
                  <button onClick={() => setViewingBookings(slot)} className="btn-icon" aria-label="Ver apuntados" title="Ver apuntados">
                    <Users className="h-4 w-4" />
                  </button>
                  <button onClick={() => void toggleActive(slot)} className="btn-icon" aria-label={slot.is_active ? 'Ocultar' : 'Mostrar'} title={slot.is_active ? 'Ocultar' : 'Mostrar'}>
                    {slot.is_active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                  <button onClick={() => openEdit(slot)} className="btn-icon" aria-label="Editar">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => void handleDelete(slot)} className="btn-icon hover:!text-brand-300" aria-label="Eliminar">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              );
              return (
                <motion.div
                  key={slot.id}
                  layout
                  className={`card relative overflow-hidden p-3.5 ${slot.is_active ? '' : 'opacity-50'}`}
                >
                  <span className="absolute inset-y-0 left-0 w-1 rounded-r-full" style={{ backgroundColor: color }} aria-hidden />
                  <div className="flex items-center gap-3 pl-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="text-sm font-semibold leading-snug text-white">{slotTitle(slot, classTypes)}</p>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${kind.badgeClass}`}>
                          {kind.label}
                        </span>
                        {slot.is_recurring ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-accent-400">
                            <Repeat className="h-3 w-3" /> Semanal
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Puntual</span>
                        )}
                        {!slot.is_active && (
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Oculta</span>
                        )}
                      </div>
                      <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-zinc-400">
                        <span className="whitespace-nowrap">
                          {formatTime(slot.start_time)} – {endTime(slot.start_time, slot.duration_min)}
                        </span>
                        <span className="whitespace-nowrap text-zinc-600">{slot.duration_min} min</span>
                        {slot.capacity != null && (
                          <span className="whitespace-nowrap text-zinc-600">
                            {slot.capacity === 1 ? 'individual' : `${slot.capacity} plazas`}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="hidden items-center gap-1.5 sm:flex">{actions}</div>
                  </div>
                  <div className="mt-3 flex items-center justify-end gap-1.5 border-t border-white/[0.06] pt-2.5 pl-2 sm:hidden">
                    {actions}
                  </div>
                </motion.div>
              );
            })
          )}
        </motion.div>
      </AnimatePresence>

      <SlotForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSave={handleSave}
        classTypes={classTypes}
        editing={editing}
        defaultDate={formDate}
      />
      <BookingsModal
        open={viewingBookings !== null}
        onClose={() => setViewingBookings(null)}
        slot={viewingBookings}
        classTypes={classTypes}
      />
    </section>
  );
}
