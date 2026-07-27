import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { supabase, isSupabaseConfigured } from './supabase';

export interface Profile {
  member_no: number | null;
  role: 'user' | 'admin';
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
}

interface AuthContextValue {
  isAuthed: boolean;
  isAdmin: boolean;
  profile: Profile | null;
  loading: boolean;
  demoMode: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  isAuthed: false,
  isAdmin: false,
  profile: null,
  loading: true,
  demoMode: true,
  signIn: async () => 'No inicializado',
  signOut: async () => {},
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
  },
  socio: {
    member_no: 7,
    role: 'user',
    first_name: 'Socio',
    last_name: 'Demo',
    phone: '600000000',
    email: 'socio@demo',
  },
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAuthed, setIsAuthed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // ---- Modo demo (sin Supabase configurado) ----
    if (!isSupabaseConfigured || !supabase) {
      const kind = sessionStorage.getItem(DEMO_KEY);
      if (kind && DEMO_PROFILES[kind]) {
        setProfile(DEMO_PROFILES[kind]);
        setIsAuthed(true);
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
        if (active) setProfile(null);
        return;
      }
      // Filtramos por el propio id: un admin puede ver todas las fichas por
      // RLS, y sin este filtro maybeSingle() recibiría varias filas y fallaría.
      const { data } = await supabase!
        .from('profiles')
        .select('member_no, role, first_name, last_name, phone, email')
        .eq('id', uid)
        .maybeSingle();
      if (active) setProfile((data as Profile) ?? null);
    }

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
      else setProfile(null);
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
      setIsAuthed(false);
      return;
    }
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider
      value={{
        isAuthed,
        isAdmin: profile?.role === 'admin',
        profile,
        loading,
        demoMode: !isSupabaseConfigured,
        signIn,
        signOut,
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
