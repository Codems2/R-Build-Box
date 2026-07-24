# Muay Thai Box 🥊

Web de horarios para un box de muay thai. Los usuarios consultan el horario semanal de clases y el administrador lo configura por completo: horas de inicio, duraciones, plazas y huecos especiales para **clases personales** o de **baja ocupación**.

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
