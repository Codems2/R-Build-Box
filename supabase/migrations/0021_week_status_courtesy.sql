-- ===========================================================================
-- my_week_status: exponer también las clases de cortesía (usadas y máximo)
-- para que la cabecera pueda mostrar el contador en modo cortesía.
-- ===========================================================================

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
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_profile from public.profiles where id = v_uid;
  v_is_admin := (v_profile.role = 'admin');
  select weekly_class_limit, courtesy_classes into v_limit, v_courtesy_limit from public.app_settings where id;
  v_limit := coalesce(v_limit, 3);
  v_courtesy_limit := coalesce(v_courtesy_limit, 0);

  -- Reducción del cupo por deuda de clases (solo dentro del periodo pagado)
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

  -- Clases de cortesía usadas (reservas con fecha posterior al mes pagado)
  if not v_is_admin and v_profile.paid_until is not null then
    select count(*) into v_courtesy_used from public.bookings
      where user_id = v_uid and class_date > v_profile.paid_until and status = 'booked';
  end if;

  return json_build_object(
    'used', v_used,
    'limit', v_limit,
    'unlimited', coalesce(v_is_admin, false),
    'week_start', v_week_start,
    'courtesy_used', v_courtesy_used,
    'courtesy_limit', v_courtesy_limit
  );
end;
$$;
