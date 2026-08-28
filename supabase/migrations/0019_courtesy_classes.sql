-- ===========================================================================
-- Clases de cortesía
--
-- Cuando a un socio se le acaba el mes pagado ya NO se desactiva de inmediato:
-- entra en «cortesía» y puede seguir reservando hasta agotar X clases de
-- cortesía (configurable por el admin). Al usar la última, se desactiva solo.
-- Cuando se pone al día (el admin registra el pago), esas clases de cortesía
-- usadas se le restan del periodo recién pagado: tendrá menos clases ese mes
-- (deuda de clases repartida semana a semana).
-- ===========================================================================

-- Máximo de clases de cortesía (0 = sin cortesía, comportamiento anterior)
alter table public.app_settings
  add column if not exists courtesy_classes int not null default 2
  check (courtesy_classes between 0 and 50);

-- Deuda de clases que arrastra el socio al periodo pagado (clases de cortesía
-- usadas el mes anterior). Reduce su cupo durante el mes que acaba de pagar.
alter table public.profiles
  add column if not exists class_debt int not null default 0;

-- ---------------------------------------------------------------------------
-- Reservar: ahora consciente de la cortesía y de la deuda de clases
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

    -- ¿Mes vencido? -> está usando clases de cortesía
    v_past_due := (v_profile.paid_until is not null and v_today > v_profile.paid_until);
    if v_past_due then
      select courtesy_classes into v_courtesy_limit from public.app_settings where id;
      v_courtesy_limit := coalesce(v_courtesy_limit, 0);
      select count(*) into v_courtesy_used from public.bookings
        where user_id = v_uid and class_date > v_profile.paid_until;
      -- Cortesía agotada: desactivar y bloquear
      if v_courtesy_used >= v_courtesy_limit then
        update public.profiles set membership_active = false where id = v_uid;
        raise exception 'MEMBERSHIP_INACTIVE';
      end if;
    end if;

    -- Límite de clases por semana (incluye las canceladas tarde de esa semana)
    perform pg_advisory_xact_lock(hashtext('week:' || v_uid::text || ':' || v_week_start::text));
    select weekly_class_limit into v_limit from public.app_settings where id;
    v_limit := coalesce(v_limit, 3);

    -- Deuda de clases (cortesía usada el mes anterior) reduce el cupo del
    -- periodo pagado, repartida semana a semana desde la semana siguiente al
    -- pago. No aplica mientras está en cortesía (aún no ha pagado).
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

  -- Si esta reserva era de cortesía y con ella se alcanza el máximo, desactivar
  if not v_is_admin and v_past_due and (v_courtesy_used + 1) >= v_courtesy_limit then
    update public.profiles set membership_active = false where id = v_uid;
  end if;

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
-- Estado semanal: el cupo mostrado ya refleja la reducción por deuda
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
  v_week_start date := date_trunc('week', v_ref)::date;
  v_limit int;
  v_used bigint;
  v_anchor_week date;
  v_weeks_elapsed int;
  v_debt_week int;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_profile from public.profiles where id = v_uid;
  v_is_admin := (v_profile.role = 'admin');
  select weekly_class_limit into v_limit from public.app_settings where id;
  v_limit := coalesce(v_limit, 3);

  if not v_is_admin and v_profile.class_debt > 0 and v_profile.paid_until is not null
     and not (v_profile.paid_until < (now() at time zone 'Europe/Madrid')::date) then
    v_anchor_week := date_trunc('week', (v_profile.paid_until - interval '1 month')::date)::date + 7;
    v_weeks_elapsed := greatest(0, (v_week_start - v_anchor_week) / 7);
    v_debt_week := greatest(0, least(v_limit, v_profile.class_debt - v_weeks_elapsed * v_limit));
    v_limit := greatest(0, v_limit - v_debt_week);
  end if;

  select count(*) into v_used from public.bookings
    where user_id = v_uid
      and class_date >= v_week_start
      and class_date < v_week_start + 7;
  return json_build_object(
    'used', v_used,
    'limit', v_limit,
    'unlimited', coalesce(v_is_admin, false),
    'week_start', v_week_start
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Registrar el pago: al ponerse al día, resta las clases de cortesía usadas
-- (deuda de clases para el periodo recién pagado)
-- ---------------------------------------------------------------------------
drop function if exists public.register_payment(uuid, boolean, numeric, date);

create or replace function public.register_payment(
  p_member_id uuid,
  p_create_income boolean default true,
  p_amount numeric default null,
  p_paid_at date default null
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Europe/Madrid')::date;
  v_ref date;
  v_prof public.profiles%rowtype;
  v_base date;
  v_new date;
  v_amount numeric;
  v_name text;
  v_plan_price numeric;
  v_income boolean := false;
  v_debt int := 0;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  select * into v_prof from public.profiles where id = p_member_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_prof.role = 'admin' then raise exception 'IS_ADMIN'; end if;

  v_ref := coalesce(p_paid_at, v_today);

  -- Clases de cortesía usadas en el mes vencido -> deuda del nuevo periodo
  if v_prof.paid_until is not null and v_prof.paid_until < v_today then
    select count(*) into v_debt from public.bookings
      where user_id = p_member_id and class_date > v_prof.paid_until;
  end if;

  -- Mes rodante: desde el vencimiento actual si aún es válido, o desde la fecha del pago
  v_base := greatest(coalesce(v_prof.paid_until, v_ref), v_ref);
  v_new := (v_base + interval '1 month')::date;

  update public.profiles
    set membership_active = true, paid_until = v_new, class_debt = v_debt
    where id = p_member_id;

  if p_create_income then
    select monthly_price into v_plan_price from public.plans where id = v_prof.plan_id;
    v_amount := coalesce(p_amount, v_plan_price, (select default_monthly_fee from public.app_settings where id));
    if v_amount is not null and v_amount > 0 then
      v_name := nullif(trim(coalesce(v_prof.first_name, '') || ' ' || coalesce(v_prof.last_name, '')), '');
      insert into public.finance_entries (kind, concept, amount, entry_date)
        values ('income', 'Cuota · ' || coalesce(v_name, v_prof.email, 'Socio'), round(v_amount, 2), v_ref);
      v_income := true;
    end if;
  end if;

  return json_build_object(
    'ok', true, 'paid_until', v_new, 'income_created', v_income, 'courtesy_deducted', v_debt
  );
end;
$$;

grant execute on function public.register_payment(uuid, boolean, numeric, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Baja automática: ahora solo si el mes venció Y agotó las clases de cortesía
-- ---------------------------------------------------------------------------
create or replace function public.expire_memberships()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_rows integer;
  v_today date := (now() at time zone 'Europe/Madrid')::date;
  v_courtesy int;
begin
  select courtesy_classes into v_courtesy from public.app_settings where id;
  v_courtesy := coalesce(v_courtesy, 0);

  update public.profiles p
    set membership_active = false
    where p.role <> 'admin'
      and p.membership_active
      and p.paid_until is not null
      and p.paid_until < v_today
      and (select count(*) from public.bookings b
             where b.user_id = p.id and b.class_date > p.paid_until) >= v_courtesy;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- ---------------------------------------------------------------------------
-- list_members: añadir clases de cortesía usadas y la deuda de clases
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
  plan_id uuid,
  plan_name text,
  paid_until date,
  courtesy_used int,
  class_debt int,
  created_at timestamptz
)
language sql
security definer set search_path = public
stable
as $$
  select p.id, p.member_no, p.role, p.email, p.first_name, p.last_name, p.phone,
         (u.email_confirmed_at is not null) as activated,
         p.membership_active, p.plan_id, pl.name as plan_name, p.paid_until,
         coalesce((select count(*)::int from public.bookings b
                     where b.user_id = p.id and p.paid_until is not null
                       and b.class_date > p.paid_until), 0) as courtesy_used,
         p.class_debt,
         u.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.plans pl on pl.id = p.plan_id
  where public.is_admin()
  order by p.member_no;
$$;

grant execute on function public.list_members() to authenticated;
