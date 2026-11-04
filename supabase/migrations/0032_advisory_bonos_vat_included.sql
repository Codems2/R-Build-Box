-- ===========================================================================
-- Asesorías deportivas: se facturan por BONOS con precio final (IVA incluido)
--
-- Corrige 0031, que trataba la asesoría como un servicio por horas con precio
-- sin IVA. Ahora, igual que las cuotas del box:
--   · cada línea es un bono (cantidad entera, de 1 a 99), y
--   · el precio escrito es lo que paga el cliente: la factura desglosa la base
--     imponible y el IVA del 21 % que ya lleva dentro.
-- Se mantiene su serie propia (A2026-00001…) y la obligación de nombre, NIF y
-- dirección del cliente.
-- ===========================================================================

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
  v_line_total numeric;
  v_line_base numeric;
  v_lines jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_base numeric := 0;
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
    -- Bonos enteros
    if v_qty is null or v_qty < 1 or v_qty > 99 or v_qty <> trunc(v_qty) then
      raise exception 'BAD_QUANTITY';
    end if;
    if v_price is null or v_price <= 0 or v_price > 999999 then raise exception 'BAD_PRICE'; end if;
    v_price := round(v_price, 2);

    -- Precio final con IVA incluido -> base de la línea redondeada al céntimo
    v_line_total := round(v_price * v_qty, 2);
    v_line_base := round(v_line_total / (1 + v_vat / 100), 2);
    v_total := v_total + v_line_total;
    v_base := v_base + v_line_base;

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'concept', v_concept,
      'detail', null,
      'quantity', v_qty::int,
      'unit_price', round(v_price / (1 + v_vat / 100), 4),
      'unit_price_with_vat', v_price,
      'vat_rate', v_vat,
      'base', v_line_base,
      'total', v_line_total
    ));
  end loop;

  v_row := public.create_invoice_row(
    'A', 'asesoria', null,
    jsonb_strip_nulls(jsonb_build_object(
      'name', v_name,
      'nif', v_nif,
      'address1', v_addr1,
      'address2', nullif(v_addr2, '')
    )),
    -- Como en el box: el IVA es la diferencia entre lo pagado y la base
    p_issue_date, v_lines, v_base, v_total - v_base, v_total
  );
  return row_to_json(v_row);
end;
$$;

revoke all on function public.issue_manual_invoice(date, jsonb, jsonb) from public;
grant execute on function public.issue_manual_invoice(date, jsonb, jsonb) to authenticated;
