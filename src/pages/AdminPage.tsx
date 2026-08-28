import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarClock, CalendarDays, Loader2, Lock, Settings2, TriangleAlert, Users, Wallet } from 'lucide-react';
import AdminSchedule from '../components/admin/AdminSchedule';
import ClassTypeManager from '../components/admin/ClassTypeManager';
import FinanceManager from '../components/admin/FinanceManager';
import MembersManager from '../components/admin/MembersManager';
import PlansManager from '../components/admin/PlansManager';
import SettingsManager from '../components/admin/SettingsManager';
import { fetchMembers } from '../lib/api';
import { daysFromTodayISO, formatDateES } from '../lib/dates';
import { memberFullName, type Member } from '../lib/types';
import { useAuth } from '../lib/auth';
import { useSchedule } from '../hooks/useSchedule';

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
        <NotAuthorized />
      )}
    </motion.div>
  );
}

function NotAuthorized() {
  return (
    <div className="mx-auto max-w-sm pt-20 text-center sm:pt-28">
      <div className="card flex flex-col items-center gap-3 p-8">
        <Lock className="h-8 w-8 text-zinc-600" />
        <h1 className="font-display text-lg font-bold text-white">Acceso restringido</h1>
        <p className="text-sm text-zinc-400">Esta zona es solo para administradores del box.</p>
      </div>
    </div>
  );
}

type TabKey = 'clases' | 'economia' | 'socios' | 'ajustes';

const TABS: { key: TabKey; label: string; icon: typeof CalendarDays }[] = [
  { key: 'clases', label: 'Clases', icon: CalendarDays },
  { key: 'economia', label: 'Economía', icon: Wallet },
  { key: 'socios', label: 'Socios', icon: Users },
  { key: 'ajustes', label: 'Ajustes', icon: Settings2 },
];

function Dashboard() {
  const { demoMode } = useAuth();
  // Los tipos de clase se comparten con el gestor de tipos
  const { classTypes, reload } = useSchedule(true);
  const [tab, setTab] = useState<TabKey>('clases');

  return (
    <div className="pt-8 sm:pt-12">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
            Panel de administración
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Configura clases, horarios y gestiona a los socios del box.
            {demoMode && <span className="ml-1 text-accent-400">Modo demo: cambios locales.</span>}
          </p>
        </div>
        <ExpiringSoonAlert refreshKey={tab} onGoToMembers={() => setTab('socios')} />
      </div>

      {/* Pestañas */}
      <div className="mb-6 flex gap-1 overflow-x-auto rounded-2xl border border-white/5 bg-white/[0.03] p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`relative flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-medium transition sm:text-sm ${
              tab === t.key ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {tab === t.key && (
              <motion.span
                layoutId="admin-tab"
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                className="absolute inset-0 rounded-xl bg-white/[0.07] ring-1 ring-white/10"
              />
            )}
            <t.icon className="relative h-4 w-4" />
            <span className="relative">{t.label}</span>
          </button>
        ))}
      </div>

      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="space-y-10"
      >
        {tab === 'clases' && (
          <>
            <AdminSchedule />
            <ClassTypeManager classTypes={classTypes} onChanged={reload} />
          </>
        )}
        {tab === 'economia' && (
          <>
            <FinanceManager />
            <PlansManager />
          </>
        )}
        {tab === 'socios' && <MembersManager />}
        {tab === 'ajustes' && <SettingsManager />}
      </motion.div>
    </div>
  );
}

/** Aviso de socios cuya mensualidad vence pronto (hoy o mañana). */
function ExpiringSoonAlert({
  refreshKey,
  onGoToMembers,
}: {
  refreshKey: string;
  onGoToMembers: () => void;
}) {
  const [soon, setSoon] = useState<Member[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    fetchMembers()
      .then((all) => {
        if (!active) return;
        const due = all
          .filter((m) => m.role !== 'admin' && m.membership_active && m.paid_until)
          .filter((m) => {
            const d = daysFromTodayISO(m.paid_until!);
            return d >= 0 && d <= 1;
          })
          .sort((a, b) => daysFromTodayISO(a.paid_until!) - daysFromTodayISO(b.paid_until!));
        setSoon(due);
      })
      .catch(() => setSoon([]));
    return () => {
      active = false;
    };
  }, [refreshKey]);

  if (soon.length === 0) return null;

  return (
    <div
      className="relative shrink-0"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-200 transition hover:bg-amber-500/15"
        aria-label="Socios con la mensualidad por vencer"
      >
        <TriangleAlert className="h-4 w-4 text-amber-400" />
        <span>{soon.length}</span>
        <span className="hidden sm:inline">por vencer</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full z-40 mt-2 w-72 rounded-2xl border border-white/10 bg-ink-900/95 p-3 shadow-2xl shadow-black/50 backdrop-blur"
          >
            <p className="mb-2 flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-amber-300">
              <CalendarClock className="h-3.5 w-3.5" /> Mensualidad por vencer
            </p>
            <div className="space-y-1">
              {soon.map((m) => {
                const d = daysFromTodayISO(m.paid_until!);
                return (
                  <button
                    key={m.id}
                    onClick={() => {
                      setOpen(false);
                      onGoToMembers();
                    }}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-white/5"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-zinc-100">
                      {memberFullName(m)}
                    </span>
                    <span
                      className={`shrink-0 text-[11px] font-medium ${d === 0 ? 'text-brand-300' : 'text-amber-300'}`}
                    >
                      {d === 0 ? 'Hoy' : 'Mañana'} · {formatDateES(m.paid_until!)}
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => {
                setOpen(false);
                onGoToMembers();
              }}
              className="mt-2 w-full rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 text-xs font-medium text-zinc-300 transition hover:text-white"
            >
              Ir a Socios
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
