import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Info, Loader2, LogIn } from 'lucide-react';
import Logo from '../components/Logo';
import { useAuth } from '../lib/auth';

export default function LoginPage() {
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
    if (err) {
      setError(err);
      setSubmitting(false);
    }
    // Si el login es correcto, el auth gate desmonta esta página.
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10">
      {/* Fondos de marca */}
      <div
        className="pointer-events-none absolute -top-40 right-[-10%] h-[30rem] w-[30rem] rounded-full bg-brand-600/20 blur-[120px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-40 left-[-10%] h-[26rem] w-[26rem] rounded-full bg-brand-500/10 blur-[120px]"
        aria-hidden
      />

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-sm"
      >
        <div className="mb-8 flex flex-col items-center text-center">
          <motion.div
            initial={{ rotate: -8, scale: 0.85, opacity: 0 }}
            animate={{ rotate: 0, scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
          >
            <Logo className="h-20 w-20" />
          </motion.div>
          <p lang="th" className="thai-shimmer mt-4 font-thai text-2xl font-semibold leading-tight">
            หัวใจนักสู้
          </p>
          <p className="mt-1 text-xs tracking-wide text-zinc-500">Corazón de luchador</p>
        </div>

        <div className="card p-6">
          <h1 className="font-display text-xl font-bold text-white">Acceso de socios</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Inicia sesión para ver los horarios y reservar tu plaza.
          </p>

          {demoMode && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-accent-500/20 bg-accent-500/10 p-3 text-xs leading-relaxed text-accent-300">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <strong>Modo demo</strong>: entra con cualquier email y la contraseña{' '}
                <code className="rounded bg-black/30 px-1">demo</code> (admin) o{' '}
                <code className="rounded bg-black/30 px-1">socio</code>.
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
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <LogIn className="h-4 w-4" /> Entrar
                </>
              )}
            </button>
          </form>

          <p className="mt-4 text-center text-[11px] leading-relaxed text-zinc-600">
            ¿Aún no tienes cuenta? El box te dará de alta y recibirás un email para crear tu
            contraseña.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
