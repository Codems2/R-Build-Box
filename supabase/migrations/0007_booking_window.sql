-- ===========================================================================
-- Ventana de reserva y privilegios de admin
--
-- Socios: solo pueden reservar clases de hoy y hasta 2 días en el futuro
-- (evita que reserven la semana entera de golpe), y nunca una clase que ya
-- ha empezado. Gasta 1 crédito, requiere membresía activa.
--
-- Admins: pueden reservar siempre (sin ventana ni estado) y tienen créditos
-- ilimitados (no se les descuenta nada).
-- ===========================================================================

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
  v_start timestamptz;
  v_count bigint;
  v_name text;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select * into v_profile from public.profiles where id = v_uid;
  v_is_admin := (v_profile.role = 'admin');

  select * into v_slot from public.schedule_slots where id = p_slot_id and is_active;
  if not found then raise exception 'SLOT_NOT_FOUND'; end if;
  if (extract(isodow from p_class_date)::int - 1) <> v_slot.day_of_week then
    raise exception 'DATE_MISMATCH';
  end if;

  v_start := (p_class_date + v_slot.start_time) at time zone 'Europe/Madrid';

  -- Reglas solo para socios (el admin se las salta todas)
  if not v_is_admin then
    if not v_profile.membership_active then raise exception 'MEMBERSHIP_INACTIVE'; end if;
    if p_class_date < v_today then raise exception 'DATE_IN_PAST'; end if;
    if p_class_date > v_today + 2 then raise exception 'TOO_FAR'; end if;
    if v_start <= now() then raise exception 'CLASS_STARTED'; end if;
    if v_profile.credits <= 0 then raise exception 'NO_CREDITS'; end if;
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
  if not v_is_admin then
    update public.profiles set credits = credits - 1 where id = v_uid;
  end if;
  insert into public.bookings (slot_id, class_date, user_id, name, contact)
    values (p_slot_id, p_class_date, v_uid, coalesce(v_name, v_profile.email, 'Socio'), v_profile.phone);

  return json_build_object(
    'ok', true,
    'credits_left', case when v_is_admin then null else v_profile.credits - 1 end
  );
end;
$$;
