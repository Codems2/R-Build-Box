-- ===========================================================================
-- Facturar las cuotas del mes desde la lista de socios
--
-- · finance_entries.member_id: cada cuota queda ligada a su socio. Hasta ahora
--   solo se sabía por el concepto («Cuota · Nombre Apellidos»), así que:
--     - las cuotas existentes se enlazan aquí por ese nombre, y
--     - un trigger enlaza las nuevas (las de «Registrar pago» y las que se
--       apunten a mano con el mismo formato).
--   Solo se enlaza si el nombre corresponde a UN único socio. Si después se le
--   cambia el nombre al socio, la cuota sigue enlazada.
--
-- · finance_entries.issued_invoice_id: la factura que ya incluye esa cuota.
--   Una cuota facturada no vuelve a entrar en otra factura.
--
-- · issue_invoice_from_payments(socio): factura con fecha de hoy todas las
--   cuotas del mes en curso aún sin facturar (una línea por cuota).
--
-- · month_payments_status(): para la lista de socios, qué cuotas del mes tiene
--   cada uno pendientes de facturar y qué facturas se le han hecho ya.
--
-- · La parte común de emitir (emisor, numeración correlativa, foto del
--   cliente) pasa a create_issued_invoice, que usan las dos formas de emitir.
-- ===========================================================================

alter table public.finance_entries
  add column if not exists member_id uuid references public.profiles (id) on delete set null,
  add column if not exists issued_invoice_id uuid references public.issued_invoices (id) on delete set null;

create index if not exists finance_entries_member_idx
  on public.finance_entries (member_id, entry_date);

-- ---------------------------------------------------------------------------
-- Nombre normalizado (sin tildes, minúsculas, espacios simples) para comparar
-- ---------------------------------------------------------------------------
create or replace function public.norm_person_name(p text)
returns text
language sql
immutable
as $$
  select nullif(lower(translate(
    regexp_replace(trim(coalesce(p, '')), '\s+', ' ', 'g'),
    'ÁÀÂÄÃÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÑÇáàâäãéèêëíìîïóòôöõúùûüñç',
    'AAAAAEEEEIIIIOOOOOUUUUNCaaaaaeeeeiiiiooooouuuunc'
  )), '');
$$;

-- Nombre del socio en un concepto de cuota: «Cuota · Ana Pérez» -> «ana perez»
create or replace function public.cuota_person_name(p_concept text)
returns text
language sql
immutable
as $$
  select case
    when public.norm_person_name(p_concept) like 'cuota%' and position('·' in p_concept) > 0
      then public.norm_person_name(regexp_replace(p_concept, '^.*·', ''))
  end;
$$;

-- Socio al que corresponde un concepto de cuota (null si no hay o hay varios)
create or replace function public.member_for_cuota(p_concept text)
returns uuid
language sql
stable
security definer set search_path = public
as $$
  select case when count(*) = 1 then (array_agg(p.id))[1] end
  from public.profiles p
  where public.cuota_person_name(p_concept) is not null
    and (
      public.norm_person_name(concat_ws(' ', nullif(trim(p.first_name), ''), nullif(trim(p.last_name), '')))
        = public.cuota_person_name(p_concept)
      or public.norm_person_name(p.email) = public.cuota_person_name(p_concept)
    );
$$;

revoke all on function public.member_for_cuota(text) from public, anon, authenticated;

-- Primera letra en mayúscula
create or replace function public.cap_first(p text)
returns text
language sql
immutable
as $$
  select case when p is null or p = '' then p else upper(left(p, 1)) || substr(p, 2) end;
$$;

-- ---------------------------------------------------------------------------
-- Enlace automático de las cuotas con su socio
-- ---------------------------------------------------------------------------
create or replace function public.trg_finance_link_member()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Una cuota ya facturada no se re-enlaza
  if new.issued_invoice_id is not null then return new; end if;
  if new.kind <> 'income' then
    new.member_id := null;
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.member_id is null then new.member_id := public.member_for_cuota(new.concept); end if;
  elsif new.concept is distinct from old.concept or new.kind is distinct from old.kind then
    new.member_id := public.member_for_cuota(new.concept);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_finance_link_member on public.finance_entries;
