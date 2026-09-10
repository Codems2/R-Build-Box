-- ===========================================================================
-- Consumo de clases por socio + devolución de créditos por el admin
--
-- El cupo de clases se calcula en vivo contando reservas: no hay un saldo
-- almacenado. Para poder «devolver» una clase (p. ej. una cancelación tardía
-- que se quiere perdonar) se añade una tabla de créditos: cada crédito resta
-- una clase del consumo de la semana y del mes a los que pertenece su fecha.
--
-- Así el ajuste queda registrado (quién, cuándo y por qué) en vez de tocar el
-- historial de reservas.
-- ===========================================================================

create table if not exists public.class_credits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Fecha a la que se imputa: decide de qué semana y de qué mes descuenta
  credit_date date not null,
  amount int not null check (amount between 1 and 20),
  reason text check (reason is null or char_length(reason) <= 200),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists class_credits_user_date_idx
  on public.class_credits (user_id, credit_date);

alter table public.class_credits enable row level security;

drop policy if exists "El socio ve sus créditos" on public.class_credits;
create policy "El socio ve sus créditos"
  on public.class_credits for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "Solo el admin gestiona los créditos" on public.class_credits;
create policy "Solo el admin gestiona los créditos"
  on public.class_credits for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.class_credits to authenticated;
grant insert, update, delete on public.class_credits to authenticated;
grant all on public.class_credits to service_role;

-- ---------------------------------------------------------------------------
-- Helpers: una sola definición del cupo y del consumo, usada por todas las
-- funciones (reserva, estado del socio y listado del admin).
-- ---------------------------------------------------------------------------

/** Clases que puede reservar el socio esa semana (plan > ajuste global),
    descontando la deuda de clases arrastrada del mes anterior. */
create or replace function public.member_week_limit(p_user uuid, p_week_start date)
returns int
language plpgsql
security definer set search_path = public
stable
as $$
declare
  v_profile public.profiles%rowtype;
  v_today date := (now() at time zone 'Europe/Madrid')::date;
  v_limit int;
  v_plan_weekly int;
  v_anchor_week date;
  v_weeks_elapsed int;
  v_debt_week int;
begin
  select * into v_profile from public.profiles where id = p_user;
  if not found then return 0; end if;

  select weekly_class_limit into v_limit from public.app_settings where id;
  select weekly_limit into v_plan_weekly from public.plans where id = v_profile.plan_id;
  v_limit := coalesce(v_plan_weekly, v_limit, 3);

  if v_profile.role <> 'admin' and v_profile.class_debt > 0
     and v_profile.paid_until is not null and not (v_profile.paid_until < v_today) then
    v_anchor_week := date_trunc('week', (v_profile.paid_until - interval '1 month')::date)::date + 7;
    v_weeks_elapsed := greatest(0, (p_week_start - v_anchor_week) / 7);
    v_debt_week := greatest(0, least(v_limit, v_profile.class_debt - v_weeks_elapsed * v_limit));
    v_limit := greatest(0, v_limit - v_debt_week);
  end if;

  return v_limit;
end;
$$;

/** Clases consumidas esa semana: reservas menos créditos devueltos. */
create or replace function public.member_week_used(p_user uuid, p_week_start date)
returns int
language sql
security definer set search_path = public
stable
as $$
  select greatest(
    0,
    (select count(*)::int from public.bookings
      where user_id = p_user
        and class_date >= p_week_start
        and class_date < p_week_start + 7)
    -
    (select coalesce(sum(amount), 0)::int from public.class_credits
      where user_id = p_user
        and credit_date >= p_week_start
        and credit_date < p_week_start + 7)
  );
$$;

/** Clases consumidas en el mes natural de esa fecha: reservas menos créditos. */
create or replace function public.member_month_used(p_user uuid, p_ref date)
returns int
language sql
security definer set search_path = public
stable
as $$
  select greatest(
    0,
    (select count(*)::int from public.bookings
      where user_id = p_user
        and date_trunc('month', class_date) = date_trunc('month', p_ref))
    -
    (select coalesce(sum(amount), 0)::int from public.class_credits
      where user_id = p_user
        and date_trunc('month', credit_date) = date_trunc('month', p_ref))
  );
$$;

