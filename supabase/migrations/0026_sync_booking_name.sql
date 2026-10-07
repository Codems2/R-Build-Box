-- ===========================================================================
-- Renombrar a un socio también actualiza su nombre en las reservas
--
-- bookings.name es una copia del nombre que tenía el socio al reservar (se usa
-- para la lista de apuntados y para los invitados, que no tienen ficha). Si el
-- admin corrige el nombre desde la ficha, esas reservas se quedaban con el
-- nombre antiguo. Este trigger lo mantiene sincronizado.
--
-- Las reservas de invitados (user_id null) no se tocan: no tienen ficha.
-- ===========================================================================

create or replace function public.sync_booking_name()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_name text;
begin
  -- Mismo criterio que al crear la reserva: nombre completo, email o «Socio»
  v_name := nullif(trim(coalesce(new.first_name, '') || ' ' || coalesce(new.last_name, '')), '');
  v_name := left(coalesce(v_name, new.email, 'Socio'), 60);

  -- bookings.name exige entre 2 y 60 caracteres: si no llega, no tocamos nada
  -- (la ficha se guarda igualmente, solo no se propaga).
  if char_length(trim(v_name)) < 2 then
    return new;
  end if;

  -- Se omiten las reservas donde el nombre nuevo chocaría con otro apuntado de
  -- esa misma sesión (índice único por sesión + nombre), para que un choque
  -- puntual no impida renombrar al socio.
  update public.bookings b
     set name = v_name
   where b.user_id = new.id
     and b.name is distinct from v_name
     and not exists (
       select 1 from public.bookings o
        where o.slot_id = b.slot_id
          and o.class_date = b.class_date
          and o.id <> b.id
          and lower(trim(o.name)) = lower(trim(v_name))
     );

  return new;
end;
$$;

drop trigger if exists trg_sync_booking_name on public.profiles;
create trigger trg_sync_booking_name
  after update of first_name, last_name, email on public.profiles
  for each row
  when (
    new.first_name is distinct from old.first_name
    or new.last_name is distinct from old.last_name
    or new.email is distinct from old.email
  )
  execute function public.sync_booking_name();
