// Auth Email Hook: Supabase llama a esta función para CADA email de auth
// (invitación, restablecer contraseña, etc.). En vez de SMTP, enviamos a
// través de la API REST de Brevo, que es fiable y nos deja controlar el
// remitente y la plantilla con estilos.
import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0';

const BREVO_API = 'https://api.brevo.com/v3/smtp/email';
const SENDER = { email: 'sabaimuaythaibox@gmail.com', name: 'Sabai Muay Thai' };

// Logo por defecto si no hay uno personalizado o falla la consulta
const DEFAULT_LOGO = 'https://sabai-muay-thai.vercel.app/icon-192.png';

interface EmailData {
  token_hash: string;
  redirect_to: string;
  email_action_type: string;
}
interface HookPayload {
  user: { email: string; user_metadata?: Record<string, unknown> };
  email_data: EmailData;
}

/**
 * Logo actual del box, leído en el momento de enviar el email, para que si el
 * admin lo cambia desde Ajustes el correo use siempre el vigente. get_branding
 * es legible sin sesión (misma RPC que usa la pantalla de acceso).
 */
async function currentLogo(supabaseUrl: string, anonKey: string): Promise<string> {
  try {
    const r = await fetch(`${supabaseUrl}/rest/v1/rpc/get_branding`, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!r.ok) return DEFAULT_LOGO;
    const d = (await r.json()) as { logo?: string | null; icons?: { any192?: string } | null };
    return d?.icons?.any192 || d?.logo || DEFAULT_LOGO;
  } catch {
    return DEFAULT_LOGO;
  }
}

function card(inner: string, logoUrl: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark light"></head>
<body style="margin:0;padding:0;background-color:#0b0a0b;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0b0a0b;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:480px;">
<tr><td style="height:5px;background-color:#C21E45;border-radius:16px 16px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="background-color:#141114;border:1px solid #2a2427;border-top:0;border-radius:0 0 16px 16px;padding:40px 36px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding-bottom:28px;">
<img src="${logoUrl}" alt="Sabai Muay Thai" width="132" style="display:block;width:132px;height:auto;max-width:60%;border-radius:14px;" />
</td></tr>
${inner}
</table></td></tr>
<tr><td align="center" style="padding:22px 20px 0;">
<div style="font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;line-height:18px;color:#5c5560;">Si no esperabas este email, puedes ignorarlo sin problema.</div>
</td></tr>
</table></td></tr></table></body></html>`;
}

function body(title: string, text: string, cta: string, url: string, logoUrl: string): string {
  return card(
    `
<tr><td align="center" style="padding-bottom:14px;"><div style="font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-size:24px;font-weight:800;color:#ffffff;">${title}</div></td></tr>
<tr><td align="center" style="padding-bottom:28px;"><div style="font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:24px;color:#c4bdc2;">${text}</div></td></tr>
<tr><td align="center" style="padding-bottom:24px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" style="border-radius:12px;background-color:#C21E45;">
<a href="${url}" target="_blank" style="display:inline-block;padding:15px 34px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">${cta}</a>
</td></tr></table></td></tr>
<tr><td align="center" style="padding-bottom:8px;"><div style="font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;line-height:20px;color:#7a737a;">¿No funciona el botón? Copia y pega este enlace:<br><a href="${url}" target="_blank" style="color:#EE7794;word-break:break-all;">${url}</a></div></td></tr>`,
    logoUrl,
  );
}

function render(
  type: string,
  firstName: string,
  url: string,
  logoUrl: string,
): { subject: string; html: string } {
  const hi = firstName ? `Hola ${firstName}, ` : '';
  if (type === 'recovery') {
    return {
      subject: 'Restablece tu contraseña · Sabai Muay Thai',
      html: body(
        'Restablecer contraseña',
        `${hi || 'Hemos '}${firstName ? 'hemos ' : ''}recibido una solicitud para restablecer la contraseña de tu cuenta. Pulsa el botón para elegir una nueva.`,
        'Restablecer contraseña',
        url,
        logoUrl,
      ),
    };
  }
  // invite (y por defecto)
  return {
    subject: 'Bienvenido/a al box · Crea tu contraseña 🥊',
    html: body(
      'Bienvenido/a al box',
      `${hi || 'El '}${firstName ? 'el ' : ''}equipo te ha dado de alta como socio. Crea tu contraseña para acceder a los horarios y reservar tus clases.`,
      'Crear mi contraseña',
      url,
      logoUrl,
    ),
  };
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('SEND_EMAIL_HOOK_SECRET') ?? '';
  const brevoKey = Deno.env.get('BREVO_API_KEY') ?? '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

  const payloadRaw = await req.text();
  let data: HookPayload;
  try {
    const wh = new Webhook(secret.replace('v1,', ''));
    data = wh.verify(payloadRaw, {
      'webhook-id': req.headers.get('webhook-id') ?? '',
      'webhook-timestamp': req.headers.get('webhook-timestamp') ?? '',
      'webhook-signature': req.headers.get('webhook-signature') ?? '',
    }) as HookPayload;
  } catch (e) {
    console.error('Firma no válida', e);
    return new Response(JSON.stringify({ error: { http_code: 401, message: 'invalid signature' } }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { user, email_data } = data;
  const { token_hash, redirect_to, email_action_type } = email_data;
  const url = `${supabaseUrl}/auth/v1/verify?token=${token_hash}&type=${email_action_type}&redirect_to=${encodeURIComponent(redirect_to)}`;
  const firstName = String(user.user_metadata?.first_name ?? '').trim();
  const logoUrl = await currentLogo(supabaseUrl, anonKey);
  const { subject, html } = render(email_action_type, firstName, url, logoUrl);

  const res = await fetch(BREVO_API, {
    method: 'POST',
    headers: { 'api-key': brevoKey, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: SENDER,
      to: [{ email: user.email }],
      subject,
      htmlContent: html,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error('Brevo error', res.status, detail);
    return new Response(
      JSON.stringify({ error: { http_code: 502, message: `Brevo: ${detail.slice(0, 200)}` } }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }

  return new Response(JSON.stringify({}), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
