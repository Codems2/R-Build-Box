import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarX2, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import SlotCard from '../components/SlotCard';
import BookingModal from '../components/BookingModal';
import { useSchedule } from '../hooks/useSchedule';
import { fetchBookingCounts, fetchMyBookings } from '../lib/api';
import {
  BOOKING_WINDOW_DAYS,
  daysFromTodayISO,
  formatDayShort,
  formatWeekRange,
  mondayOfWeekISO,
  shiftISO,
  todayISO,
  weekDatesISO,
} from '../lib/dates';
import { sessionsForWeek } from '../lib/schedule';
import { useAuth } from '../lib/auth';
import {
  KIND_META,
  countKey,
  type BookingCounts,
  type Session,
  type SlotKind,
} from '../lib/types';

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.32, ease: 'easeOut' } },
};

export default function SchedulePage() {
  const { slots, classTypes, loading, error } = useSchedule();
  const { refreshProfile, profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const thisMonday = useMemo(() => mondayOfWeekISO(todayISO()), []);
  const [weekMonday, setWeekMonday] = useState(thisMonday);
  const weekDates = useMemo(() => weekDatesISO(weekMonday), [weekMonday]);

  // En móvil: día seleccionado dentro de la semana (fecha ISO)
  const [selectedDate, setSelectedDate] = useState(() => {
    const t = todayISO();
    return t >= weekMonday && t <= shiftISO(weekMonday, 6) ? t : weekMonday;
  });
  useEffect(() => {
    const t = todayISO();
    setSelectedDate(t >= weekMonday && t <= shiftISO(weekMonday, 6) ? t : weekMonday);
  }, [weekMonday]);

  const [counts, setCounts] = useState<BookingCounts>({});
  const [mine, setMine] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Session | null>(null);

  const loadCounts = useCallback(() => {
    fetchBookingCounts().then(setCounts).catch(() => {});
  }, []);
  const loadMine = useCallback(() => {
    fetchMyBookings()
      .then((rows) => {
        const map: Record<string, string> = {};
        for (const r of rows) map[countKey(r.slot_id, r.class_date)] = r.id;
        setMine(map);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    loadCounts();
    loadMine();
  }, [loadCounts, loadMine]);

  const handleBookingChanged = useCallback(() => {
    loadCounts();
    loadMine();
    void refreshProfile();
  }, [loadCounts, loadMine, refreshProfile]);

  // Sesiones de la semana agrupadas por fecha
  const byDate = useMemo(() => {
    const map: Record<string, Session[]> = {};
    for (const d of weekDates) map[d] = [];
    for (const s of sessionsForWeek(slots, weekMonday)) map[s.date]?.push(s);
    for (const d of weekDates)
      map[d].sort((a, b) => a.slot.start_time.localeCompare(b.slot.start_time));
    return map;
  }, [slots, weekMonday, weekDates]);

  const kindsInUse = useMemo(() => {
    const set = new Set<SlotKind>(slots.map((s) => s.kind));
    return (Object.keys(KIND_META) as SlotKind[]).filter((k) => set.has(k));
  }, [slots]);

  // Día visible: si el seleccionado no cae en la semana actual (p. ej. justo
  // tras cambiar de semana, antes de que el efecto ajuste el estado), usa el
  // lunes. Evita leer byDate[fecha] inexistente y que el render reviente.
  const activeDate = byDate[selectedDate] ? selectedDate : weekDates[0];
  const daySessions = byDate[activeDate] ?? [];

  const canGoBack = weekMonday > thisMonday || isAdmin;

  function cardProps(session: Session) {
    const { slot, date } = session;
    const booked = Boolean(mine[countKey(slot.id, date)]);
    const daysAhead = daysFromTodayISO(date);
    const locked = !isAdmin && !booked && (daysAhead < 0 || daysAhead > BOOKING_WINDOW_DAYS);
    const opensOn = new Date(`${shiftISO(date, -BOOKING_WINDOW_DAYS)}T00:00:00`).toLocaleDateString(
      'es-ES',
      { day: '2-digit', month: '2-digit' },
    );
    return {
      count: counts[countKey(slot.id, date)] ?? 0,
      booked,
      lockLabel: locked
        ? daysAhead < 0
          ? 'Finalizada'
          : `Reserva desde el ${opensOn}`
        : undefined,
      onClick: locked ? undefined : () => setSelected(session),
    };
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      {/* Hero */}
      <section className="pb-6 pt-8 sm:pt-12">
        <motion.h1
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          lang="th"
          className="thai-shimmer font-thai text-2xl font-semibold leading-tight sm:text-4xl"
        >
          หัวใจนักสู้ · ศิลปะแห่งอาวุธทั้งแปด
        </motion.h1>
        <p className="mt-2 text-xs tracking-wide text-zinc-500 sm:text-sm">
          Corazón de luchador · el arte de las ocho armas
        </p>
      </section>

      {/* Selector de semana */}
      <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-2">
        <button
          onClick={() => canGoBack && setWeekMonday(shiftISO(weekMonday, -7))}
          disabled={!canGoBack}
          className="btn-icon disabled:opacity-30"
          aria-label="Semana anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-center">
          <p className="font-display text-sm font-bold capitalize text-white">
            {formatWeekRange(weekMonday)}
          </p>
          {weekMonday !== thisMonday && (
            <button
              onClick={() => setWeekMonday(thisMonday)}
              className="text-[11px] font-medium text-brand-300 hover:text-brand-200"
            >
              Volver a esta semana
            </button>
          )}
          {weekMonday === thisMonday && (
            <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              Esta semana
            </p>
          )}
        </div>
        <button
          onClick={() => setWeekMonday(shiftISO(weekMonday, 7))}
          className="btn-icon"
          aria-label="Semana siguiente"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {kindsInUse.length > 1 && (
        <div className="mb-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-400">
          {kindsInUse.map((k) => (
            <span key={k} className="inline-flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${KIND_META[k].dotClass}`} />
              {KIND_META[k].label}
            </span>
          ))}
        </div>
      )}

      {error && <div className="card border-brand-500/30 p-4 text-sm text-brand-200">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-24 text-zinc-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <>
          {/* Móvil / tablet: selector de día + lista */}
          <div className="lg:hidden">
            <div
              className="sticky top-16 z-30 -mx-4 mb-4 flex gap-1.5 overflow-x-auto bg-ink-950/85 px-4 py-3 backdrop-blur-xl [scrollbar-width:none]"
              role="tablist"
              aria-label="Día de la semana"
            >
              {weekDates.map((d) => {
                const active = activeDate === d;
                const isToday = d === todayISO();
                const { name, num } = formatDayShort(d);
                const n = (byDate[d] ?? []).length;
                return (
                  <button
                    key={d}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSelectedDate(d)}
                    className={`relative flex shrink-0 flex-col items-center rounded-2xl px-3.5 py-2 text-sm font-semibold transition ${
                      active ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="day-pill"
                        className="absolute inset-0 rounded-2xl bg-brand-600 shadow-glow"
                        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                      />
                    )}
                    <span className="relative z-10 capitalize">{name}</span>
                    <span
                      className={`relative z-10 text-xs ${
                        active ? 'text-white' : isToday ? 'text-brand-300' : 'text-zinc-500'
                      }`}
                    >
                      {num}
                    </span>
                    <span
                      className={`relative z-10 text-[9px] ${active ? 'text-white/70' : 'text-zinc-600'}`}
                    >
                      {n === 0 ? '—' : n}
                    </span>
                  </button>
                );
              })}
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={activeDate}
                variants={container}
                initial="hidden"
                animate="show"
                exit={{ opacity: 0, transition: { duration: 0.12 } }}
                className="space-y-3"
              >
                {daySessions.length === 0 ? (
                  <EmptyDay />
                ) : (
                  daySessions.map((s) => (
                    <motion.div key={`${s.slot.id}-${s.date}`} variants={item}>
                      <SlotCard slot={s.slot} classTypes={classTypes} {...cardProps(s)} />
                    </motion.div>
                  ))
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Escritorio: semana completa */}
          <motion.div
            key={weekMonday}
            variants={container}
            initial="hidden"
            animate="show"
            className="hidden grid-cols-7 gap-3 lg:grid"
          >
            {weekDates.map((d) => {
              const isToday = d === todayISO();
              const { name, num } = formatDayShort(d);
              return (
                <motion.div key={d} variants={item} className="min-w-0">
                  <div
                    className={`mb-3 flex items-baseline justify-between rounded-xl px-3 py-2 ${
                      isToday ? 'bg-brand-600/15 ring-1 ring-brand-500/30' : 'bg-white/[0.03]'
                    }`}
                  >
                    <span
                      className={`font-display text-sm font-bold capitalize ${
                        isToday ? 'text-brand-300' : 'text-zinc-200'
                      }`}
                    >
                      {name} {num}
                    </span>
                    {isToday && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-brand-400">
                        Hoy
                      </span>
                    )}
                  </div>
                  <div className="space-y-2.5">
                    {byDate[d].length === 0 ? (
                      <p className="rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-xs text-zinc-600">
                        Sin clases
                      </p>
                    ) : (
                      byDate[d].map((s) => (
                        <SlotCard
                          key={`${s.slot.id}-${s.date}`}
                          slot={s.slot}
                          classTypes={classTypes}
                          compact
                          {...cardProps(s)}
                        />
                      ))
                    )}
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </>
      )}

      <BookingModal
        open={selected !== null}
        onClose={() => setSelected(null)}
        slot={selected?.slot ?? null}
        classDate={selected?.date ?? null}
        classTypes={classTypes}
        count={selected ? counts[countKey(selected.slot.id, selected.date)] ?? 0 : 0}
        myBookingId={selected ? mine[countKey(selected.slot.id, selected.date)] ?? null : null}
        onChanged={handleBookingChanged}
      />
    </motion.div>
  );
}

function EmptyDay() {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
      <CalendarX2 className="h-8 w-8 text-zinc-600" />
      <p className="text-sm text-zinc-400">No hay clases este día.</p>
      <p className="text-xs text-zinc-500">Día de descanso — el cuerpo también entrena recuperando.</p>
    </div>
  );
}
