-- ===========================================================================
-- Fin del sistema de créditos/planes → límite de clases por semana
--
-- El negocio cambia: ya no hay «tokens» ni planes con créditos. Ahora cada
-- socio puede reservar como máximo N clases por semana (semana ISO, lunes a
-- domingo, hora del box). Ese máximo es configurable por el admin desde el
-- panel (public.app_settings.weekly_class_limit).
--
-- Se conserva membership_active (activo/inactivo por pago) y la ventana de
-- reserva (hoy + 2 días). Los admins siguen sin límite.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Ajustes globales de la app (una sola fila)
-- ---------------------------------------------------------------------------
create table if not exists public.app_settings (
  id boolean primary key default true,
  weekly_class_limit int not null default 3 check (weekly_class_limit between 1 and 50),
  updated_at timestamptz not null default now(),
  constraint app_settings_singleton check (id)
);

insert into public.app_settings (id) values (true) on conflict (id) do nothing;

alter table public.app_settings enable row level security;

drop policy if exists "Los socios ven los ajustes" on public.app_settings;
create policy "Los socios ven los ajustes"
  on public.app_settings for select
  to authenticated
  using (true);

drop policy if exists "El admin edita los ajustes" on public.app_settings;
create policy "El admin edita los ajustes"
  on public.app_settings for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.app_settings to authenticated;
grant update on public.app_settings to authenticated;
grant all on public.app_settings to service_role;

