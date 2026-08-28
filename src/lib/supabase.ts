import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Si no hay credenciales configuradas la app funciona en "modo demo":
 * los datos se guardan en localStorage para poder probar toda la
 * funcionalidad sin necesidad de un proyecto de Supabase.
 */
export const isSupabaseConfigured = Boolean(url && anonKey);

/**
 * Todas las llamadas de red de Supabase (login, refresco de token, consultas,
 * RPC, subidas) pasan por este fetch con timeout. Sin él, un refresco de token
 * atascado (latencia, cold start, cookie/lock en mal estado) podría colgar una
 * petición para siempre y dejar la app bloqueada. Con timeout, un fallo
 * transitorio se convierte en un error recuperable en vez de un cuelgue.
 *
 * Es generoso (30 s) para no cortar subidas legítimas de archivos en redes
 * lentas; el arranque tiene además su propio corte corto (ver auth.tsx).
 */
const REQUEST_TIMEOUT_MS = 30_000;

const timeoutFetch: typeof fetch = (input, init) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const external = init?.signal;
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
};

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, { global: { fetch: timeoutFetch } })
  : null;
