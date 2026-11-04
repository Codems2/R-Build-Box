-- ===========================================================================
-- Facturas de asesorías y datos fiscales de los socios
--
-- · profiles.nif / address1 / address2: NIF y dirección del socio. Se rellenan
--   desde el formulario de factura (pestaña Box Thai) y salen en todas sus
--   facturas, también en las de las cuotas desde la lista de socios.
--
-- · Facturas de asesorías (pestaña Asesorías): cliente, conceptos y precios
--   escritos a mano. Los precios van SIN IVA y se les suma el 21 %. Mismo
--   emisor que el box pero con su propia serie: A2026-00001, A2027-00001…
--
-- · La numeración pasa a llevarse por serie (F2026, A2026…) en
--   invoice_series_counters, para que cada serie sea correlativa por separado.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Datos fiscales del socio
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists nif text check (nif is null or char_length(nif) between 3 and 20),
  add column if not exists address1 text check (address1 is null or char_length(address1) <= 120),
  add column if not exists address2 text check (address2 is null or char_length(address2) <= 120);

-- ---------------------------------------------------------------------------
-- Tipo de factura y contadores por serie
-- ---------------------------------------------------------------------------
alter table public.issued_invoices
  add column if not exists kind text not null default 'box' check (kind in ('box', 'asesoria'));

create table if not exists public.invoice_series_counters (
  series text primary key check (series ~ '^[A-Z][0-9]{4}$'),
  last_number int not null check (last_number >= 0)
);

alter table public.invoice_series_counters enable row level security;
-- Sin políticas: solo se toca desde create_invoice_row (security definer)
grant all on public.invoice_series_counters to service_role;

-- Lo que llevara el contador antiguo (por año, solo serie F) pasa al nuevo
insert into public.invoice_series_counters (series, last_number)
select 'F' || year, last_number from public.invoice_counters
on conflict (series) do update
  set last_number = greatest(public.invoice_series_counters.last_number, excluded.last_number);

