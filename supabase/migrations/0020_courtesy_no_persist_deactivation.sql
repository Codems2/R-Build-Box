-- ===========================================================================
-- Corrección del modelo de cortesía
--
-- Problema: al agotar la cortesía marcábamos membership_active = false de forma
-- persistente. Si el socio cancelaba una reserva, recuperaba el hueco de
-- cortesía pero se quedaba «inactivo» a la fuerza (estado pegado y erróneo).
--
-- Solución: NO tocar membership_active por la cortesía. El poder reservar se
-- decide en vivo a partir de las clases de cortesía usadas; así, si el socio
-- cancela, vuelve a poder reservar automáticamente. membership_active pasa a
-- ser solo el interruptor manual del admin (+ se activa al registrar el pago).
-- El «estado efectivo» (al día / cortesía / inactivo) se deriva en la interfaz
-- y en los ingresos (un socio con el mes vencido no cuenta como ingreso).
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

    -- ¿Mes vencido? -> está usando clases de cortesía. Se decide en vivo:
    -- si ya ha gastado el máximo, se bloquea (sin tocar membership_active, para
    -- que al cancelar una reserva vuelva a poder reservar).
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

    -- Límite de clases por semana (incluye las canceladas tarde de esa semana)
    perform pg_advisory_xact_lock(hashtext('week:' || v_uid::text || ':' || v_week_start::text));
    select weekly_class_limit into v_limit from public.app_settings where id;
    v_limit := coalesce(v_limit, 3);

    -- Deuda de clases (cortesía usada el mes anterior) reduce el cupo del
    -- periodo pagado, repartida semana a semana. No aplica en cortesía.
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
-- Ingresos por socio: un socio con el mes vencido (en cortesía o agotada) no
-- cuenta como ingreso hasta que se ponga al día.
-- ---------------------------------------------------------------------------
create or replace function public.member_income()
returns table (member_id uuid, member_name text, plan_name text, amount numeric)
language sql
security definer set search_path = public
stable
as $$
  select p.id,
         coalesce(
           nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
           p.email,
           'Socio'
         ),
         coalesce(pl.name, 'Cuota estándar'),
         coalesce(pl.monthly_price, (select default_monthly_fee from public.app_settings where id))
  from public.profiles p
  left join public.plans pl on pl.id = p.plan_id
  where public.is_admin()
    and p.role <> 'admin'
    and p.membership_active
    and not (p.paid_until is not null
             and p.paid_until < (now() at time zone 'Europe/Madrid')::date)
  order by 2;
$$;

grant execute on function public.member_income() to authenticated;

-- ---------------------------------------------------------------------------
-- La baja automática por impago ya no toca membership_active: el bloqueo de
-- reservas se decide en vivo por las clases de cortesía. Queda como no-op para
-- no dejar tareas cron colgando de una función inexistente.
-- ---------------------------------------------------------------------------
create or replace function public.expire_memberships()
returns integer
language plpgsql
security definer set search_path = public
as $$
begin
  return 0;
end;
$$;
