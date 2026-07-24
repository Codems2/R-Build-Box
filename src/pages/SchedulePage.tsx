import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarX2, Loader2 } from 'lucide-react';
import SlotCard from '../components/SlotCard';
import BookingModal from '../components/BookingModal';
import { useSchedule } from '../hooks/useSchedule';
import { fetchBookingCounts } from '../lib/api';
import { nextOccurrenceISO } from '../lib/dates';
import { getMyBooking } from '../lib/myBookings';
import {
  DAY_NAMES,
  DAY_NAMES_SHORT,
  KIND_META,
  countKey,
  type BookingCounts,
  type ScheduleSlot,
  type SlotKind,
} from '../lib/types';

/** Índice de día con 0 = Lunes */
function todayIndex(): number {
  return (new Date().getDay() + 6) % 7;
}

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.055 } },
};
const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
};

export default function SchedulePage() {
  const { slots, classTypes, loading, error } = useSchedule();
  const [day, setDay] = useState(todayIndex());
  const [counts, setCounts] = useState<BookingCounts>({});
  const [selected, setSelected] = useState<{ slot: ScheduleSlot; date: string } | null>(null);
  // Fuerza el recálculo de «mis reservas» tras reservar o cancelar
  const [, setTick] = useState(0);

  const loadCounts = useCallback(() => {
    fetchBookingCounts()
      .then(setCounts)
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  const handleBookingChanged = useCallback(() => {
    loadCounts();
    setTick((t) => t + 1);
  }, [loadCounts]);

  const byDay = useMemo(() => {
    const map: ScheduleSlot[][] = Array.from({ length: 7 }, () => []);
    for (const s of slots) map[s.day_of_week]?.push(s);
    return map;
  }, [slots]);

  const kindsInUse = useMemo(() => {
    const set = new Set<SlotKind>(slots.map((s) => s.kind));
    return (Object.keys(KIND_META) as SlotKind[]).filter((k) => set.has(k));
  }, [slots]);

  function cardProps(slot: ScheduleSlot) {
    const date = nextOccurrenceISO(slot.day_of_week, slot.start_time);
    return {
      count: counts[countKey(slot.id, date)] ?? 0,
      booked: Boolean(getMyBooking(slot.id, date)),
      onClick: () => setSelected({ slot, date }),
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
      <section className="pb-8 pt-10 sm:pb-10 sm:pt-14">
        <motion.h1
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          lang="th"
          className="thai-shimmer font-thai text-3xl font-semibold leading-tight sm:text-5xl"
        >
          หัวใจนักสู้ · ศิลปะแห่งอาวุธทั้งแปด
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.45 }}
          className="mt-2.5 text-xs tracking-wide text-zinc-500 sm:text-sm"
        >
          Corazón de luchador · el arte de las ocho armas
        </motion.p>
        {kindsInUse.length > 1 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-400"
          >
            {kindsInUse.map((k) => (
              <span key={k} className="inline-flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${KIND_META[k].dotClass}`} />
                {KIND_META[k].label}
              </span>
            ))}
          </motion.div>
        )}
      </section>

      {error && (
        <div className="card border-brand-500/30 p-4 text-sm text-brand-200">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24 text-zinc-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <>
          {/* Vista móvil / tablet: selector de día + lista */}
          <div className="lg:hidden">
            <div
              className="sticky top-16 z-30 -mx-4 mb-4 flex gap-1.5 overflow-x-auto bg-ink-950/85 px-4 py-3 backdrop-blur-xl [scrollbar-width:none]"
              role="tablist"
              aria-label="Día de la semana"
            >
              {DAY_NAMES_SHORT.map((name, i) => {
                const active = day === i;
                const count = byDay[i].length;
                return (
                  <button
                    key={name}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setDay(i)}
                    className={`relative flex shrink-0 flex-col items-center rounded-2xl px-4 py-2 text-sm font-semibold transition ${
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
                    <span className="relative z-10">{name}</span>
                    <span
                      className={`relative z-10 text-[10px] font-medium ${
                        active ? 'text-white/80' : 'text-zinc-500'
                      }`}
                    >
                      {count === 0 ? '—' : `${count} ${count === 1 ? 'clase' : 'clases'}`}
                    </span>
                  </button>
                );
              })}
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={day}
                variants={container}
                initial="hidden"
                animate="show"
                exit={{ opacity: 0, transition: { duration: 0.12 } }}
                className="space-y-3"
              >
                {byDay[day].length === 0 ? (
                  <EmptyDay dayName={DAY_NAMES[day]} />
                ) : (
                  byDay[day].map((slot) => (
                    <motion.div key={slot.id} variants={item}>
                      <SlotCard slot={slot} classTypes={classTypes} {...cardProps(slot)} />
                    </motion.div>
                  ))
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Vista escritorio: semana completa */}
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="hidden grid-cols-7 gap-3 lg:grid"
          >
            {DAY_NAMES.map((name, i) => {
              const isToday = todayIndex() === i;
              return (
                <motion.div key={name} variants={item} className="min-w-0">
                  <div
                    className={`mb-3 flex items-baseline justify-between rounded-xl px-3 py-2 ${
                      isToday
                        ? 'bg-brand-600/15 ring-1 ring-brand-500/30'
                        : 'bg-white/[0.03]'
                    }`}
                  >
                    <span
                      className={`font-display text-sm font-bold ${
                        isToday ? 'text-brand-300' : 'text-zinc-200'
                      }`}
                    >
                      {name}
                    </span>
                    {isToday && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-brand-400">
                        Hoy
                      </span>
                    )}
                  </div>
                  <div className="space-y-2.5">
                    {byDay[i].length === 0 ? (
                      <p className="rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-xs text-zinc-600">
                        Sin clases
                      </p>
                    ) : (
                      byDay[i].map((slot) => (
                        <SlotCard
                          key={slot.id}
                          slot={slot}
                          classTypes={classTypes}
                          compact
                          {...cardProps(slot)}
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
        onChanged={handleBookingChanged}
      />
    </motion.div>
  );
}

function EmptyDay({ dayName }: { dayName: string }) {
  return (
    <motion.div
      variants={item}
      className="card flex flex-col items-center gap-3 px-6 py-14 text-center"
    >
      <CalendarX2 className="h-8 w-8 text-zinc-600" />
      <p className="text-sm text-zinc-400">
        No hay clases programadas el <span className="font-semibold text-zinc-200">{dayName}</span>.
      </p>
      <p className="text-xs text-zinc-500">Día de descanso — el cuerpo también entrena recuperando.</p>
    </motion.div>
  );
}
