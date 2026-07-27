import { Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import Header from './components/Header';
import ErrorBoundary from './components/ErrorBoundary';
import SchedulePage from './pages/SchedulePage';
import AdminPage from './pages/AdminPage';
import LoginPage from './pages/LoginPage';
import SetPasswordPage from './pages/SetPasswordPage';
import { useAuth } from './lib/auth';

export default function App() {
  const location = useLocation();
  const { isAuthed, loading } = useAuth();

  // La página para crear contraseña es accesible sin sesión previa
  // (el enlace del email trae su propia sesión temporal).
  if (location.pathname === '/set-password') {
    return <SetPasswordPage />;
  }

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-zinc-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  // Web privada: sin sesión, solo el login.
  if (!isAuthed) {
    return (
      <AnimatePresence mode="wait">
        <LoginPage key="login" />
      </AnimatePresence>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 sm:px-6">
        <ErrorBoundary key={location.pathname}>
          <AnimatePresence mode="wait">
            <Routes location={location} key={location.pathname}>
              <Route path="/" element={<SchedulePage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="*" element={<SchedulePage />} />
            </Routes>
          </AnimatePresence>
        </ErrorBoundary>
      </main>
      <footer className="border-t border-white/5 py-6 text-center text-xs text-zinc-500">
        © {new Date().getFullYear()} · Muay Thai Box
      </footer>
    </div>
  );
}
