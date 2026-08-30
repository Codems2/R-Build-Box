-- ===========================================================================
-- Ventana de reserva configurable
--
-- Hasta ahora los socios podían reservar una clase como mucho 2 días antes
-- (48 h). Ahora ese margen es configurable por el admin: app_settings.
-- booking_window_days (0 = solo el mismo día; por defecto 2).
-- ===========================================================================

alter table public.app_settings
  add column if not exists booking_window_days int not null default 2
  check (booking_window_days between 0 and 60);

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
  v_past_due boolean := false;
  v_courtesy_limit int := 0;
  v_courtesy_used bigint := 0;
  v_anchor_week date;
  v_weeks_elapsed int;
  v_debt_week int;
  v_plan_weekly int;
  v_plan_monthly int;
  v_month_used bigint;
  v_window int;
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
    select booking_window_days into v_window from public.app_settings where id;
    if p_class_date > v_today + coalesce(v_window, 2) then raise exception 'TOO_FAR'; end if;
    if v_start <= now() then raise exception 'CLASS_STARTED'; end if;

    -- Límites del plan del socio (si tiene)
    select weekly_limit, monthly_limit into v_plan_weekly, v_plan_monthly
      from public.plans where id = v_profile.plan_id;

    -- ¿Mes vencido? -> está usando clases de cortesía (bloqueo en vivo)
    v_past_due := (v_profile.paid_until is not null and v_today > v_profile.paid_until);
    if v_past_due then
      select courtesy_classes into v_courtesy_limit from public.app_settings where id;
      v_courtesy_limit := coalesce(v_courtesy_limit, 0);
      select count(*) into v_courtesy_used from public.bookings
        where user_id = v_uid and class_date > v_profile.paid_until and status = 'booked';
      if v_courtesy_used >= v_courtesy_limit then
        raise exception 'MEMBERSHIP_INACTIVE';
      end if;
    end if;

    perform pg_advisory_xact_lock(hashtext('week:' || v_uid::text || ':' || v_week_start::text));

    select weekly_class_limit into v_limit from public.app_settings where id;
    v_limit := coalesce(v_plan_weekly, v_limit, 3);

    if not v_past_due and v_profile.class_debt > 0 and v_profile.paid_until is not null then
      v_anchor_week := date_trunc('week', (v_profile.paid_until - interval '1 month')::date)::date + 7;
      v_weeks_elapsed := greatest(0, (v_week_start - v_anchor_week) / 7);
      v_debt_week := greatest(0, least(v_limit, v_profile.class_debt - v_weeks_elapsed * v_limit));
      v_limit := greatest(0, v_limit - v_debt_week);
    end if;

    select count(*) into v_used from public.bookings
      where user_id = v_uid
        and class_date >= v_week_start
        and class_date < v_week_start + 7;
    if v_used >= v_limit then raise exception 'WEEKLY_LIMIT'; end if;

    if v_plan_monthly is not null then
      select count(*) into v_month_used from public.bookings
        where user_id = v_uid
          and date_trunc('month', class_date) = date_trunc('month', p_class_date);
      if v_month_used >= v_plan_monthly then raise exception 'MONTHLY_LIMIT'; end if;
    end if;
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
    'limit', case when v_is_admin then null else v_limit end,
    'courtesy', case when v_is_admin then null else v_past_due end
  );
end;
$$;

grant execute on function public.book_class(uuid, date) to authenticated;
