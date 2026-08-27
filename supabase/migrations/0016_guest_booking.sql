-- ===========================================================================
-- Reserva de invitados por el admin
--
-- El admin puede apuntar a un cliente invitado (p. ej. primera clase gratis)
-- que NO tiene cuenta en la app. La reserva se crea sin user_id, con el nombre
-- y (opcional) teléfono del invitado. Respeta el aforo y valida que la fecha
-- corresponde al hueco. Solo administradores.
-- ===========================================================================

create or replace function public.book_guest(
  p_slot_id uuid,
  p_class_date date,
  p_name text,
  p_contact text default null
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_slot public.schedule_slots%rowtype;
  v_today date := (now() at time zone 'Europe/Madrid')::date;
  v_count bigint;
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_contact text := nullif(trim(coalesce(p_contact, '')), '');
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if v_name is null or char_length(v_name) < 2 then raise exception 'BAD_NAME'; end if;
  if v_contact is not null and char_length(v_contact) > 120 then raise exception 'BAD_CONTACT'; end if;

  select * into v_slot from public.schedule_slots where id = p_slot_id and is_active;
  if not found then raise exception 'SLOT_NOT_FOUND'; end if;

  -- La fecha pedida debe corresponder de verdad a este hueco
  if v_slot.is_recurring then
    if (extract(isodow from p_class_date)::int - 1) <> v_slot.day_of_week then
      raise exception 'DATE_MISMATCH';
    end if;
    if v_slot.class_date is not null and p_class_date < v_slot.class_date then
      raise exception 'DATE_MISMATCH';
    end if;
  else
    if v_slot.class_date is null or p_class_date <> v_slot.class_date then
      raise exception 'DATE_MISMATCH';
    end if;
  end if;
  if p_class_date < v_today then raise exception 'DATE_IN_PAST'; end if;

  perform pg_advisory_xact_lock(hashtext(p_slot_id::text || p_class_date::text));

  if v_slot.capacity is not null then
    select count(*) into v_count from public.bookings
      where slot_id = p_slot_id and class_date = p_class_date and status = 'booked';
    if v_count >= v_slot.capacity then raise exception 'CLASS_FULL'; end if;
  end if;

  insert into public.bookings (slot_id, class_date, user_id, name, contact, status)
    values (p_slot_id, p_class_date, null, v_name, v_contact, 'booked');

  return json_build_object('ok', true);
exception
  when unique_violation then raise exception 'ALREADY_BOOKED';
end;
$$;

grant execute on function public.book_guest(uuid, date, text, text) to authenticated;
