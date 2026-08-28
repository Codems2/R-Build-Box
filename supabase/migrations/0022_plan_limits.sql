-- ===========================================================================
-- Límites por plan: clases por semana y clases máximas al mes
--
-- Cada plan puede fijar su propio tope semanal (weekly_limit) y un tope mensual
-- de clases (monthly_limit). Sirve, por ejemplo, para un plan de atletas que
-- entrenan a diario (7/semana) más caro. Si el plan no fija un valor:
--   · weekly_limit  NULL  -> se usa el límite semanal global (app_settings).
--   · monthly_limit NULL  -> sin tope mensual.
-- El tope mensual se cuenta por mes natural.
-- ===========================================================================

alter table public.plans
  add column if not exists weekly_limit int check (weekly_limit is null or weekly_limit between 1 and 50),
  add column if not exists monthly_limit int check (monthly_limit is null or monthly_limit between 1 and 500);

-- ---------------------------------------------------------------------------
-- Reservar: límite semanal según el plan (o global) + tope mensual del plan
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
  v_past_due boolean := false;
  v_courtesy_limit int := 0;
  v_courtesy_used bigint := 0;
  v_anchor_week date;
  v_weeks_elapsed int;
  v_debt_week int;
  v_plan_weekly int;
  v_plan_monthly int;
  v_month_used bigint;
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

    -- Límite semanal: el del plan si lo define, si no el global
    select weekly_class_limit into v_limit from public.app_settings where id;
    v_limit := coalesce(v_plan_weekly, v_limit, 3);

    -- Reducción por deuda de clases de cortesía (solo en periodo pagado)
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

    -- Tope mensual del plan (mes natural)
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

-- ---------------------------------------------------------------------------
-- my_week_status: límite semanal según plan + uso/tope mensual del plan
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
  v_profile public.profiles%rowtype;
  v_ref date := coalesce(p_ref, (now() at time zone 'Europe/Madrid')::date);
  v_today date := (now() at time zone 'Europe/Madrid')::date;
  v_week_start date := date_trunc('week', v_ref)::date;
  v_limit int;
  v_used bigint;
  v_anchor_week date;
  v_weeks_elapsed int;
  v_debt_week int;
  v_courtesy_limit int;
  v_courtesy_used bigint := 0;
  v_plan_weekly int;
  v_plan_monthly int;
  v_month_used bigint := 0;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_profile from public.profiles where id = v_uid;
  v_is_admin := (v_profile.role = 'admin');
  select weekly_class_limit, courtesy_classes into v_limit, v_courtesy_limit from public.app_settings where id;
  v_courtesy_limit := coalesce(v_courtesy_limit, 0);

  select weekly_limit, monthly_limit into v_plan_weekly, v_plan_monthly
    from public.plans where id = v_profile.plan_id;
  v_limit := coalesce(v_plan_weekly, v_limit, 3);

  if not v_is_admin and v_profile.class_debt > 0 and v_profile.paid_until is not null
     and not (v_profile.paid_until < v_today) then
    v_anchor_week := date_trunc('week', (v_profile.paid_until - interval '1 month')::date)::date + 7;
    v_weeks_elapsed := greatest(0, (v_week_start - v_anchor_week) / 7);
    v_debt_week := greatest(0, least(v_limit, v_profile.class_debt - v_weeks_elapsed * v_limit));
    v_limit := greatest(0, v_limit - v_debt_week);
  end if;

  select count(*) into v_used from public.bookings
    where user_id = v_uid
      and class_date >= v_week_start
      and class_date < v_week_start + 7;

  if not v_is_admin and v_profile.paid_until is not null then
    select count(*) into v_courtesy_used from public.bookings
      where user_id = v_uid and class_date > v_profile.paid_until and status = 'booked';
  end if;

  if v_plan_monthly is not null then
    select count(*) into v_month_used from public.bookings
      where user_id = v_uid and date_trunc('month', class_date) = date_trunc('month', v_ref);
  end if;

  return json_build_object(
    'used', v_used,
    'limit', v_limit,
    'unlimited', coalesce(v_is_admin, false),
    'week_start', v_week_start,
    'courtesy_used', v_courtesy_used,
    'courtesy_limit', v_courtesy_limit,
    'monthly_used', v_month_used,
    'monthly_limit', v_plan_monthly
  );
end;
$$;