-- ---------------------------------------------------------------------------
-- Reservar: valida socio activo, ventana de reserva, aforo, duplicados y el
-- límite de clases de esa semana. Ya no gasta créditos.
-- ---------------------------------------------------------------------------
create or replace function public.book_class(p_slot_id uuid, p_class_date date)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_slot public.schedule_slots%rowtype;
  v_profile public.profiles%rowtype;
  v_is_admin boolean;
  v_today date := (now() at time zone 'Europe/Madrid')::date;
  v_week_start date := date_trunc('week', p_class_date)::date;
  v_limit int;
  v_used bigint;
  v_start timestamptz;
  v_count bigint;
  v_name text;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select * into v_profile from public.profiles where id = v_uid;
  v_is_admin := (v_profile.role = 'admin');

  select * into v_slot from public.schedule_slots where id = p_slot_id and is_active;
  if not found then raise exception 'SLOT_NOT_FOUND'; end if;

  -- La fecha pedida debe corresponder de verdad a este hueco
  if v_slot.is_recurring then
    if (extract(isodow from p_class_date)::int - 1) <> v_slot.day_of_week then
      raise exception 'DATE_MISMATCH';
    end if;
    if v_slot.class_date is not null and p_class_date < v_slot.class_date then
      raise exception 'DATE_MISMATCH';
    end if;
  else
    if v_slot.class_date is null or p_class_date <> v_slot.class_date then
      raise exception 'DATE_MISMATCH';
    end if;
  end if;

  v_start := (p_class_date + v_slot.start_time) at time zone 'Europe/Madrid';

  -- Reglas solo para socios (el admin se las salta todas)
  if not v_is_admin then
    if not v_profile.membership_active then raise exception 'MEMBERSHIP_INACTIVE'; end if;
    if p_class_date < v_today then raise exception 'DATE_IN_PAST'; end if;
    if p_class_date > v_today + 2 then raise exception 'TOO_FAR'; end if;
    if v_start <= now() then raise exception 'CLASS_STARTED'; end if;

    -- Límite de clases por semana (bloquea la cuenta del socio en esa semana)
    perform pg_advisory_xact_lock(hashtext('week:' || v_uid::text || ':' || v_week_start::text));
    select weekly_class_limit into v_limit from public.app_settings where id;
    select count(*) into v_used from public.bookings
      where user_id = v_uid
        and class_date >= v_week_start
        and class_date < v_week_start + 7;
    if v_used >= coalesce(v_limit, 3) then raise exception 'WEEKLY_LIMIT'; end if;
  end if;

  perform pg_advisory_xact_lock(hashtext(p_slot_id::text || p_class_date::text));

  if exists (select 1 from public.bookings
             where slot_id = p_slot_id and class_date = p_class_date and user_id = v_uid) then
    raise exception 'ALREADY_BOOKED';
  end if;

  if v_slot.capacity is not null then
    select count(*) into v_count from public.bookings
      where slot_id = p_slot_id and class_date = p_class_date;
    if v_count >= v_slot.capacity then raise exception 'CLASS_FULL'; end if;
  end if;

  v_name := nullif(trim(coalesce(v_profile.first_name, '') || ' ' || coalesce(v_profile.last_name, '')), '');
  insert into public.bookings (slot_id, class_date, user_id, name, contact)
    values (p_slot_id, p_class_date, v_uid, coalesce(v_name, v_profile.email, 'Socio'), v_profile.phone);

  return json_build_object(
    'ok', true,
    'used', case when v_is_admin then null else v_used + 1 end,
    'limit', case when v_is_admin then null else coalesce(v_limit, 3) end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Cancelar mi reserva: la borra y libera la plaza (recupera cupo semanal).
-- Ya no hay créditos que devolver.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_my_booking(p_booking_id uuid)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists (select 1 from public.bookings where id = p_booking_id and user_id = v_uid) then
    raise exception 'NOT_FOUND';
  end if;
  delete from public.bookings where id = p_booking_id and user_id = v_uid;
  return json_build_object('ok', true);
end;
$$;

grant execute on function public.book_class(uuid, date) to authenticated;
grant execute on function public.cancel_my_booking(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Estado semanal del socio: clases usadas y límite (para el header/modal).
-- p_ref = cualquier fecha de la semana objetivo; null = hoy (hora del box).
-- ---------------------------------------------------------------------------
create or replace function public.my_week_status(p_ref date default null)
returns json
language plpgsql
security definer set search_path = public
stable
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_ref date := coalesce(p_ref, (now() at time zone 'Europe/Madrid')::date);
  v_week_start date := date_trunc('week', v_ref)::date;
  v_limit int;
  v_used bigint;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select (role = 'admin') into v_is_admin from public.profiles where id = v_uid;
  select weekly_class_limit into v_limit from public.app_settings where id;
  select count(*) into v_used from public.bookings
    where user_id = v_uid
      and class_date >= v_week_start
      and class_date < v_week_start + 7;
  return json_build_object(
    'used', v_used,
    'limit', coalesce(v_limit, 3),
    'unlimited', coalesce(v_is_admin, false),
    'week_start', v_week_start
  );
end;
$$;

grant execute on function public.my_week_status(date) to authenticated;

-- ---------------------------------------------------------------------------
-- Listado de socios para el admin (sin plan/créditos)
-- ---------------------------------------------------------------------------
drop function if exists public.list_members();
create function public.list_members()
returns table (
  id uuid,
  member_no bigint,
  role text,
  email text,
  first_name text,
  last_name text,
  phone text,
  activated boolean,
  membership_active boolean,
  created_at timestamptz
)
language sql
security definer set search_path = public
stable
as $$
  select p.id, p.member_no, p.role, p.email, p.first_name, p.last_name, p.phone,
         (u.email_confirmed_at is not null) as activated,
         p.membership_active, u.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where public.is_admin()
  order by p.member_no;
$$;

grant execute on function public.list_members() to authenticated;

-- ---------------------------------------------------------------------------
-- Limpieza del sistema de créditos: cron, funciones, trigger, columnas y tabla
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'renovar-creditos-semanal') then
    perform cron.unschedule('renovar-creditos-semanal');
  end if;
exception
  when undefined_table then null;  -- pg_cron no instalado: nada que limpiar
end $$;

drop function if exists public.renew_weekly_credits();
drop trigger if exists trg_grant_credits on public.profiles;
drop function if exists public.grant_credits_on_change();

alter table public.profiles
  drop column if exists credits,
  drop column if exists credits_renewed_at,
  drop column if exists plan_id;

drop table if exists public.plans cascade;