create trigger trg_finance_link_member
  before insert or update on public.finance_entries
  for each row execute function public.trg_finance_link_member();

-- Cuotas que ya existían: se enlazan por el nombre del concepto
update public.finance_entries
set member_id = public.member_for_cuota(concept)
where kind = 'income' and member_id is null;

-- ---------------------------------------------------------------------------
-- Parte común: emisor, numeración, foto del cliente e inserción
--   p_lines ya calculadas (concept, detail, quantity, unit_price,
--   unit_price_with_vat, vat_rate, base, total)
-- ---------------------------------------------------------------------------
create or replace function public.create_issued_invoice(
  p_member_id uuid,
  p_issue_date date,
  p_lines jsonb
)
returns public.issued_invoices
language plpgsql
security definer set search_path = public
as $$
declare
  v_vat constant numeric := 21;
  v_bill public.billing_settings%rowtype;
  v_prof public.profiles%rowtype;
  v_year int := extract(year from p_issue_date)::int;
  v_series text := 'F' || extract(year from p_issue_date)::int;
  v_last_date date;
  v_number int;
  v_name text;
  v_total numeric;
  v_base numeric;
  v_row public.issued_invoices%rowtype;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;

  select * into v_bill from public.billing_settings where id;
  if not found or coalesce(trim(v_bill.issuer_name), '') = '' or coalesce(trim(v_bill.issuer_nif), '') = '' then
    raise exception 'ISSUER_MISSING';
  end if;

  select * into v_prof from public.profiles where id = p_member_id;
  if not found then raise exception 'MEMBER_NOT_FOUND'; end if;

  if p_lines is null or jsonb_array_length(p_lines) = 0 then raise exception 'NO_ITEMS'; end if;
  select sum((l ->> 'total')::numeric), sum((l ->> 'base')::numeric)
    into v_total, v_base
  from jsonb_array_elements(p_lines) l;
  if v_total is null or v_total <= 0 then raise exception 'ZERO_PRICE'; end if;

  -- Numeración correlativa: bloquea el contador del año mientras se asigna
  insert into public.invoice_counters as c (year, last_number)
  values (v_year, 1)
  on conflict (year) do update set last_number = c.last_number + 1
  returning last_number into v_number;

  -- Las facturas de una serie deben seguir el orden de las fechas
  select max(issue_date) into v_last_date from public.issued_invoices where series = v_series;
  if v_last_date is not null and p_issue_date < v_last_date then
    raise exception 'DATE_BEFORE_LAST:%', to_char(v_last_date, 'DD/MM/YYYY');
  end if;

  v_name := trim(concat_ws(' ', nullif(trim(v_prof.first_name), ''), nullif(trim(v_prof.last_name), '')));
  if v_name = '' then v_name := coalesce(nullif(trim(v_prof.email), ''), 'Cliente'); end if;

  insert into public.issued_invoices (
    series, number, code, issue_date, member_id, issuer, client, lines,
    vat_rate, base, vat, total, created_by
  ) values (
    v_series, v_number, v_series || '-' || lpad(v_number::text, 5, '0'), p_issue_date, p_member_id,
    jsonb_build_object(
      'name', trim(v_bill.issuer_name),
      'nif', upper(trim(v_bill.issuer_nif)),
      'address1', nullif(trim(coalesce(v_bill.issuer_address1, '')), ''),
      'address2', nullif(trim(coalesce(v_bill.issuer_address2, '')), '')
    ),
    -- Solo los datos que el socio tenga rellenos
    jsonb_strip_nulls(jsonb_build_object(
      'name', v_name,
      'phone', nullif(trim(coalesce(v_prof.phone, '')), ''),
      'email', nullif(trim(coalesce(v_prof.email, '')), '')
    )),
    p_lines,
    v_vat, v_base, v_total - v_base, v_total, auth.uid()
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.create_issued_invoice(uuid, date, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Emitir eligiendo productos (formulario de Economía): mismo comportamiento
-- que en 0029, ahora apoyado en create_issued_invoice
-- ---------------------------------------------------------------------------
create or replace function public.issue_invoice(
  p_member_id uuid,
  p_issue_date date,
  p_items jsonb
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Europe/Madrid')::date;
  v_vat constant numeric := 21;
  v_item record;
  v_plan public.plans%rowtype;
  v_price numeric;
  v_concept text;
  v_detail text;
  v_line_total numeric;
  v_lines jsonb := '[]'::jsonb;
  v_row public.issued_invoices%rowtype;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;

  if not exists (
    select 1 from public.billing_settings
    where id and coalesce(trim(issuer_name), '') <> '' and coalesce(trim(issuer_nif), '') <> ''
  ) then
    raise exception 'ISSUER_MISSING';
  end if;

  if not exists (select 1 from public.profiles where id = p_member_id) then
    raise exception 'MEMBER_NOT_FOUND';
  end if;

  if p_issue_date is null or p_issue_date > v_today then raise exception 'DATE_IN_FUTURE'; end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'NO_ITEMS';
  end if;
  if jsonb_array_length(p_items) > 10 then raise exception 'TOO_MANY_ITEMS'; end if;

  -- Una línea por producto (si llega repetido, se suman las cantidades)
  for v_item in
    select nullif(e ->> 'plan_id', '')::uuid as plan_id,
           sum((e ->> 'quantity')::int) as quantity,
           min(ord) as ord
    from jsonb_array_elements(p_items) with ordinality as t(e, ord)
    group by 1
    order by 3
  loop
    if v_item.quantity is null or v_item.quantity < 1 or v_item.quantity > 99 then
      raise exception 'BAD_QUANTITY';
    end if;

    if v_item.plan_id is null then
      select default_monthly_fee into v_price from public.app_settings where id;
      v_concept := 'Cuota estándar';
      v_detail := 'Cuota mensual';
    else
      select * into v_plan from public.plans where id = v_item.plan_id;
      if not found then raise exception 'PLAN_NOT_FOUND'; end if;
      v_price := v_plan.monthly_price;
      v_concept := public.cap_first(trim(v_plan.name));
      v_detail := public.cap_first(nullif(trim(coalesce(v_plan.description, '')), ''));
    end if;

    if v_price is null or v_price <= 0 then raise exception 'ZERO_PRICE'; end if;

    -- Precio final con IVA incluido -> base de la línea redondeada al céntimo
    v_line_total := round(v_price * v_item.quantity, 2);
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'concept', v_concept,
      'detail', v_detail,
      'quantity', v_item.quantity,
      'unit_price', round(v_price / (1 + v_vat / 100), 4),
      'unit_price_with_vat', v_price,
      'vat_rate', v_vat,
      'base', round(v_line_total / (1 + v_vat / 100), 2),
      'total', v_line_total
    ));
  end loop;

  v_row := public.create_issued_invoice(p_member_id, p_issue_date, v_lines);
  return row_to_json(v_row);
end;
$$;

revoke all on function public.issue_invoice(uuid, date, jsonb) from public;
grant execute on function public.issue_invoice(uuid, date, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Facturar las cuotas del mes en curso de un socio (fecha: hoy)
-- ---------------------------------------------------------------------------
create or replace function public.issue_invoice_from_payments(p_member_id uuid)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Europe/Madrid')::date;
  v_vat constant numeric := 21;
  v_prof public.profiles%rowtype;
  v_plan public.plans%rowtype;
  v_fee numeric;
  v_e record;
  v_ids uuid[] := '{}';
  v_lines jsonb := '[]'::jsonb;
  v_pago text;
  v_concept text;
  v_detail text;
  v_row public.issued_invoices%rowtype;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;

  select * into v_prof from public.profiles where id = p_member_id;
  if not found then raise exception 'MEMBER_NOT_FOUND'; end if;
  select * into v_plan from public.plans where id = v_prof.plan_id;
  select default_monthly_fee into v_fee from public.app_settings where id;

  -- Cuotas del mes en curso sin facturar (bloqueadas: dos admins a la vez no
  -- pueden meter la misma cuota en dos facturas)
  for v_e in
    select fe.id, fe.amount, fe.entry_date
    from public.finance_entries fe
    where fe.kind = 'income'
      and fe.issued_invoice_id is null
      and fe.entry_date >= date_trunc('month', v_today)::date
      and fe.entry_date <= v_today
      and (fe.member_id = p_member_id
           or (fe.member_id is null and public.member_for_cuota(fe.concept) = p_member_id))
    order by fe.entry_date, fe.created_at
    for update
  loop
    v_ids := v_ids || v_e.id;
    v_pago := 'Pago del ' || to_char(v_e.entry_date, 'DD/MM/YYYY');

    -- Concepto según lo que paga: su plan, la cuota estándar o una cuota a secas
    if v_plan.id is not null and v_plan.monthly_price = v_e.amount then
      v_concept := public.cap_first(trim(v_plan.name));
      v_detail := concat_ws(' · ', public.cap_first(nullif(trim(coalesce(v_plan.description, '')), '')), v_pago);
    elsif v_plan.id is null and v_e.amount = v_fee then
      v_concept := 'Cuota estándar';
      v_detail := 'Cuota mensual · ' || v_pago;
    else
      v_concept := 'Cuota mensual';
      v_detail := v_pago;
    end if;

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'concept', v_concept,
      'detail', v_detail,
      'quantity', 1,
      'unit_price', round(v_e.amount / (1 + v_vat / 100), 4),
      'unit_price_with_vat', v_e.amount,
      'vat_rate', v_vat,
      'base', round(v_e.amount / (1 + v_vat / 100), 2),
      'total', round(v_e.amount, 2)
    ));
  end loop;

  if coalesce(array_length(v_ids, 1), 0) = 0 then raise exception 'NO_PAYMENTS'; end if;
  if array_length(v_ids, 1) > 10 then raise exception 'TOO_MANY_ITEMS'; end if;

  v_row := public.create_issued_invoice(p_member_id, v_today, v_lines);

  update public.finance_entries
  set issued_invoice_id = v_row.id, member_id = p_member_id
  where id = any (v_ids);

  return row_to_json(v_row);
