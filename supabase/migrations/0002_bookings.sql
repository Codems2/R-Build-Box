-- ===========================================================================
-- Reservas de plazas en clases (sin registro de usuario)
--
-- Los visitantes se apuntan a la próxima sesión de una clase a través de la
-- función create_booking (controla aforo y duplicados). Los nombres de los
-- apuntados solo los ve el admin; el público solo ve el número de plazas
-- ocupadas vía get_booking_counts. La cancelación usa un token secreto que
-- recibe quien reserva.
-- ===========================================================================

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.schedule_slots (id) on delete cascade,
  class_date date not null,
  name text not null check (char_length(trim(name)) between 2 and 60),
  contact text check (contact is null or char_length(contact) <= 120),
  cancel_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);

-- Evita que la misma persona se apunte dos veces a la misma sesión
create unique index if not exists bookings_unique_person
  on public.bookings (slot_id, class_date, lower(trim(name)));

create index if not exists bookings_slot_date_idx
  on public.bookings (slot_id, class_date);

alter table public.bookings enable row level security;

-- Solo el admin puede ver y borrar reservas directamente (RLS);
-- el público interactúa únicamente a través de las funciones de abajo.
create policy "Solo el admin ve las reservas"
  on public.bookings for select
  using (public.is_admin());

create policy "Solo el admin borra reservas"
  on public.bookings for delete
  using (public.is_admin());

grant select, delete on public.bookings to authenticated;
grant all on public.bookings to service_role;

-- ---------------------------------------------------------------------------
-- Ocupación pública: cuántas plazas hay reservadas por sesión (sin nombres)
-- ---------------------------------------------------------------------------
create or replace function public.get_booking_counts()
returns table (slot_id uuid, class_date date, cnt bigint)
language sql
security definer set search_path = public
stable
as $$
  select b.slot_id, b.class_date, count(*)
  from public.bookings b
  where b.class_date >= current_date
  group by b.slot_id, b.class_date;
$$;

-- ---------------------------------------------------------------------------
-- Crear una reserva con control de aforo y de fecha
-- ---------------------------------------------------------------------------
create or replace function public.create_booking(
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
  v_slot public.schedule_slots%rowtype;
  v_count bigint;
  v_booking public.bookings%rowtype;
begin
  select * into v_slot from public.schedule_slots where id = p_slot_id and is_active;
  if not found then
    raise exception 'SLOT_NOT_FOUND';
  end if;

  if p_class_date < current_date then
    raise exception 'DATE_IN_PAST';
  end if;

  -- La fecha debe caer en el día de la semana del hueco (0 = Lunes … 6 = Domingo)
  if (extract(isodow from p_class_date)::int - 1) <> v_slot.day_of_week then
    raise exception 'DATE_MISMATCH';
  end if;

  -- Serializa las reservas de una misma sesión para no superar el aforo
  perform pg_advisory_xact_lock(hashtext(p_slot_id::text || p_class_date::text));

  if v_slot.capacity is not null then
    select count(*) into v_count
    from public.bookings
    where slot_id = p_slot_id and class_date = p_class_date;
    if v_count >= v_slot.capacity then
      raise exception 'CLASS_FULL';
    end if;
  end if;

  insert into public.bookings (slot_id, class_date, name, contact)
  values (p_slot_id, p_class_date, trim(p_name), nullif(trim(coalesce(p_contact, '')), ''))
  returning * into v_booking;

  return json_build_object('id', v_booking.id, 'cancel_token', v_booking.cancel_token);
exception
  when unique_violation then
    raise exception 'ALREADY_BOOKED';
end;
$$;

-- ---------------------------------------------------------------------------
-- Cancelar una reserva con su token secreto
-- ---------------------------------------------------------------------------
create or replace function public.cancel_booking(p_id uuid, p_token uuid)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.bookings where id = p_id and cancel_token = p_token;
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

grant execute on function public.get_booking_counts() to anon, authenticated;
grant execute on function public.create_booking(uuid, date, text, text) to anon, authenticated;
grant execute on function public.cancel_booking(uuid, uuid) to anon, authenticated;
