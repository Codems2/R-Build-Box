-- ===========================================================================
-- Facturas emitidas a los socios (generadas desde Economía)
--
-- · billing_settings: datos fiscales del emisor (nombre, NIF y domicilio).
--   Tabla aparte de app_settings porque esta la pueden leer los socios y estos
--   datos solo los necesita el admin. Se rellenan desde Configuración: no van
--   en el código porque el repositorio es público.
--
-- · issued_invoices: cada factura con una FOTO de los datos del momento
--   (emisor, cliente, líneas e importes). Si mañana cambia el nombre del socio
--   o el precio de un plan, la factura ya emitida no cambia.
--
-- · Numeración correlativa por año (serie F2026, F2027…), asignada de forma
--   atómica en issue_invoice: dos admins a la vez nunca obtienen el mismo
--   número ni dejan huecos. Las facturas no se borran (una factura emitida
--   solo se corrige con otra rectificativa).
--
-- · Los precios de los planes son precios finales (IVA incluido, como se
--   anuncian al público): la factura desglosa base imponible + IVA del 21 %.
--
-- · El PDF se genera en el navegador y se guarda en el bucket privado
--   `invoices` (emitidas/<año>/<número>.pdf); su ruta queda en pdf_path.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Datos fiscales del emisor (una sola fila)
-- ---------------------------------------------------------------------------
create table if not exists public.billing_settings (
  id boolean primary key default true check (id),
  issuer_name text check (issuer_name is null or char_length(trim(issuer_name)) between 1 and 120),
  issuer_nif text check (issuer_nif is null or char_length(trim(issuer_nif)) between 3 and 20),
  issuer_address1 text check (issuer_address1 is null or char_length(issuer_address1) <= 120),
  issuer_address2 text check (issuer_address2 is null or char_length(issuer_address2) <= 120),
  updated_at timestamptz not null default now()
);

insert into public.billing_settings (id) values (true) on conflict (id) do nothing;

alter table public.billing_settings enable row level security;

drop policy if exists "Solo el admin ve y edita los datos de facturación" on public.billing_settings;
create policy "Solo el admin ve y edita los datos de facturación"
  on public.billing_settings for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, update on public.billing_settings to authenticated;
grant all on public.billing_settings to service_role;

-- ---------------------------------------------------------------------------
-- Contador por año y facturas emitidas
-- ---------------------------------------------------------------------------
create table if not exists public.invoice_counters (
  year int primary key check (year between 2000 and 2999),
  last_number int not null check (last_number >= 0)
);

alter table public.invoice_counters enable row level security;
-- Sin políticas: solo se toca desde issue_invoice (security definer)
grant all on public.invoice_counters to service_role;

create table if not exists public.issued_invoices (
  id uuid primary key default gen_random_uuid(),
  series text not null,
  number int not null check (number > 0),
  code text not null unique,
  issue_date date not null,
  member_id uuid references public.profiles (id) on delete set null,
  -- Fotos de los datos en el momento de emitir
  issuer jsonb not null,
  client jsonb not null,
  lines jsonb not null,
  vat_rate numeric(5, 2) not null,
  base numeric(10, 2) not null,
  vat numeric(10, 2) not null,
  total numeric(10, 2) not null check (total > 0),
  pdf_path text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (series, number)
);

create index if not exists issued_invoices_date_idx
  on public.issued_invoices (issue_date desc, number desc);

alter table public.issued_invoices enable row level security;

drop policy if exists "Solo el admin ve las facturas emitidas" on public.issued_invoices;
create policy "Solo el admin ve las facturas emitidas"
  on public.issued_invoices for select
  to authenticated
  using (public.is_admin());

-- Ni insert, ni update, ni delete directos: solo a través de las funciones
grant select on public.issued_invoices to authenticated;
grant all on public.issued_invoices to service_role;

