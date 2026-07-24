-- ===========================================================================
-- Muay Thai Box — esquema inicial
-- Ejecuta este script en el SQL Editor de tu proyecto de Supabase.
-- ===========================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Perfiles: marca qué usuarios son administradores
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Los perfiles son visibles para su dueño"
  on public.profiles for select
  using (auth.uid() = id);

-- Crea el perfil automáticamente al registrarse un usuario
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Comprueba si el usuario autenticado es admin
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- Tipos de clase (configurables por el admin)
-- ---------------------------------------------------------------------------
create table if not exists public.class_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  color text not null default '#D92B53',
  created_at timestamptz not null default now()
);

alter table public.class_types enable row level security;

create policy "Cualquiera puede ver los tipos de clase"
  on public.class_types for select
  using (true);

create policy "Solo el admin gestiona los tipos de clase"
  on public.class_types for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Huecos del horario semanal
--   kind: 'regular' (clase normal), 'personal' (entrenamiento personal),
--         'low' (baja ocupación)
--   day_of_week: 0 = Lunes … 6 = Domingo
-- ---------------------------------------------------------------------------
create table if not exists public.schedule_slots (
  id uuid primary key default gen_random_uuid(),
  class_type_id uuid references public.class_types (id) on delete set null,
  title text,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  duration_min integer not null check (duration_min between 5 and 480),
  capacity integer check (capacity between 1 and 999),
  kind text not null default 'regular' check (kind in ('regular', 'personal', 'low')),
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists schedule_slots_day_idx
  on public.schedule_slots (day_of_week, start_time);

alter table public.schedule_slots enable row level security;

create policy "Cualquiera puede ver los huecos activos"
  on public.schedule_slots for select
  using (is_active or public.is_admin());

create policy "Solo el admin gestiona los huecos"
  on public.schedule_slots for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Datos de ejemplo (opcional — borra este bloque si no los quieres)
-- ---------------------------------------------------------------------------
insert into public.class_types (name, description, color) values
  ('Muay Thai · Iniciación', 'Fundamentos, técnica básica y acondicionamiento.', '#EE7794'),
  ('Muay Thai · Adultos', 'Clase general para todos los niveles.', '#D92B53'),
  ('Avanzado · Competición', 'Trabajo técnico-táctico orientado a competición.', '#9E1838'),
  ('Sparring', 'Sparring controlado. Obligatorio equipo completo.', '#F59E0B'),
  ('Entrenamiento personal', 'Sesión individual con entrenador. Reserva previa.', '#2DD4BF');

with ct as (select id, name from public.class_types)
insert into public.schedule_slots
  (class_type_id, title, day_of_week, start_time, duration_min, capacity, kind, note)
values
  ((select id from ct where name = 'Muay Thai · Adultos'), null, 0, '10:00', 60, 16, 'regular', null),
  ((select id from ct where name = 'Muay Thai · Adultos'), null, 2, '10:00', 60, 16, 'regular', null),
  ((select id from ct where name = 'Muay Thai · Adultos'), null, 4, '10:00', 60, 16, 'regular', null),
  ((select id from ct where name = 'Entrenamiento personal'), null, 1, '12:00', 45, 1, 'personal', 'Reserva por WhatsApp'),
  ((select id from ct where name = 'Entrenamiento personal'), null, 3, '12:00', 45, 1, 'personal', 'Reserva por WhatsApp'),
  ((select id from ct where name = 'Muay Thai · Iniciación'), null, 0, '18:00', 60, 16, 'regular', null),
  ((select id from ct where name = 'Muay Thai · Iniciación'), null, 1, '18:00', 60, 16, 'regular', null),
  ((select id from ct where name = 'Muay Thai · Iniciación'), null, 2, '18:00', 60, 16, 'regular', null),
  ((select id from ct where name = 'Muay Thai · Iniciación'), null, 3, '18:00', 60, 16, 'regular', null),
  ((select id from ct where name = 'Muay Thai · Adultos'), null, 0, '19:15', 75, 16, 'regular', null),
  ((select id from ct where name = 'Muay Thai · Adultos'), null, 1, '19:15', 75, 16, 'regular', null),
  ((select id from ct where name = 'Muay Thai · Adultos'), null, 2, '19:15', 75, 16, 'regular', null),
  ((select id from ct where name = 'Muay Thai · Adultos'), null, 3, '19:15', 75, 16, 'regular', null),
  ((select id from ct where name = 'Avanzado · Competición'), null, 4, '19:15', 75, 16, 'regular', null),
  ((select id from ct where name = 'Sparring'), null, 2, '20:45', 60, 16, 'regular', null),
  ((select id from ct where name = 'Sparring'), null, 4, '20:45', 60, 16, 'regular', null),
  (null, 'Sala libre · Trabajo al saco', 4, '16:30', 60, 6, 'low', 'Grupo reducido, ideal para pulir técnica'),
  ((select id from ct where name = 'Avanzado · Competición'), null, 5, '11:00', 90, 16, 'regular', null),
  ((select id from ct where name = 'Entrenamiento personal'), null, 5, '12:45', 45, 1, 'personal', null);

-- ---------------------------------------------------------------------------
-- Para convertir un usuario en admin (tras registrarlo en Authentication):
--   update public.profiles set role = 'admin' where id = 'UUID-DEL-USUARIO';
-- ---------------------------------------------------------------------------
