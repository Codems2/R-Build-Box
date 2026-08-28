import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { supabase, isSupabaseConfigured } from './supabase';
import { fetchWeekStatus, fetchLogoUrl } from './api';
import type { WeekStatus } from './types';

export interface Profile {
  member_no: number | null;
  role: 'user' | 'admin';
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  membership_active: boolean;
  /** Fecha hasta la que tiene pagada la mensualidad (YYYY-MM-DD) */
  paid_until?: string | null;
}

interface AuthContextValue {
  isAuthed: boolean;
  isAdmin: boolean;
  profile: Profile | null;
  /** Clases usadas / límite de la semana actual */
  weekStatus: WeekStatus | null;
  /** URL del logo configurado (null = por defecto) */
  logoUrl: string | null;
  loading: boolean;
  demoMode: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<string | null>;
  refreshProfile: () => Promise<void>;
  refreshBranding: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  isAuthed: false,
  isAdmin: false,
  profile: null,
  weekStatus: null,
  logoUrl: null,
  loading: true,
  demoMode: true,
  signIn: async () => 'No inicializado',
  signOut: async () => {},
  resetPassword: async () => null,
  refreshProfile: async () => {},
  refreshBranding: async () => {},
});

const DEMO_KEY = 'rmbox_demo_session';

const DEMO_PROFILES: Record<string, Profile> = {
  admin: {
    member_no: 1,
    role: 'admin',
    first_name: 'Admin',
    last_name: 'Demo',
    phone: null,
    email: 'admin@demo',
    membership_active: true,
  },
  socio: {
    member_no: 7,
    role: 'user',
    first_name: 'Socio',
    last_name: 'Demo',
    phone: '600000000',
    email: 'socio@demo',
    membership_active: true,
  },
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [weekStatus, setWeekStatus] = useState<WeekStatus | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isAuthed, setIsAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const loadProfileRef = useRef<() => Promise<void>>(async () => {});

  // El logo se carga siempre (también sin sesión, para la pantalla de login)
  useEffect(() => {
    let active = true;
    void fetchLogoUrl().then((u) => active && setLogoUrl(u)).catch(() => active && setLogoUrl(null));
    return () => {
      active = false;
    };
  }, []);
  const refreshBranding = async () => {
    try {
      setLogoUrl(await fetchLogoUrl());
    } catch {
      setLogoUrl(null);
    }
  };

  useEffect(() => {
    // ---- Modo demo (sin Supabase configurado) ----
    if (!isSupabaseConfigured || !supabase) {
      const kind = sessionStorage.getItem(DEMO_KEY);
      if (kind && DEMO_PROFILES[kind]) {
        setProfile(DEMO_PROFILES[kind]);
        setIsAuthed(true);
        void fetchWeekStatus()
          .then((w) => setWeekStatus(kind === 'admin' ? { ...w, unlimited: true } : w))
          .catch(() => setWeekStatus(null));
      }
      setLoading(false);
      return;
    }

    // ---- Supabase real ----
    let active = true;
    async function loadProfile() {
      const { data: userData } = await supabase!.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) {
        if (active) {
          setProfile(null);
          setWeekStatus(null);
        }
        return;
      }
      // Filtramos por el propio id: un admin puede ver todas las fichas por
      // RLS, y sin este filtro maybeSingle() recibiría varias filas y fallaría.
      const { data } = await supabase!
        .from('profiles')
        .select('member_no, role, first_name, last_name, phone, email, membership_active, paid_until')
        .eq('id', uid)
        .maybeSingle();
      if (active && data) {
        const row = data as unknown as Record<string, unknown>;
        setProfile({
          member_no: row.member_no as number,
          role: row.role as 'user' | 'admin',
          first_name: row.first_name as string | null,
          last_name: row.last_name as string | null,
          phone: row.phone as string | null,
          email: row.email as string | null,
          membership_active: Boolean(row.membership_active),
          paid_until: (row.paid_until as string | null) ?? null,
        });
      } else if (active) {
        setProfile(null);
      }
      try {
        const w = await fetchWeekStatus();
        if (active) setWeekStatus(w);
      } catch {
        if (active) setWeekStatus(null);
      }
    }
    loadProfileRef.current = loadProfile;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setIsAuthed(Boolean(data.session));
      if (data.session) void loadProfile();
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setIsAuthed(Boolean(session));
      if (session) void loadProfile();
      else {
        setProfile(null);
        setWeekStatus(null);
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function signIn(email: string, password: string) {
    if (!isSupabaseConfigured || !supabase) {
      const kind = password === 'demo' ? 'admin' : password === 'socio' ? 'socio' : null;
      if (!kind) return 'Modo demo: contraseña «demo» (admin) o «socio».';
      sessionStorage.setItem(DEMO_KEY, kind);
      setProfile(DEMO_PROFILES[kind]);
      setIsAuthed(true);
      void fetchWeekStatus()
        .then((w) => setWeekStatus(kind === 'admin' ? { ...w, unlimited: true } : w))
        .catch(() => setWeekStatus(null));
      return null;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return 'Email o contraseña incorrectos.';
    return null;
  }

  async function signOut() {
    if (!isSupabaseConfigured || !supabase) {
      sessionStorage.removeItem(DEMO_KEY);
      setProfile(null);
      setWeekStatus(null);
      setIsAuthed(false);
      return;
    }
    await supabase.auth.signOut();
  }

  async function resetPassword(email: string) {
    if (!isSupabaseConfigured || !supabase) return null; // demo: no-op
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/set-password`,
    });
    if (error) return 'No se pudo enviar el email. Revisa la dirección.';
    return null;
  }

  async function refreshProfile() {
    await loadProfileRef.current();
  }

  return (
    <AuthContext.Provider
      value={{
        isAuthed,
        isAdmin: profile?.role === 'admin',
        profile,
        weekStatus,
        logoUrl,
        loading,
        demoMode: !isSupabaseConfigured,
        signIn,
        signOut,
        resetPassword,
        refreshProfile,
        refreshBranding,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext);
}
