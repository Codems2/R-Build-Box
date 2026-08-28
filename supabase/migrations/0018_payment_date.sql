-- ===========================================================================
-- Fecha de pago opcional al registrar una mensualidad
--
-- El admin puede indicar la fecha real del pago (p. ej. si se le pasó
-- registrarlo y lo hace a posteriori). Esa fecha:
--   · es la base del mes rodante (paid_until = fecha_pago + 1 mes, o extiende
--     la cobertura vigente si aún no ha vencido), y
--   · es la fecha del ingreso creado en Economía, para que caiga en el mes
--     correcto.
-- Si no se indica, se usa hoy (comportamiento anterior intacto).
-- ===========================================================================

drop function if exists public.register_payment(uuid, boolean, numeric);

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
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  select * into v_prof from public.profiles where id = p_member_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_prof.role = 'admin' then raise exception 'IS_ADMIN'; end if;

  -- Fecha de referencia del pago: la indicada o, por defecto, hoy
  v_ref := coalesce(p_paid_at, v_today);

  -- Mes rodante: desde el vencimiento actual si aún es válido, o desde la fecha del pago
  v_base := greatest(coalesce(v_prof.paid_until, v_ref), v_ref);
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
        values ('income', 'Cuota · ' || coalesce(v_name, v_prof.email, 'Socio'), round(v_amount, 2), v_ref);
      v_income := true;
    end if;
  end if;

  return json_build_object('ok', true, 'paid_until', v_new, 'income_created', v_income);
end;
$$;

grant execute on function public.register_payment(uuid, boolean, numeric, date) to authenticated;
