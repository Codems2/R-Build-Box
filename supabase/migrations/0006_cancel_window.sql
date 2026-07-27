-- ===========================================================================
-- Ventana de cancelación: el crédito solo se devuelve si se cancela con más
-- de 2 horas de antelación al inicio de la clase. Después, la reserva se
-- cancela igual (libera la plaza) pero NO se devuelve el crédito.
--
-- La hora de la clase se interpreta en la zona horaria del box (Europe/Madrid).
-- ===========================================================================

create or replace function public.cancel_my_booking(p_booking_id uuid)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_b public.bookings%rowtype;
  v_start timestamptz;
  v_refunded boolean := false;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_b from public.bookings where id = p_booking_id and user_id = v_uid;
  if not found then raise exception 'NOT_FOUND'; end if;

  -- Inicio de la clase como instante real (hora local del box)
  select (v_b.class_date + s.start_time) at time zone 'Europe/Madrid'
    into v_start
    from public.schedule_slots s
    where s.id = v_b.slot_id;

  delete from public.bookings where id = p_booking_id;

  -- Se devuelve el crédito solo con > 2 h de antelación (o si no se puede
  -- determinar la hora, p. ej. la clase ya no existe)
  if v_start is null or now() < v_start - interval '2 hours' then
    update public.profiles set credits = credits + 1 where id = v_uid;
    v_refunded := true;
  end if;

  return json_build_object('ok', true, 'refunded', v_refunded);
end;
$$;
