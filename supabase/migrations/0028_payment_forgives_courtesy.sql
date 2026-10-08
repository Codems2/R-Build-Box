-- ===========================================================================
-- Al registrar el pago, las clases de cortesía quedan perdonadas
--
-- Problema: un socio con el mes vencido gastaba sus clases de cortesía y, al
-- registrarle el pago, se le penalizaba DOS VECES por las mismas clases:
--   1. esas reservas ya contaban en el consumo de su semana, y
--   2. además se guardaban como class_debt, que le recortaba el cupo semanal.
-- Resultado: pagaba y seguía sin poder reservar.
--
-- Ahora, al registrar el pago, esas clases de cortesía se compensan con un
-- ajuste positivo en la fecha de cada una, de modo que el contador vuelve a 0,
-- y ya no se arrastra ninguna deuda de clases (class_debt queda a 0).
--
-- El cálculo es idempotente: los ajustes ya existentes en esas fechas (por
-- ejemplo, los que el admin diera a mano) se descuentan, así que registrar el
-- pago dos veces no regala clases de más.
-- ===========================================================================

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
  v_reset int := 0;
  v_reason constant text := 'Clases de cortesía perdonadas al registrar el pago';
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  select * into v_prof from public.profiles where id = p_member_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_prof.role = 'admin' then raise exception 'IS_ADMIN'; end if;

  v_ref := coalesce(p_paid_at, v_today);

  -- Estaba en cortesía: se le perdonan las clases que tomó con el mes vencido.
  -- Un ajuste por fecha, descontando lo ya acreditado en esa misma fecha.
  if v_prof.paid_until is not null and v_prof.paid_until < v_today then
    with cortesia as (
      select b.class_date, count(*)::int as reservas
      from public.bookings b
      where b.user_id = p_member_id
        and b.status = 'booked'
        and b.class_date > v_prof.paid_until
      group by b.class_date
    ),
    ya_acreditado as (
      select c.credit_date, sum(c.amount)::int as acreditado
      from public.class_credits c
      where c.user_id = p_member_id
        and c.credit_date > v_prof.paid_until
      group by c.credit_date
    ),
    pendiente as (
      select k.class_date,
             least(k.reservas - coalesce(y.acreditado, 0), 20) as amount
      from cortesia k
      left join ya_acreditado y on y.credit_date = k.class_date
      where k.reservas - coalesce(y.acreditado, 0) > 0
    ),
    insertados as (
      insert into public.class_credits (user_id, credit_date, amount, reason, created_by)
      select p_member_id, p.class_date, p.amount, v_reason, auth.uid()
      from pendiente p
      returning amount
    )
    select coalesce(sum(amount), 0)::int into v_reset from insertados;
  end if;

  -- Mes rodante: desde el vencimiento actual si aún es válido, o desde la fecha del pago
  v_base := greatest(coalesce(v_prof.paid_until, v_ref), v_ref);
  v_new := (v_base + interval '1 month')::date;

  -- Ya no se arrastra deuda de clases: la cortesía se perdona al pagar
  update public.profiles
    set membership_active = true, paid_until = v_new, class_debt = 0
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
    'ok', true,
    'paid_until', v_new,
    'income_created', v_income,
    'courtesy_reset', v_reset,
    -- Se mantiene la clave antigua a 0: ya no se descuentan del mes siguiente
    'courtesy_deducted', 0
  );
end;
$$;

grant execute on function public.register_payment(uuid, boolean, numeric, date) to authenticated;
