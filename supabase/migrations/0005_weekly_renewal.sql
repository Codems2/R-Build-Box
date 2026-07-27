-- ===========================================================================
-- Renovación semanal de créditos (socios activos)
--
-- Cada lunes, los socios activos recuperan los créditos de su plan. El reset
-- solo ocurre una vez por semana (guardado con credits_renewed_at), de modo
-- que ejecutarlo de más no vuelve a resetear a mitad de semana.
-- ===========================================================================

create or replace function public.renew_weekly_credits()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_rows integer;
begin
  update public.profiles p
  set credits = pl.weekly_credits,
      credits_renewed_at = current_date
  from public.plans pl
  where p.plan_id = pl.id
    and p.membership_active
    and (p.credits_renewed_at is null
         or p.credits_renewed_at < date_trunc('week', current_date)::date);
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- Programación semanal con pg_cron: cada lunes a las 04:00 UTC
create extension if not exists pg_cron;

select cron.unschedule('renovar-creditos-semanal')
where exists (select 1 from cron.job where jobname = 'renovar-creditos-semanal');

select cron.schedule(
  'renovar-creditos-semanal',
  '0 4 * * 1',
  $$select public.renew_weekly_credits();$$
);
