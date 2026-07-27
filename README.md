# Muay Thai Box 🥊

Web de horarios para un box de muay thai. Los usuarios consultan el horario semanal, **tocan una clase y reservan su plaza** (sin necesidad de registrarse), y el administrador lo configura por completo: horas de inicio, duraciones, plazas y huecos especiales para **clases personales** o de **baja ocupación**.

## Socios y acceso privado

La web es **privada**: hay que iniciar sesión para ver los horarios. El registro no es libre — **el admin da de alta a cada socio** desde su panel (nombre, apellidos, teléfono y email) y Supabase le envía un email de invitación para que **cree su contraseña** (`/set-password`).

- Cada socio tiene un **número autonumérico irrepetible** (`member_no`) además de su id interno de Supabase Auth.
- El alta, el reenvío de invitación y la baja pasan por una **Edge Function** (`supabase/functions/invite-user`) que solo un admin puede usar; la clave de servicio nunca llega al navegador.
- El admin ve el estado de cada socio (pendiente de activar / activo) en el panel.

> **Emails**: el servicio de correo integrado de Supabase está pensado para pruebas (solo 2 emails/hora y no permite plantillas personalizadas). En producción se usa un **SMTP propio** configurado en *Authentication → Emails*.
>
> Configuración probada (Brevo, plan gratuito con remitente verificado — no requiere dominio):
> - Host: `smtp-relay.brevo.com`
> - **Puerto: `465`** (el 587/STARTTLS da problemas con el cliente SMTP de Supabase; usar 465/SSL)
> - Usuario: el *login* SMTP que muestra Brevo (p. ej. `xxxxx001@smtp-brevo.com`)
> - Contraseña: la *clave SMTP* de Brevo (`xsmtpsib-…`)
> - Remitente: el email verificado en Brevo (p. ej. `rbuildbox@gmail.com`)
> - Límite del proyecto (`rate_limit_email_sent`) subido a 30/hora.
>
> Las plantillas con estilos (`supabase/email-templates/`) requieren SMTP propio o plan Pro.

## Calendario por semanas

El horario se ve y gestiona **por semanas con fechas reales**, con un selector para navegar entre semanas (‹ / ›). Al crear una clase se elige una **fecha** (selector `date`) y se marca si **se repite cada semana**:

- **Recurrente**: la clase aparece cada semana ese mismo día a partir de la fecha elegida (no hay que recrearla).
- **Puntual**: existe solo en esa fecha (útil para seminarios o clases especiales).

La resolución de qué sesiones caen en cada semana se hace en el cliente a partir de los huecos (`src/lib/schedule.ts`); `book_class` valida en la base de datos que la fecha reservada corresponde de verdad al hueco (día de la semana desde el inicio, para recurrentes; fecha exacta, para puntuales).

## Planes y créditos

Las reservas funcionan con **créditos**:

- El admin crea **planes** (nombre, créditos semanales, precio) desde su panel.
- A cada socio se le asigna un plan y un estado **activo/inactivo**:
  - **Activo** → cada lunes recupera los créditos de su plan (renovación automática con `pg_cron`, migración 0005).
  - **Inactivo** → no se le renuevan hasta que el admin lo reactive (tras el pago); al reactivar recibe sus créditos al instante.
- **Reservar** una clase gasta 1 crédito y queda vinculada al socio (`book_class`). **Cancelar** antes de la clase lo devuelve (`cancel_my_booking`).
- Un socio inactivo o sin créditos no puede reservar (con aviso claro en la web).

Toda la lógica de créditos/aforo vive en la base de datos (funciones `security definer` con bloqueo por sesión), así que no hay forma de saltársela desde el cliente.

## Reservas

- Cada tarjeta muestra las plazas libres de la **próxima sesión** de esa clase.
- Al tocar una clase, el visitante se apunta con su nombre (y teléfono opcional). El aforo se controla en la base de datos: sin overbooking ni nombres duplicados.
- La reserva puede cancelarse desde el mismo dispositivo (se guarda un token local).
- Los nombres de los apuntados **solo los ve el admin** (botón de apuntados en cada hueco del panel); el público solo ve la ocupación.

- **Mobile-first** con soporte completo para escritorio (vista de semana completa).
- Diseño oscuro, minimalista y profesional basado en la paleta del logo (carmesí + acento teal complementario), con animaciones de [Framer Motion](https://www.framer.com/motion/).
- Backend con **Supabase** (PostgreSQL + Auth + RLS). Sin credenciales configuradas, la app arranca en **modo demo** con datos de ejemplo guardados en el navegador, para que puedas probarlo todo al instante.

## Stack

Vite · React 18 · TypeScript · Tailwind CSS · Framer Motion · Supabase

## Puesta en marcha

```bash
pnpm install
pnpm dev
```

Abre http://localhost:5173. Sin configurar Supabase estarás en **modo demo**: entra en `/admin` con cualquier email y la contraseña `demo`.

## Conectar Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. En el **SQL Editor**, ejecuta el contenido de [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) (crea tablas, políticas RLS y datos de ejemplo).
3. Copia `.env.example` a `.env` y rellena con los datos de *Project Settings → API*:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
4. Crea el usuario administrador en *Authentication → Users → Add user* (email + contraseña).
5. Dale rol de admin ejecutando en el SQL Editor:
   ```sql
   update public.profiles set role = 'admin' where id = 'UUID-DEL-USUARIO';
   ```
6. Reinicia `pnpm dev`. El login de `/admin` ya usará Supabase y los cambios se guardarán en la base de datos.

Las políticas RLS garantizan que **cualquiera puede leer** el horario activo, pero **solo el admin puede modificarlo**.

## El logo

Coloca el logo en `public/logo.png` y la web lo usará automáticamente en la cabecera. Si no existe, se muestra una marca abstracta con la paleta de la web.

## Personalización

- **Textos de la web**: [`src/config.ts`](src/config.ts).
- **Paleta de colores**: [`tailwind.config.js`](tailwind.config.js) (`brand` = carmesí del logo, `accent` = teal complementario).
- **Tipos de hueco**: `regular` (clase), `personal` (entrenamiento individual) y `low` (baja ocupación) — etiquetas y colores en [`src/lib/types.ts`](src/lib/types.ts).

## Estructura

```
src/
  config.ts               # Nombre y textos del box
  lib/
    supabase.ts           # Cliente Supabase (o modo demo)
    api.ts                # CRUD de huecos y tipos de clase
    auth.tsx              # Sesión de administrador
    types.ts              # Modelos y utilidades
  pages/
    SchedulePage.tsx      # Horario público
    AdminPage.tsx         # Login + panel de administración
  components/             # UI (cabecera, tarjetas, modales, formularios)
supabase/migrations/      # Esquema SQL + RLS + datos de ejemplo
```

## Build de producción

```bash
pnpm build   # genera dist/
```

Despliega `dist/` en cualquier hosting estático (Vercel, Netlify, Cloudflare Pages…). Recuerda configurar las variables `VITE_SUPABASE_*` en el hosting.
