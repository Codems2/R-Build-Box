-- ===========================================================================
-- Finanzas del box: ingresos y gastos (solo admin)
--
-- Registro manual de movimientos: cuotas cobradas, material, alquiler, etc.
-- Cada apunte es un ingreso o un gasto con concepto, importe y fecha.
-- Solo los administradores pueden ver y gestionar estos datos.
-- ===========================================================================

create table if not exists public.finance_entries (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('income', 'expense')),
  concept text not null check (char_length(trim(concept)) between 1 and 120),
  amount numeric(10, 2) not null check (amount > 0),
  entry_date date not null default (now() at time zone 'Europe/Madrid')::date,
  created_at timestamptz not null default now()
);

create index if not exists finance_entries_date_idx
  on public.finance_entries (entry_date desc);

alter table public.finance_entries enable row level security;

drop policy if exists "Solo el admin gestiona las finanzas" on public.finance_entries;
create policy "Solo el admin gestiona las finanzas"
  on public.finance_entries for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on public.finance_entries to authenticated;
grant all on public.finance_entries to service_role;