-- ---------------------------------------------------------------------------
-- Alta de una factura en su serie (común a todas las formas de emitir)
--   El llamante ya ha calculado líneas e importes y la foto del cliente.
-- ---------------------------------------------------------------------------
create or replace function public.create_invoice_row(
  p_prefix text,
  p_kind text,
  p_member_id uuid,
  p_client jsonb,
  p_issue_date date,
  p_lines jsonb,
  p_base numeric,
  p_vat numeric,
  p_total numeric
)
returns public.issued_invoices
language plpgsql
security definer set search_path = public
as $$
declare
  v_vat_rate constant numeric := 21;
  v_bill public.billing_settings%rowtype;
  v_series text := p_prefix || extract(year from p_issue_date)::int;
  v_last_date date;
  v_number int;
  v_row public.issued_invoices%rowtype;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if p_prefix !~ '^[A-Z]$' or p_kind not in ('box', 'asesoria') then raise exception 'BAD_SERIES'; end if;

  select * into v_bill from public.billing_settings where id;
  if not found or coalesce(trim(v_bill.issuer_name), '') = '' or coalesce(trim(v_bill.issuer_nif), '') = '' then
    raise exception 'ISSUER_MISSING';
  end if;

  if p_lines is null or jsonb_array_length(p_lines) = 0 then raise exception 'NO_ITEMS'; end if;
  if p_total is null or p_total <= 0 then raise exception 'ZERO_PRICE'; end if;

  -- Numeración correlativa por serie: bloquea su contador mientras se asigna
  insert into public.invoice_series_counters as c (series, last_number)
  values (v_series, 1)
  on conflict (series) do update set last_number = c.last_number + 1
  returning last_number into v_number;

  -- Las facturas de una serie deben seguir el orden de las fechas
  select max(issue_date) into v_last_date from public.issued_invoices where series = v_series;
  if v_last_date is not null and p_issue_date < v_last_date then
    raise exception 'DATE_BEFORE_LAST:%', to_char(v_last_date, 'DD/MM/YYYY');
  end if;

  insert into public.issued_invoices (
    series, number, code, kind, issue_date, member_id, issuer, client, lines,
    vat_rate, base, vat, total, created_by
  ) values (
    v_series, v_number, v_series || '-' || lpad(v_number::text, 5, '0'), p_kind, p_issue_date, p_member_id,
    jsonb_build_object(
      'name', trim(v_bill.issuer_name),
      'nif', upper(trim(v_bill.issuer_nif)),
      'address1', nullif(trim(coalesce(v_bill.issuer_address1, '')), ''),
      'address2', nullif(trim(coalesce(v_bill.issuer_address2, '')), '')
    ),
    p_client,
    p_lines,
    v_vat_rate, p_base, p_vat, p_total, auth.uid()
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.create_invoice_row(text, text, uuid, jsonb, date, jsonb, numeric, numeric, numeric)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Facturas del box (formulario y cuotas): ahora con NIF y dirección del socio
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
  v_prof public.profiles%rowtype;
  v_name text;
  v_total numeric;
  v_base numeric;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;

  select * into v_prof from public.profiles where id = p_member_id;
  if not found then raise exception 'MEMBER_NOT_FOUND'; end if;

  if p_lines is null or jsonb_array_length(p_lines) = 0 then raise exception 'NO_ITEMS'; end if;
  select sum((l ->> 'total')::numeric), sum((l ->> 'base')::numeric)
    into v_total, v_base
  from jsonb_array_elements(p_lines) l;

  v_name := trim(concat_ws(' ', nullif(trim(v_prof.first_name), ''), nullif(trim(v_prof.last_name), '')));
  if v_name = '' then v_name := coalesce(nullif(trim(v_prof.email), ''), 'Cliente'); end if;

  -- Precios con IVA incluido: el IVA es la diferencia con la base
  return public.create_invoice_row(
    'F', 'box', p_member_id,
    -- Solo los datos que el socio tenga rellenos
    jsonb_strip_nulls(jsonb_build_object(
      'name', v_name,
      'nif', nullif(upper(trim(coalesce(v_prof.nif, ''))), ''),
      'address1', nullif(trim(coalesce(v_prof.address1, '')), ''),
      'address2', nullif(trim(coalesce(v_prof.address2, '')), ''),
      'phone', nullif(trim(coalesce(v_prof.phone, '')), ''),
      'email', nullif(trim(coalesce(v_prof.email, '')), '')
    )),
    p_issue_date, p_lines, v_base, v_total - v_base, v_total
  );
end;
$$;

revoke all on function public.create_issued_invoice(uuid, date, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Factura de asesoría: todo escrito a mano, precios sin IVA (+21 %)
--   p_client: { name, nif, address1, address2 }
--   p_lines:  [{ concept, quantity, price }]
-- ---------------------------------------------------------------------------
create or replace function public.issue_manual_invoice(
  p_issue_date date,
  p_client jsonb,
  p_lines jsonb
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Europe/Madrid')::date;
  v_vat constant numeric := 21;
  v_name text := trim(regexp_replace(coalesce(p_client ->> 'name', ''), '\s+', ' ', 'g'));
  v_nif text := upper(regexp_replace(coalesce(p_client ->> 'nif', ''), '[\s-]', '', 'g'));
  v_addr1 text := trim(regexp_replace(coalesce(p_client ->> 'address1', ''), '\s+', ' ', 'g'));
  v_addr2 text := trim(regexp_replace(coalesce(p_client ->> 'address2', ''), '\s+', ' ', 'g'));
  v_l jsonb;
  v_concept text;
  v_qty numeric;
  v_price numeric;
  v_line_base numeric;
  v_lines jsonb := '[]'::jsonb;
  v_base numeric := 0;
  v_vat_amount numeric;
  v_row public.issued_invoices%rowtype;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;

  if not exists (
    select 1 from public.billing_settings
    where id and coalesce(trim(issuer_name), '') <> '' and coalesce(trim(issuer_nif), '') <> ''
  ) then
    raise exception 'ISSUER_MISSING';
  end if;

  if p_issue_date is null or p_issue_date > v_today then raise exception 'DATE_IN_FUTURE'; end if;

  -- Factura completa: nombre, NIF y dirección del cliente son obligatorios
  if char_length(v_name) not between 1 and 120 then raise exception 'CLIENT_NAME_MISSING'; end if;
  if char_length(v_nif) not between 3 and 20 then raise exception 'CLIENT_NIF_MISSING'; end if;
  if char_length(v_addr1) not between 1 and 120 then raise exception 'CLIENT_ADDRESS_MISSING'; end if;
  if char_length(v_addr2) > 120 then raise exception 'CLIENT_ADDRESS_MISSING'; end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'NO_ITEMS';
  end if;
  if jsonb_array_length(p_lines) > 10 then raise exception 'TOO_MANY_ITEMS'; end if;

  for v_l in select * from jsonb_array_elements(p_lines)
  loop
    v_concept := trim(regexp_replace(coalesce(v_l ->> 'concept', ''), '\s+', ' ', 'g'));
    if char_length(v_concept) not between 1 and 120 then raise exception 'BAD_CONCEPT'; end if;

    begin
      v_qty := (v_l ->> 'quantity')::numeric;
      v_price := (v_l ->> 'price')::numeric;
    exception when others then
      raise exception 'BAD_AMOUNT';
    end;
    if v_qty is null or v_qty <= 0 or v_qty > 9999 or v_qty <> round(v_qty, 2) then
      raise exception 'BAD_QUANTITY';
    end if;
    if v_price is null or v_price <= 0 or v_price > 999999 then raise exception 'BAD_PRICE'; end if;
    v_price := round(v_price, 2);

    v_line_base := round(v_qty * v_price, 2);
    v_base := v_base + v_line_base;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'concept', v_concept,
      'detail', null,
      'quantity', v_qty,
      'unit_price', v_price,
      'unit_price_with_vat', round(v_price * (1 + v_vat / 100), 4),
      'vat_rate', v_vat,
      'base', v_line_base,
      'total', round(v_line_base * (1 + v_vat / 100), 2)
    ));
  end loop;

  -- Precios sin IVA: el IVA se calcula sobre la base total
  v_vat_amount := round(v_base * v_vat / 100, 2);

  v_row := public.create_invoice_row(
    'A', 'asesoria', null,
    jsonb_strip_nulls(jsonb_build_object(
      'name', v_name,
      'nif', v_nif,
      'address1', v_addr1,
      'address2', nullif(v_addr2, '')
    )),
    p_issue_date, v_lines, v_base, v_vat_amount, v_base + v_vat_amount
  );
  return row_to_json(v_row);
end;
$$;

revoke all on function public.issue_manual_invoice(date, jsonb, jsonb) from public;
grant execute on function public.issue_manual_invoice(date, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- El PDF de las asesorías se guarda junto al resto (serie A)
-- ---------------------------------------------------------------------------
create or replace function public.attach_invoice_pdf(p_invoice_id uuid, p_path text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if p_path is null or p_path !~ '^emitidas/[0-9]{4}/[A-Z][0-9]{4}-[0-9]{5}\.pdf$' then
    raise exception 'BAD_PATH';
  end if;
  update public.issued_invoices set pdf_path = p_path where id = p_invoice_id;
  if not found then raise exception 'INVOICE_NOT_FOUND'; end if;
end;
$$;

-- El contador por año ya no se usa
drop table if exists public.invoice_counters;
