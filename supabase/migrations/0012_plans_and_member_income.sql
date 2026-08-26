-- ===========================================================================
-- Planes de mensualidad + ingresos automáticos por socio
--
-- Vuelven los planes, ahora como tarifas mensuales (sin créditos): cada socio
-- puede adherirse a un plan; si no tiene, paga la cuota estándar definida en
-- app_settings.default_monthly_fee (editable por el admin, 60 € por defecto).
--
-- Los ingresos por cuotas se calculan EN VIVO sobre los socios activos
-- (member_income), así que activar/inactivar un socio o cambiarle el plan
-- recalcula el total automáticamente.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Planes (tarifas mensuales configurables por el admin)
-- ---------------------------------------------------------------------------
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 60),
  monthly_price numeric(8, 2) not null check (monthly_price >= 0),
  description text,
  created_at timestamptz not null default now()
);

alter table public.plans enable row level security;

drop policy if exists "Los socios ven los planes" on public.plans;
create policy "Los socios ven los planes"
  on public.plans for select
  to authenticated
  using (true);

drop policy if exists "El admin gestiona los planes" on public.plans;
create policy "El admin gestiona los planes"
  on public.plans for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on public.plans to authenticated;
grant all on public.plans to service_role;

-- Adhesión del socio a un plan (opcional)
alter table public.profiles
  add column if not exists plan_id uuid references public.plans (id) on delete set null;

-- Cuota estándar mensual para socios sin plan (editable desde Configuración)
alter table public.app_settings
  add column if not exists default_monthly_fee numeric(8, 2) not null default 60
  check (default_monthly_fee >= 0);

-- ---------------------------------------------------------------------------
-- Listado de socios para el admin, ahora con su plan
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
  created_at timestamptz
)
language sql
security definer set search_path = public
stable
as $$
  select p.id, p.member_no, p.role, p.email, p.first_name, p.last_name, p.phone,
         (u.email_confirmed_at is not null) as activated,
         p.membership_active, p.plan_id, pl.name as plan_name, u.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.plans pl on pl.id = p.plan_id
  where public.is_admin()
  order by p.member_no;
$$;

grant execute on function public.list_members() to authenticated;

-- ---------------------------------------------------------------------------
-- Ingresos mensuales por cuotas: un apunte por socio activo (no admin).
-- Con plan → precio del plan; sin plan → cuota estándar. Solo admin.
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
  order by 2;
$$;

grant execute on function public.member_income() to authenticated;
