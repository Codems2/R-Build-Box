import { useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarDays, Loader2, Lock, Settings2, Users, Wallet } from 'lucide-react';
import AdminSchedule from '../components/admin/AdminSchedule';
import ClassTypeManager from '../components/admin/ClassTypeManager';
import FinanceManager from '../components/admin/FinanceManager';
import MembersManager from '../components/admin/MembersManager';
import PlansManager from '../components/admin/PlansManager';
import SettingsManager from '../components/admin/SettingsManager';
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
      <div className="mb-5">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
          Panel de administración
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Configura clases, horarios y gestiona a los socios del box.
          {demoMode && <span className="ml-1 text-accent-400">Modo demo: cambios locales.</span>}
        </p>
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
