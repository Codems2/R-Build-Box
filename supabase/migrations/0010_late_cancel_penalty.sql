-- ===========================================================================
-- Penalización por cancelación tardía
--
-- Si un socio cancela dentro de la última hora antes del inicio de la clase,
-- se libera la plaza para otros socios PERO esa clase le sigue contando en su
-- límite semanal (la pierde). Una cancelación con más de 1 hora de antelación
-- borra la reserva y le devuelve el cupo de la semana.
--
-- Modelo: bookings.status
--   'booked'         → reserva activa (ocupa plaza y cuenta en la semana)
--   'late_cancelled' → cancelada tarde (NO ocupa plaza, SÍ cuenta en la semana)
-- Una cancelación normal elimina la fila por completo.
-- ===========================================================================

alter table public.bookings
  add column if not exists status text not null default 'booked'
  check (status in ('booked', 'late_cancelled'));

create index if not exists bookings_status_idx on public.bookings (status);

-- La unicidad por persona/sesión solo aplica a reservas activas, para permitir
-- volver a apuntarse tras una cancelación tardía (si aún le queda cupo).
drop index if exists public.bookings_unique_person;
create unique index if not exists bookings_unique_person
  on public.bookings (slot_id, class_date, lower(trim(name)))
  where status = 'booked';

-- ---------------------------------------------------------------------------
-- Ocupación: solo cuentan las reservas activas (las tardías liberan plaza)
-- ---------------------------------------------------------------------------
create or replace function public.get_booking_counts()
returns table (slot_id uuid, class_date date, cnt bigint)
language sql
security definer set search_path = public
stable
as $$
  select b.slot_id, b.class_date, count(*)
  from public.bookings b
  where b.class_date >= current_date and b.status = 'booked'
  group by b.slot_id, b.class_date;
$$;

grant execute on function public.get_booking_counts() to authenticated;

-- ---------------------------------------------------------------------------
-- Reservar: el aforo y el duplicado solo miran reservas activas; el límite
-- semanal cuenta también las canceladas tarde (clases perdidas).
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

    -- Límite de clases por semana (incluye las canceladas tarde de esa semana)
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
             where slot_id = p_slot_id and class_date = p_class_date
               and user_id = v_uid and status = 'booked') then
    raise exception 'ALREADY_BOOKED';
  end if;

  if v_slot.capacity is not null then
    select count(*) into v_count from public.bookings
      where slot_id = p_slot_id and class_date = p_class_date and status = 'booked';
    if v_count >= v_slot.capacity then raise exception 'CLASS_FULL'; end if;
  end if;

  v_name := nullif(trim(coalesce(v_profile.first_name, '') || ' ' || coalesce(v_profile.last_name, '')), '');
  insert into public.bookings (slot_id, class_date, user_id, name, contact, status)
    values (p_slot_id, p_class_date, v_uid, coalesce(v_name, v_profile.email, 'Socio'), v_profile.phone, 'booked');

  return json_build_object(
    'ok', true,
    'used', case when v_is_admin then null else v_used + 1 end,
    'limit', case when v_is_admin then null else coalesce(v_limit, 3) end
  );
end;
$$;

grant execute on function public.book_class(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Cancelar mi reserva, con penalización por cancelación tardía (< 1 h antes).
--   - Con más de 1 h de antelación → se borra y recupera el cupo semanal.
--   - Dentro de la última hora (o ya empezada) → se marca 'late_cancelled':
--     libera la plaza para otros pero la clase sigue contando esta semana.
-- Los admins nunca se penalizan (sus reservas no consumen cupo).
-- Devuelve { ok, penalized }.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_my_booking(p_booking_id uuid)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_b public.bookings%rowtype;
  v_slot public.schedule_slots%rowtype;
  v_is_admin boolean;
  v_start timestamptz;
  v_penalized boolean;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select * into v_b from public.bookings
    where id = p_booking_id and user_id = v_uid and status = 'booked';
  if not found then raise exception 'NOT_FOUND'; end if;

  select (role = 'admin') into v_is_admin from public.profiles where id = v_uid;
  select * into v_slot from public.schedule_slots where id = v_b.slot_id;

  v_start := (v_b.class_date + v_slot.start_time) at time zone 'Europe/Madrid';
  -- Penaliza si falta menos de 1 hora para el inicio (o ya ha empezado)
  v_penalized := (not coalesce(v_is_admin, false)) and (now() >= v_start - interval '1 hour');

  if v_penalized then
    update public.bookings set status = 'late_cancelled' where id = p_booking_id;
  else
    delete from public.bookings where id = p_booking_id;
  end if;

  return json_build_object('ok', true, 'penalized', v_penalized);
end;
$$;

grant execute on function public.cancel_my_booking(uuid) to authenticated;
