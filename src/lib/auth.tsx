import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { supabase, isSupabaseConfigured } from './supabase';

interface AuthContextValue {
  isAdmin: boolean;
  loading: boolean;
  demoMode: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  isAdmin: false,
  loading: true,
  demoMode: true,
  signIn: async () => 'No inicializado',
  signOut: async () => {},
});

const DEMO_SESSION_KEY = 'rmbox_demo_admin';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setIsAdmin(sessionStorage.getItem(DEMO_SESSION_KEY) === '1');
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setIsAdmin(Boolean(data.session));
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAdmin(Boolean(session));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signIn(email: string, password: string) {
    if (!isSupabaseConfigured || !supabase) {
      // Modo demo: cualquier email con la contraseña "demo"
      if (password === 'demo') {
        sessionStorage.setItem(DEMO_SESSION_KEY, '1');
        setIsAdmin(true);
        return null;
      }
      return 'Modo demo: usa la contraseña «demo»';
    }
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) return 'Credenciales incorrectas';
    return null;
  }

  async function signOut() {
    if (!isSupabaseConfigured || !supabase) {
      sessionStorage.removeItem(DEMO_SESSION_KEY);
      setIsAdmin(false);
      return;
    }
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider
      value={{
        isAdmin,
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
