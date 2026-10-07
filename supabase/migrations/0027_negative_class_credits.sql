-- ===========================================================================
-- Quitar clases a un socio (ajuste negativo)
--
-- class_credits ya restaba clases del consumo de la semana y del mes. Ahora el
-- importe puede ser negativo, que es el caso contrario: le suma consumo, o sea
-- le quita una clase disponible (p. ej. vino sin reservar y se le cobra).
--
-- El cálculo no cambia: consumo = reservas - suma(ajustes), acotado a 0. Con un
-- ajuste de -1 el consumo sube en 1 y le queda una clase menos esa semana.
-- ===========================================================================

alter table public.class_credits drop constraint if exists class_credits_amount_check;
alter table public.class_credits add constraint class_credits_amount_check
  check (amount between -20 and 20 and amount <> 0);

comment on column public.class_credits.amount is
  'Positivo = se le devuelve una clase; negativo = se le quita una clase.';

-- grant_class_credit: acepta importes negativos (0 sigue sin tener sentido)
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
  if p_amount is null or p_amount = 0 or p_amount < -20 or p_amount > 20 then
    raise exception 'BAD_AMOUNT';
  end if;

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

grant execute on function public.grant_class_credit(uuid, int, date, text) to authenticated;
