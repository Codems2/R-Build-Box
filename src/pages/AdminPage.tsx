import { motion } from 'framer-motion';
import { Loader2, Lock } from 'lucide-react';
import AdminSchedule from '../components/admin/AdminSchedule';
import ClassTypeManager from '../components/admin/ClassTypeManager';
import FinanceManager from '../components/admin/FinanceManager';
import MembersManager from '../components/admin/MembersManager';
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

function Dashboard() {
  const { demoMode } = useAuth();
  // Los tipos de clase se comparten con el gestor de tipos
  const { classTypes, reload } = useSchedule(true);

  return (
    <div className="pt-8 sm:pt-12">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
          Panel de administración
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Configura clases, horarios y gestiona a los socios del box.
          {demoMode && <span className="ml-1 text-accent-400">Modo demo: cambios locales.</span>}
        </p>
      </div>

      <div className="space-y-10">
        <AdminSchedule />
        <FinanceManager />
        <MembersManager />
        <SettingsManager />
        <ClassTypeManager classTypes={classTypes} onChanged={reload} />
      </div>
    </div>
  );
}
