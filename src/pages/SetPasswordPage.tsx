import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react';
import Logo from '../components/Logo';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

type Phase = 'checking' | 'ready' | 'invalid' | 'saving' | 'done';

export default function SetPasswordPage() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Al llegar desde el email, Supabase deja un token en la URL que crea una
  // sesión temporal. Comprobamos que existe para permitir fijar la contraseña.
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setPhase('ready'); // en demo permitimos ver el formulario
      return;
    }
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setPhase(data.session ? 'ready' : 'invalid');
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (active && session) setPhase((p) => (p === 'invalid' ? 'ready' : p));
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.');
    if (password !== confirm) return setError('Las contraseñas no coinciden.');
    setError(null);
    setPhase('saving');
    if (!isSupabaseConfigured || !supabase) {
      setTimeout(() => setPhase('done'), 600);
      return;
    }
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) {
      setError('No se pudo guardar la contraseña. El enlace puede haber caducado.');
      setPhase('ready');
      return;
    }
    setPhase('done');
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10">
      <div
        className="pointer-events-none absolute -top-40 right-[-10%] h-[30rem] w-[30rem] rounded-full bg-brand-600/20 blur-[120px]"
        aria-hidden
      />
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-sm"
      >
        <div className="mb-8 flex justify-center">
          <Logo className="h-16 w-16" />
        </div>

        <div className="card p-6">
          {phase === 'checking' ? (
            <div className="flex items-center justify-center py-8 text-zinc-400">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : phase === 'invalid' ? (
            <div className="space-y-4 text-center">
              <h1 className="font-display text-lg font-bold text-white">Enlace no válido</h1>
              <p className="text-sm text-zinc-400">
                Este enlace ha caducado o ya se usó. Pide al box que te reenvíe la invitación.
              </p>
              <button onClick={() => navigate('/')} className="btn-ghost w-full">
                Ir al inicio
              </button>
            </div>
          ) : phase === 'done' ? (
            <div className="space-y-4 text-center">
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-500/15 ring-2 ring-accent-500/40"
              >
                <Check className="h-7 w-7 text-accent-400" />
              </motion.div>
              <div>
                <h1 className="font-display text-lg font-bold text-white">¡Contraseña creada!</h1>
                <p className="mt-1 text-sm text-zinc-400">Ya puedes acceder a tu cuenta.</p>
              </div>
              <button onClick={() => navigate('/')} className="btn-primary w-full">
                Entrar
              </button>
            </div>
          ) : (
            <>
              <h1 className="font-display text-xl font-bold text-white">Crea tu contraseña</h1>
              <p className="mt-1 text-sm text-zinc-400">
                Elige una contraseña para acceder a tu cuenta de socio.
              </p>
              <form onSubmit={handleSubmit} className="mt-5 space-y-3">
                <div className="relative">
                  <input
                    type={show ? 'text' : 'password'}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="input pr-11"
                    placeholder="Nueva contraseña (mín. 8)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 transition hover:text-zinc-300"
                    aria-label={show ? 'Ocultar' : 'Mostrar'}
                  >
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <input
                  type={show ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  className="input"
                  placeholder="Repite la contraseña"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
                {error && <p className="text-sm text-brand-300">{error}</p>}
                <button type="submit" disabled={phase === 'saving'} className="btn-primary w-full">
                  {phase === 'saving' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <KeyRound className="h-4 w-4" /> Guardar contraseña
                    </>
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