end;
$$;

revoke all on function public.issue_invoice_from_payments(uuid) from public;
grant execute on function public.issue_invoice_from_payments(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Cuotas del mes de cada socio: pendientes de facturar y facturas ya hechas
-- ---------------------------------------------------------------------------
create or replace function public.month_payments_status()
returns table (member_id uuid, pending jsonb, invoiced jsonb)
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Europe/Madrid')::date;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;

  return query
  select f.mid,
         coalesce(
           jsonb_agg(
             jsonb_build_object('id', f.id, 'entry_date', f.entry_date, 'amount', f.amount, 'concept', f.concept)
             order by f.entry_date, f.created_at
           ) filter (where f.issued_invoice_id is null),
           '[]'::jsonb
         ),
         coalesce(jsonb_agg(distinct i.code) filter (where i.code is not null), '[]'::jsonb)
  from (
    select fe.id, fe.amount, fe.concept, fe.entry_date, fe.created_at, fe.issued_invoice_id,
           coalesce(fe.member_id, public.member_for_cuota(fe.concept)) as mid
    from public.finance_entries fe
    where fe.kind = 'income'
      and fe.entry_date >= date_trunc('month', v_today)::date
      and fe.entry_date <= v_today
  ) f
  left join public.issued_invoices i on i.id = f.issued_invoice_id
  where f.mid is not null
  group by f.mid;
end;
$$;

revoke all on function public.month_payments_status() from public;
grant execute on function public.month_payments_status() to authenticated;
