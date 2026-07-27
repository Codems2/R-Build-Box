-- ===========================================================================
-- Socios: ficha ampliada + web privada (login obligatorio)
--
-- El horario deja de ser público: solo usuarios autenticados pueden verlo.
-- El alta de socios la hace el admin (vía Edge Function invite-user, que
-- envía el email de invitación). Cada socio recibe un número autonumérico
-- irrepetible (member_no) además de su id interno de auth.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Ampliar la ficha de socio en profiles
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists member_no bigint generated always as identity,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists phone text,
  add column if not exists email text;

create unique index if not exists profiles_member_no_idx
  on public.profiles (member_no);

-- Rellena la ficha desde los metadatos de la invitación al crear el usuario
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, first_name, last_name, phone)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    new.raw_user_meta_data ->> 'phone'
  )
  on conflict (id) do update set
    email = excluded.email,
    first_name = coalesce(excluded.first_name, public.profiles.first_name),
    last_name = coalesce(excluded.last_name, public.profiles.last_name),
    phone = coalesce(excluded.phone, public.profiles.phone);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Políticas: el admin gestiona todas las fichas; cada socio ve la suya
-- ---------------------------------------------------------------------------
drop policy if exists "El admin ve todos los perfiles" on public.profiles;
create policy "El admin ve todos los perfiles"
  on public.profiles for select
  using (public.is_admin());

drop policy if exists "El admin edita perfiles" on public.profiles;
create policy "El admin edita perfiles"
  on public.profiles for update
  using (public.is_admin())
  with check (public.is_admin());

grant select, update on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Web privada: revoca el acceso anónimo (ahora hace falta iniciar sesión)
-- ---------------------------------------------------------------------------
revoke select on public.class_types from anon;
revoke select on public.schedule_slots from anon;
revoke execute on function public.get_booking_counts() from anon;
revoke execute on function public.create_booking(uuid, date, text, text) from anon;
revoke execute on function public.cancel_booking(uuid, uuid) from anon;

-- Los huecos y tipos siguen siendo legibles, pero solo por usuarios logueados
drop policy if exists "Cualquiera puede ver los tipos de clase" on public.class_types;
create policy "Los socios ven los tipos de clase"
  on public.class_types for select
  to authenticated
  using (true);

drop policy if exists "Cualquiera puede ver los huecos activos" on public.schedule_slots;
create policy "Los socios ven los huecos activos"
  on public.schedule_slots for select
  to authenticated
  using (is_active or public.is_admin());

-- ---------------------------------------------------------------------------
-- Listado de socios para el admin (incluye si ya activaron su contraseña)
-- ---------------------------------------------------------------------------
create or replace function public.list_members()
returns table (
  id uuid,
  member_no bigint,
  role text,
  email text,
  first_name text,
  last_name text,
  phone text,
  activated boolean,
  created_at timestamptz
)
language sql
security definer set search_path = public
stable
as $$
  select p.id, p.member_no, p.role, p.email, p.first_name, p.last_name, p.phone,
         (u.email_confirmed_at is not null) as activated, u.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where public.is_admin()
  order by p.member_no;
$$;

grant execute on function public.list_members() to authenticated;