/** Clases de cortesía usadas (posteriores al vencimiento), menos créditos. */
create or replace function public.member_courtesy_used(p_user uuid, p_paid_until date)
returns int
language sql
security definer set search_path = public
stable
as $$
  select case when p_paid_until is null then 0 else greatest(
    0,
    (select count(*)::int from public.bookings
      where user_id = p_user and class_date > p_paid_until and status = 'booked')
    -
    (select coalesce(sum(amount), 0)::int from public.class_credits
      where user_id = p_user and credit_date > p_paid_until)
  ) end;
$$;

grant execute on function public.member_week_limit(uuid, date) to authenticated;
grant execute on function public.member_week_used(uuid, date) to authenticated;
grant execute on function public.member_month_used(uuid, date) to authenticated;
grant execute on function public.member_courtesy_used(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Devolver una clase a un socio (y deshacerlo)
-- ---------------------------------------------------------------------------
create or replace function public.grant_class_credit(
  p_member_id uuid,
  p_amount int default 1,
  p_date date default null,
  p_reason text default null
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Europe/Madrid')::date;
  v_date date := coalesce(p_date, v_today);
  v_prof public.profiles%rowtype;
  v_id uuid;
  v_week date;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 20 then raise exception 'BAD_AMOUNT'; end if;

  select * into v_prof from public.profiles where id = p_member_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_prof.role = 'admin' then raise exception 'IS_ADMIN'; end if;

  insert into public.class_credits (user_id, credit_date, amount, reason, created_by)
    values (p_member_id, v_date, p_amount,
            nullif(trim(coalesce(p_reason, '')), ''), auth.uid())
    returning id into v_id;

  v_week := date_trunc('week', v_date)::date;
  return json_build_object(
    'ok', true,
    'id', v_id,
    'credit_date', v_date,
    'week_used', public.member_week_used(p_member_id, v_week),
    'week_limit', public.member_week_limit(p_member_id, v_week),
    'month_used', public.member_month_used(p_member_id, v_date)
  );
end;
$$;

create or replace function public.delete_class_credit(p_id uuid)
returns json
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  delete from public.class_credits where id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  return json_build_object('ok', true);
end;
$$;

grant execute on function public.grant_class_credit(uuid, int, date, text) to authenticated;
grant execute on function public.delete_class_credit(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Detalle de consumo de un socio: semana en curso, mes, reservas y créditos
-- ---------------------------------------------------------------------------
create or replace function public.member_class_usage(
  p_member_id uuid,
  p_ref date default null
)
returns json
language plpgsql
security definer set search_path = public
stable
as $$
declare
  v_ref date := coalesce(p_ref, (now() at time zone 'Europe/Madrid')::date);
  v_week date := date_trunc('week', v_ref)::date;
  v_prof public.profiles%rowtype;
  v_plan_monthly int;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  select * into v_prof from public.profiles where id = p_member_id;
  if not found then raise exception 'NOT_FOUND'; end if;

  select monthly_limit into v_plan_monthly from public.plans where id = v_prof.plan_id;

  return json_build_object(
    'week_start', v_week,
    'week_used', public.member_week_used(p_member_id, v_week),
    'week_limit', public.member_week_limit(p_member_id, v_week),
    'month_used', public.member_month_used(p_member_id, v_ref),
    'month_limit', v_plan_monthly,
    'courtesy_used', public.member_courtesy_used(p_member_id, v_prof.paid_until),
    -- Reservas de la semana en curso
    'week_bookings', coalesce((
      select json_agg(x order by x.class_date, x.start_time)
      from (
        select b.id, b.class_date, b.status,
               s.start_time,
               coalesce(s.title, ct.name, 'Clase') as title
        from public.bookings b
        left join public.schedule_slots s on s.id = b.slot_id
        left join public.class_types ct on ct.id = s.class_type_id
        where b.user_id = p_member_id
          and b.class_date >= v_week
          and b.class_date < v_week + 7
      ) x
    ), '[]'::json),
    -- Créditos devueltos en el mes en curso
    'credits', coalesce((
      select json_agg(y order by y.credit_date desc, y.created_at desc)
      from (
        select c.id, c.credit_date, c.amount, c.reason, c.created_at
        from public.class_credits c
        where c.user_id = p_member_id
          and date_trunc('month', c.credit_date) = date_trunc('month', v_ref)
      ) y
    ), '[]'::json)
  );
end;
$$;

grant execute on function public.member_class_usage(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- list_members: añade el consumo semanal y mensual de cada socio
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
  week_used int,
  week_limit int,
  month_used int,
  month_limit int,
  created_at timestamptz
)
language sql
security definer set search_path = public
stable
as $$
  select p.id, p.member_no, p.role, p.email, p.first_name, p.last_name, p.phone,
         (u.email_confirmed_at is not null) as activated,
         p.membership_active, p.plan_id, pl.name as plan_name, p.paid_until,
         public.member_courtesy_used(p.id, p.paid_until) as courtesy_used,
         p.class_debt,
         public.member_week_used(
           p.id, date_trunc('week', (now() at time zone 'Europe/Madrid')::date)::date) as week_used,
         public.member_week_limit(
           p.id, date_trunc('week', (now() at time zone 'Europe/Madrid')::date)::date) as week_limit,
         public.member_month_used(p.id, (now() at time zone 'Europe/Madrid')::date) as month_used,
         pl.monthly_limit as month_limit,
         u.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.plans pl on pl.id = p.plan_id
  where public.is_admin()
  order by p.member_no;
$$;

grant execute on function public.list_members() to authenticated;

-- ---------------------------------------------------------------------------
-- my_week_status: el consumo del socio ya descuenta los créditos devueltos
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
  v_courtesy_limit int;
  v_plan_monthly int;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_profile from public.profiles where id = v_uid;
  v_is_admin := (v_profile.role = 'admin');
  select courtesy_classes into v_courtesy_limit from public.app_settings where id;
  v_courtesy_limit := coalesce(v_courtesy_limit, 0);
  select monthly_limit into v_plan_monthly from public.plans where id = v_profile.plan_id;

  return json_build_object(
    'used', public.member_week_used(v_uid, v_week_start),
    'limit', public.member_week_limit(v_uid, v_week_start),
    'unlimited', v_is_admin,
    'week_start', v_week_start,
    'courtesy_used', public.member_courtesy_used(v_uid, v_profile.paid_until),
    'courtesy_limit', v_courtesy_limit,
    'monthly_used', public.member_month_used(v_uid, v_ref),
    'monthly_limit', v_plan_monthly
  );
end;
$$;

grant execute on function public.my_week_status(date) to authenticated;

-- ---------------------------------------------------------------------------
-- book_class: los límites cuentan el consumo ya descontados los créditos
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
  v_used int;
  v_start timestamptz;
  v_count bigint;
  v_name text;
  v_past_due boolean := false;
  v_courtesy_limit int := 0;
  v_courtesy_used int := 0;
  v_plan_monthly int;
  v_month_used int;
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

  -- Sesión suelta eliminada por el admin
  if exists (select 1 from public.slot_exceptions
             where slot_id = p_slot_id and class_date = p_class_date) then
    raise exception 'CLASS_CANCELLED';
  end if;

  v_start := (p_class_date + v_slot.start_time) at time zone 'Europe/Madrid';

  -- Reglas solo para socios (el admin se las salta todas)
  if not v_is_admin then
    if not v_profile.membership_active then raise exception 'MEMBERSHIP_INACTIVE'; end if;
    if p_class_date < v_today then raise exception 'DATE_IN_PAST'; end if;
    select booking_window_days into v_window from public.app_settings where id;
    if p_class_date > v_today + coalesce(v_window, 2) then raise exception 'TOO_FAR'; end if;
    if v_start <= now() then raise exception 'CLASS_STARTED'; end if;

    select monthly_limit into v_plan_monthly from public.plans where id = v_profile.plan_id;

    -- ¿Mes vencido? -> está usando clases de cortesía (bloqueo en vivo)
    v_past_due := (v_profile.paid_until is not null and v_today > v_profile.paid_until);
    if v_past_due then
      select courtesy_classes into v_courtesy_limit from public.app_settings where id;
      v_courtesy_limit := coalesce(v_courtesy_limit, 0);
      v_courtesy_used := public.member_courtesy_used(v_uid, v_profile.paid_until);
      if v_courtesy_used >= v_courtesy_limit then
        raise exception 'MEMBERSHIP_INACTIVE';
      end if;
    end if;

    perform pg_advisory_xact_lock(hashtext('week:' || v_uid::text || ':' || v_week_start::text));

    v_limit := public.member_week_limit(v_uid, v_week_start);
    v_used := public.member_week_used(v_uid, v_week_start);
    if v_used >= v_limit then raise exception 'WEEKLY_LIMIT'; end if;

    if v_plan_monthly is not null then
      v_month_used := public.member_month_used(v_uid, p_class_date);
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
