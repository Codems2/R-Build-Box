import { useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Eye,
  EyeOff,
  Info,
  Loader2,
  LogOut,
  Pencil,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';
import SlotForm from '../components/admin/SlotForm';
import BookingsModal from '../components/admin/BookingsModal';
import ClassTypeManager from '../components/admin/ClassTypeManager';
import { useAuth } from '../lib/auth';
import { useSchedule } from '../hooks/useSchedule';
import { createSlot, deleteSlot, updateSlot } from '../lib/api';
import {
  DAY_NAMES,
  DAY_NAMES_SHORT,
  KIND_META,
  endTime,
  formatTime,
  slotColor,
  slotTitle,
  type ScheduleSlot,
  type SlotInput,
} from '../lib/types';

export default function AdminPage() {
  const { isAdmin, loading } = useAuth();

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      {loading ? (
        <div className="flex items-center justify-center py-24 text-zinc-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : isAdmin ? (
        <Dashboard />
      ) : (
        <LoginForm />
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------

function LoginForm() {
  const { signIn, demoMode } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const err = await signIn(email, password);
    if (err) setError(err);
    setSubmitting(false);
  }

  return (
    <div className="mx-auto max-w-sm pt-16 sm:pt-24">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="card p-6"
      >
        <h1 className="font-display text-xl font-bold text-white">Zona de administración</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Accede para configurar los horarios del box.
        </p>

        {demoMode && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-accent-500/20 bg-accent-500/10 p-3 text-xs leading-relaxed text-accent-300">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <strong>Modo demo</strong> (Supabase sin configurar): entra con cualquier email y la
              contraseña <code className="rounded bg-black/30 px-1">demo</code>. Los cambios se
              guardan solo en este navegador.
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <input
            type="email"
            required
            autoComplete="email"
            className="input"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="current-password"
              className="input pr-11"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 transition hover:text-zinc-300"
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {error && <p className="text-sm text-brand-300">{error}</p>}
          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Dashboard() {
  const { signOut, demoMode } = useAuth();
  const { slots, classTypes, loading, reload } = useSchedule(true);
  const [day, setDay] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduleSlot | null>(null);
  const [viewingBookings, setViewingBookings] = useState<ScheduleSlot | null>(null);

  const daySlots = slots.filter((s) => s.day_of_week === day);

  async function handleSave(input: SlotInput, id?: string) {
    if (id) await updateSlot(id, input);
    else await createSlot(input);
    await reload();
  }

  async function handleDelete(slot: ScheduleSlot) {
    if (
      !window.confirm(
        `¿Eliminar «${slotTitle(slot, classTypes)}» del ${DAY_NAMES[slot.day_of_week]} a las ${formatTime(slot.start_time)}?`,
      )
    )
      return;
    await deleteSlot(slot.id);
    await reload();
  }

  async function toggleActive(slot: ScheduleSlot) {
    const { id, ...rest } = slot;
    await updateSlot(id, { ...rest, is_active: !slot.is_active });
    await reload();
  }

  return (
    <div className="pt-8 sm:pt-12">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
            Panel de administración
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Configura clases, horas de inicio, duraciones y huecos especiales.
            {demoMode && (
              <span className="ml-1 text-accent-400">Modo demo: cambios locales.</span>
            )}
          </p>
        </div>
        <button onClick={() => void signOut()} className="btn-ghost text-xs">
          <LogOut className="h-4 w-4" /> Salir
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-zinc-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className="space-y-10">
          <section>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-display text-lg font-bold text-white">Horario semanal</h2>
              <button
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
                className="btn-primary !px-3.5 !py-2 text-xs"
              >
                <Plus className="h-4 w-4" /> Añadir hueco
              </button>
            </div>

            <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
              {DAY_NAMES_SHORT.map((name, i) => {
                const active = day === i;
                const count = slots.filter((s) => s.day_of_week === i).length;
                return (
                  <button
                    key={name}
                    onClick={() => setDay(i)}
                    className={`relative shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition ${
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
                    <span className="relative z-10">
                      {name}
                      {count > 0 && (
                        <span className={`ml-1.5 text-[10px] ${active ? 'text-white/70' : 'text-zinc-500'}`}>
                          {count}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            <AnimatePresence mode="popLayout">
              <motion.div
                key={day}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-2.5"
              >
                {daySlots.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-zinc-500">
                    No hay huecos el {DAY_NAMES[day]}. Pulsa «Añadir hueco» para crear uno.
                  </p>
                ) : (
                  daySlots.map((slot) => {
                    const color = slotColor(slot, classTypes);
                    const kind = KIND_META[slot.kind];
                    return (
                      <motion.div
                        key={slot.id}
                        layout
                        className={`card flex items-center gap-3 p-3.5 ${
                          slot.is_active ? '' : 'opacity-50'
                        }`}
                      >
                        <span
                          className="h-10 w-1 shrink-0 rounded-full"
                          style={{ backgroundColor: color }}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-white">
                              {slotTitle(slot, classTypes)}
                            </p>
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${kind.badgeClass}`}
                            >
                              {kind.label}
                            </span>
                            {!slot.is_active && (
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                                Oculto
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-zinc-400">
                            {formatTime(slot.start_time)} – {endTime(slot.start_time, slot.duration_min)}
                            <span className="text-zinc-600"> · {slot.duration_min} min</span>
                            {slot.capacity != null && (
                              <span className="text-zinc-600">
                                {' '}· {slot.capacity === 1 ? 'individual' : `${slot.capacity} plazas`}
                              </span>
                            )}
                          </p>
                        </div>
                        <button
                          onClick={() => setViewingBookings(slot)}
                          className="btn-icon"
                          aria-label="Ver apuntados"
                          title="Ver apuntados"
                        >
                          <Users className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => void toggleActive(slot)}
                          className="btn-icon"
                          aria-label={slot.is_active ? 'Ocultar del horario' : 'Mostrar en el horario'}
                          title={slot.is_active ? 'Ocultar del horario' : 'Mostrar en el horario'}
                        >
                          {slot.is_active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                        </button>
                        <button
                          onClick={() => {
                            setEditing(slot);
                            setFormOpen(true);
                          }}
                          className="btn-icon"
                          aria-label="Editar hueco"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => void handleDelete(slot)}
                          className="btn-icon hover:!text-brand-300"
                          aria-label="Eliminar hueco"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </motion.div>
                    );
                  })
                )}
              </motion.div>
            </AnimatePresence>
          </section>

          <ClassTypeManager classTypes={classTypes} onChanged={reload} />
        </div>
      )}

      <SlotForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSave={handleSave}
        classTypes={classTypes}
        editing={editing}
        defaultDay={day}
      />

      <BookingsModal
        open={viewingBookings !== null}
        onClose={() => setViewingBookings(null)}
        slot={viewingBookings}
        classTypes={classTypes}
      />
    </div>
  );
}
