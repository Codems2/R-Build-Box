// Edge Function: alta / reenvío de invitación / baja de socios.
// Solo la puede usar un admin autenticado. Usa la service_role (disponible
// como variable de entorno en el runtime) para operar sobre auth.users.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // 1) Verificar que quien llama es un admin
  const authHeader = req.headers.get('Authorization') ?? '';
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
  } = await caller.auth.getUser();
  if (!user) return json({ error: 'No autenticado' }, 401);

  const { data: isAdmin } = await caller.rpc('is_admin');
  if (!isAdmin) return json({ error: 'Solo el administrador puede gestionar socios' }, 403);

  // 2) Operar con privilegios de servicio
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Cuerpo inválido' }, 400);
  }

  const action = String(payload.action ?? 'invite');
  const redirectTo = payload.redirectTo ? String(payload.redirectTo) : undefined;

  try {
    if (action === 'invite') {
      const email = String(payload.email ?? '').trim().toLowerCase();
      if (!email) return json({ error: 'Falta el email' }, 400);
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        data: {
          first_name: payload.first_name ?? null,
          last_name: payload.last_name ?? null,
          phone: payload.phone ?? null,
        },
        redirectTo,
      });
      if (error) {
        const already = /registered|already/i.test(error.message);
        return json(
          { error: already ? 'Ya existe un socio con ese email.' : error.message },
          already ? 409 : 400,
        );
      }
      return json({ ok: true, user_id: data.user?.id });
    }

    if (action === 'resend') {
      const email = String(payload.email ?? '').trim().toLowerCase();
      if (!email) return json({ error: 'Falta el email' }, 400);
      const { error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === 'delete') {
      const userId = String(payload.user_id ?? '');
      if (!userId) return json({ error: 'Falta el id del socio' }, 400);
      if (userId === user.id) return json({ error: 'No puedes eliminar tu propia cuenta.' }, 400);
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: 'Acción no soportada' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Error inesperado' }, 500);
  }
});
