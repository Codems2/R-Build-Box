import { Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import Header from './components/Header';
import SchedulePage from './pages/SchedulePage';
import AdminPage from './pages/AdminPage';

export default function App() {
  const location = useLocation();
  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 sm:px-6">
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<SchedulePage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="*" element={<SchedulePage />} />
          </Routes>
        </AnimatePresence>
      </main>
      <footer className="border-t border-white/5 py-6 text-center text-xs text-zinc-500">
        © {new Date().getFullYear()} Red Monkey · Muay Thai Box
      </footer>
    </div>
  );
}
