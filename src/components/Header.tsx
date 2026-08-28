import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CalendarCheck, Gift, LogOut, ShieldCheck } from 'lucide-react';
import Logo from './Logo';
import { useAuth } from '../lib/auth';
import { todayISO } from '../lib/dates';
import { memberFullName } from '../lib/types';

export default function Header() {
  const { pathname } = useLocation();
  const { isAdmin, profile, weekStatus, signOut } = useAuth();

  const firstName = profile?.first_name || memberFullName(profile ?? { first_name: null, last_name: null });
  const showWeek = Boolean(profile && weekStatus && (isAdmin || profile.membership_active));
  // En cortesía (mes vencido, socio aún activo) el contador muestra las clases
  // de cortesía usadas/máximo en ámbar, en vez del cupo semanal.
  const courtesyLimit = weekStatus?.courtesy_limit ?? 0;
  const pastDue = Boolean(profile?.paid_until && todayISO() > profile.paid_until);
  const courtesyMode =
    !isAdmin && Boolean(profile?.membership_active) && pastDue && courtesyLimit > 0;

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-ink-950/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="group flex items-center" aria-label="Inicio">
          <motion.div
            initial={{ rotate: -8, scale: 0.9, opacity: 0 }}
            animate={{ rotate: 0, scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            whileHover={{ scale: 1.06 }}
          >
            <Logo className="h-12 w-12" />
          </motion.div>
        </Link>

        <div className="flex items-center gap-2">
          {isAdmin && !pathname.startsWith('/admin') && (
            <Link
              to="/admin"
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/[0.07] hover:text-white"
            >
              <ShieldCheck className="h-4 w-4" />
              <span className="hidden sm:inline">Panel admin</span>
              <span className="h-1.5 w-1.5 rounded-full bg-accent-400" />
            </Link>
          )}
          {isAdmin && pathname.startsWith('/admin') && (
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/[0.07] hover:text-white"
            >
              Horarios
            </Link>
          )}
          {showWeek && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold ${
                courtesyMode
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                  : 'border-accent-500/25 bg-accent-500/10 text-accent-300'
              }`}
              title={
                weekStatus!.unlimited
                  ? 'Reservas ilimitadas'
                  : courtesyMode
                    ? 'Clases de cortesía usadas (tu mes ha vencido)'
                    : 'Clases reservadas esta semana'
              }
            >
              {courtesyMode ? <Gift className="h-4 w-4" /> : <CalendarCheck className="h-4 w-4" />}
              {weekStatus!.unlimited ? (
                '∞'
              ) : courtesyMode ? (
                <>
                  {weekStatus!.courtesy_used ?? 0}
                  <span className="text-xs font-medium text-amber-400/70">/{courtesyLimit}</span>
                </>
              ) : (
                <>
                  {weekStatus!.used}
                  <span className="text-xs font-medium text-accent-400/70">/{weekStatus!.limit}</span>
                </>
              )}
            </span>
          )}
          <span className="hidden text-sm text-zinc-400 sm:inline">
            Hola, <span className="font-medium text-zinc-200">{firstName}</span>
          </span>
          <button
            onClick={() => void signOut()}
            className="btn-icon"
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
