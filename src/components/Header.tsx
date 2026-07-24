import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShieldCheck } from 'lucide-react';
import Logo from './Logo';
import { useAuth } from '../lib/auth';

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

        {/* Acceso al panel solo visible con la sesión de admin iniciada.
            La ruta /admin sigue existiendo, pero se llega escribiendo la URL. */}
        {isAdmin && !pathname.startsWith('/admin') && (
          <Link
            to="/admin"
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/[0.07] hover:text-white"
          >
            <ShieldCheck className="h-4 w-4" />
            Panel admin
            <span className="h-1.5 w-1.5 rounded-full bg-accent-400" />
          </Link>
        )}
      </div>
    </header>
  );
}
