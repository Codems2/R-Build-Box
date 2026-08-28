-- ===========================================================================
-- Renovación de mensualidad y baja automática por impago (Opción A)
--
-- Cada socio tiene una fecha «pagado hasta» (paid_until). Al registrar un pago
-- se activa y se le suma un mes (mes rodante desde su vencimiento o desde hoy).
-- Una tarea diaria (pg_cron) desactiva a quien se le haya pasado esa fecha.
-- Registrar el pago puede crear el ingreso correspondiente en Economía.
-- ===========================================================================

alter table public.profiles
  add column if not exists paid_until date;

-- ---------------------------------------------------------------------------
-- Registrar el pago de un socio: activa, suma un mes y (opcional) crea ingreso
-- ---------------------------------------------------------------------------
create or replace function public.register_payment(
  p_member_id uuid,
  p_create_income boolean default true,
  p_amount numeric default null
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Europe/Madrid')::date;
  v_prof public.profiles%rowtype;
  v_base date;
  v_new date;
  v_amount numeric;
  v_name text;
  v_plan_price numeric;
  v_income boolean := false;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  select * into v_prof from public.profiles where id = p_member_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_prof.role = 'admin' then raise exception 'IS_ADMIN'; end if;

  -- Mes rodante: desde el vencimiento actual si aún es válido, o desde hoy
  v_base := greatest(coalesce(v_prof.paid_until, v_today), v_today);
  v_new := (v_base + interval '1 month')::date;

  update public.profiles
    set membership_active = true, paid_until = v_new
    where id = p_member_id;

  if p_create_income then
    select monthly_price into v_plan_price from public.plans where id = v_prof.plan_id;
    v_amount := coalesce(p_amount, v_plan_price, (select default_monthly_fee from public.app_settings where id));
    if v_amount is not null and v_amount > 0 then
      v_name := nullif(trim(coalesce(v_prof.first_name, '') || ' ' || coalesce(v_prof.last_name, '')), '');
      insert into public.finance_entries (kind, concept, amount, entry_date)
        values ('income', 'Cuota · ' || coalesce(v_name, v_prof.email, 'Socio'), round(v_amount, 2), v_today);
      v_income := true;
    end if;
  end if;

  return json_build_object('ok', true, 'paid_until', v_new, 'income_created', v_income);
end;
$$;

grant execute on function public.register_payment(uuid, boolean, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- Baja automática por impago: desactiva a los socios cuya fecha ya pasó
-- ---------------------------------------------------------------------------
create or replace function public.expire_memberships()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_rows integer;
  v_today date := (now() at time zone 'Europe/Madrid')::date;
begin
  update public.profiles
    set membership_active = false
    where role <> 'admin'
      and membership_active
      and paid_until is not null
      and paid_until < v_today;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

create extension if not exists pg_cron;

select cron.unschedule('expirar-membresias')
where exists (select 1 from cron.job where jobname = 'expirar-membresias');

select cron.schedule('expirar-membresias', '30 3 * * *', $$select public.expire_memberships();$$);

-- ---------------------------------------------------------------------------
-- list_members: añadir la fecha de vencimiento
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
  created_at timestamptz
)
language sql
security definer set search_path = public
stable
as $$
  select p.id, p.member_no, p.role, p.email, p.first_name, p.last_name, p.phone,
         (u.email_confirmed_at is not null) as activated,
         p.membership_active, p.plan_id, pl.name as plan_name, p.paid_until, u.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.plans pl on pl.id = p.plan_id
  where public.is_admin()
  order by p.member_no;
$$;

grant execute on function public.list_members() to authenticated;