-- ---------------------------------------------------------------------------
-- Emitir una factura
--   p_items: [{ "plan_id": uuid | null, "quantity": int }]
--   plan_id null = cuota estándar (app_settings.default_monthly_fee)
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
  v_bill public.billing_settings%rowtype;
  v_prof public.profiles%rowtype;
  v_year int;
  v_last_date date;
  v_number int;
  v_series text;
  v_code text;
  v_item record;
  v_plan public.plans%rowtype;
  v_price numeric;
  v_concept text;
  v_detail text;
  v_line_total numeric;
  v_line_base numeric;
  v_lines jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_base numeric := 0;
  v_name text;
  v_row public.issued_invoices%rowtype;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;

  select * into v_bill from public.billing_settings where id;
  if not found or coalesce(trim(v_bill.issuer_name), '') = '' or coalesce(trim(v_bill.issuer_nif), '') = '' then
    raise exception 'ISSUER_MISSING';
  end if;

  select * into v_prof from public.profiles where id = p_member_id;
  if not found then raise exception 'MEMBER_NOT_FOUND'; end if;

  if p_issue_date is null or p_issue_date > v_today then raise exception 'DATE_IN_FUTURE'; end if;
  v_year := extract(year from p_issue_date)::int;

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
      v_concept := upper(left(trim(v_plan.name), 1)) || substr(trim(v_plan.name), 2);
      v_detail := nullif(trim(coalesce(v_plan.description, '')), '');
      if v_detail is not null then
        v_detail := upper(left(v_detail, 1)) || substr(v_detail, 2);
      end if;
    end if;

    if v_price is null or v_price <= 0 then raise exception 'ZERO_PRICE'; end if;

    -- Precio final con IVA incluido -> base de la línea redondeada al céntimo
    v_line_total := round(v_price * v_item.quantity, 2);
    v_line_base := round(v_line_total / (1 + v_vat / 100), 2);
    v_total := v_total + v_line_total;
    v_base := v_base + v_line_base;

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'concept', v_concept,
      'detail', v_detail,
      'quantity', v_item.quantity,
      'unit_price', round(v_price / (1 + v_vat / 100), 4),
      'unit_price_with_vat', v_price,
      'vat_rate', v_vat,
      'base', v_line_base,
      'total', v_line_total
    ));
  end loop;

  -- Numeración correlativa: bloquea el contador del año mientras se asigna
  insert into public.invoice_counters as c (year, last_number)
  values (v_year, 1)
  on conflict (year) do update set last_number = c.last_number + 1
  returning last_number into v_number;

  -- Las facturas de una serie deben seguir el orden de las fechas
  select max(issue_date) into v_last_date
  from public.issued_invoices
  where series = 'F' || v_year;
  if v_last_date is not null and p_issue_date < v_last_date then
    raise exception 'DATE_BEFORE_LAST:%', to_char(v_last_date, 'DD/MM/YYYY');
  end if;

  v_series := 'F' || v_year;
  v_code := v_series || '-' || lpad(v_number::text, 5, '0');
  v_name := trim(concat_ws(' ', nullif(trim(v_prof.first_name), ''), nullif(trim(v_prof.last_name), '')));
  if v_name = '' then v_name := coalesce(nullif(trim(v_prof.email), ''), 'Cliente'); end if;

  insert into public.issued_invoices (
    series, number, code, issue_date, member_id, issuer, client, lines,
    vat_rate, base, vat, total, created_by
  ) values (
    v_series, v_number, v_code, p_issue_date, p_member_id,
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
    v_lines,
    v_vat, v_base, v_total - v_base, v_total, auth.uid()
  )
  returning * into v_row;

  return row_to_json(v_row);
end;
$$;

revoke all on function public.issue_invoice(uuid, date, jsonb) from public;
grant execute on function public.issue_invoice(uuid, date, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Guardar la ruta del PDF ya subido al bucket
-- ---------------------------------------------------------------------------
create or replace function public.attach_invoice_pdf(p_invoice_id uuid, p_path text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if p_path is null or p_path !~ '^emitidas/[0-9]{4}/F[0-9]{4}-[0-9]{5}\.pdf$' then
    raise exception 'BAD_PATH';
  end if;
  update public.issued_invoices set pdf_path = p_path where id = p_invoice_id;
  if not found then raise exception 'INVOICE_NOT_FOUND'; end if;
end;
$$;

revoke all on function public.attach_invoice_pdf(uuid, text) from public;
grant execute on function public.attach_invoice_pdf(uuid, text) to authenticated;
