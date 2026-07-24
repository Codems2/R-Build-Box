import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CalendarDays, ShieldCheck } from 'lucide-react';
import Logo from './Logo';
import { useAuth } from '../lib/auth';

const NAV = [
  { to: '/', label: 'Horarios', icon: CalendarDays },
  { to: '/admin', label: 'Admin', icon: ShieldCheck },
];

export default function Header() {
  const { pathname } = useLocation();
  const { isAdmin } = useAuth();

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

        <nav className="flex items-center gap-1 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-1">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active =
              to === '/' ? pathname === '/' : pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={`relative flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition ${
                  active ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-xl bg-brand-600 shadow-glow"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  />
                )}
                <Icon className="relative z-10 h-4 w-4" />
                <span className="relative z-10 hidden sm:inline">{label}</span>
                {to === '/admin' && isAdmin && (
                  <span className="relative z-10 h-1.5 w-1.5 rounded-full bg-accent-400" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
