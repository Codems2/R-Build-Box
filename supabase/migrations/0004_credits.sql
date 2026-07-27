-- ===========================================================================
-- Planes, créditos semanales y estado de socio
--
-- Cada socio contrata un plan con N créditos semanales. Reservar una clase
-- gasta 1 crédito; cancelar antes de la clase lo devuelve. Un socio "activo"
-- se le renuevan los créditos cada semana; un socio "inactivo" no, hasta que
-- el admin lo reactive (tras el pago), momento en que recibe sus créditos.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Planes (configurables por el admin)
-- ---------------------------------------------------------------------------
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  weekly_credits integer not null default 0 check (weekly_credits between 0 and 100),
  price numeric(8, 2),
  description text,
  created_at timestamptz not null default now()
);

alter table public.plans enable row level security;

drop policy if exists "Los socios ven los planes" on public.plans;
create policy "Los socios ven los planes"
  on public.plans for select
  to authenticated
  using (true);

drop policy if exists "El admin gestiona los planes" on public.plans;
create policy "El admin gestiona los planes"
  on public.plans for all
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.plans to authenticated;
grant insert, update, delete on public.plans to authenticated;
grant all on public.plans to service_role;

-- ---------------------------------------------------------------------------
-- Ficha de socio: plan, estado y saldo de créditos
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists plan_id uuid references public.plans (id) on delete set null,
  add column if not exists membership_active boolean not null default false,
  add column if not exists credits integer not null default 0,
  add column if not exists credits_renewed_at date;

-- Concede créditos al activar el socio o al cambiarle de plan (mientras activo)
create or replace function public.grant_credits_on_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if NEW.membership_active and NEW.plan_id is not null and (
       coalesce(OLD.membership_active, false) = false
       or coalesce(OLD.plan_id::text, '') <> coalesce(NEW.plan_id::text, '')
     ) then
    NEW.credits := coalesce((select weekly_credits from public.plans where id = NEW.plan_id), 0);
    NEW.credits_renewed_at := current_date;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_grant_credits on public.profiles;
create trigger trg_grant_credits
  before update on public.profiles
  for each row execute function public.grant_credits_on_change();

-- ---------------------------------------------------------------------------
-- Reservas vinculadas al socio
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

create index if not exists bookings_user_idx on public.bookings (user_id);

-- El socio puede ver y cancelar sus propias reservas
drop policy if exists "El socio ve sus reservas" on public.bookings;
create policy "El socio ve sus reservas"
  on public.bookings for select
  using (user_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- Reservar una clase: valida estado, crédito, aforo y duplicados; gasta crédito
-- ---------------------------------------------------------------------------
create or replace function public.book_class(p_slot_id uuid, p_class_date date)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_slot public.schedule_slots%rowtype;
  v_profile public.profiles%rowtype;
  v_count bigint;
  v_name text;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select * into v_profile from public.profiles where id = v_uid;
  if not v_profile.membership_active then raise exception 'MEMBERSHIP_INACTIVE'; end if;
  if v_profile.credits <= 0 then raise exception 'NO_CREDITS'; end if;

  select * into v_slot from public.schedule_slots where id = p_slot_id and is_active;
  if not found then raise exception 'SLOT_NOT_FOUND'; end if;
  if p_class_date < current_date then raise exception 'DATE_IN_PAST'; end if;
  if (extract(isodow from p_class_date)::int - 1) <> v_slot.day_of_week then
    raise exception 'DATE_MISMATCH';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_slot_id::text || p_class_date::text));

  if exists (select 1 from public.bookings
             where slot_id = p_slot_id and class_date = p_class_date and user_id = v_uid) then
    raise exception 'ALREADY_BOOKED';
  end if;

  if v_slot.capacity is not null then
    select count(*) into v_count from public.bookings
      where slot_id = p_slot_id and class_date = p_class_date;
    if v_count >= v_slot.capacity then raise exception 'CLASS_FULL'; end if;
  end if;

  v_name := nullif(trim(coalesce(v_profile.first_name, '') || ' ' || coalesce(v_profile.last_name, '')), '');
  update public.profiles set credits = credits - 1 where id = v_uid;
  insert into public.bookings (slot_id, class_date, user_id, name, contact)
    values (p_slot_id, p_class_date, v_uid, coalesce(v_name, v_profile.email, 'Socio'), v_profile.phone);

  return json_build_object('ok', true, 'credits_left', v_profile.credits - 1);
end;
$$;

-- ---------------------------------------------------------------------------
-- Cancelar mi reserva: la borra y devuelve el crédito si la clase no ha pasado
-- ---------------------------------------------------------------------------
create or replace function public.cancel_my_booking(p_booking_id uuid)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_b public.bookings%rowtype;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_b from public.bookings where id = p_booking_id and user_id = v_uid;
  if not found then raise exception 'NOT_FOUND'; end if;

  delete from public.bookings where id = p_booking_id;
  if v_b.class_date >= current_date then
    update public.profiles set credits = credits + 1 where id = v_uid;
  end if;
  return json_build_object('ok', true);
end;
$$;

grant execute on function public.book_class(uuid, date) to authenticated;
grant execute on function public.cancel_my_booking(uuid) to authenticated;

-- Las reservas ahora pasan por book_class: retiramos las funciones antiguas
drop function if exists public.create_booking(uuid, date, text, text);
drop function if exists public.cancel_booking(uuid, uuid);

-- list_members: incluir plan, estado y créditos para el panel admin
drop function if exists public.list_members();
create or replace function public.list_members()
returns table (
  id uuid,
  member_no bigint,
  role text,
  email text,
  first_name text,
  last_name text,
  phone text,
  activated boolean,
  plan_id uuid,
  plan_name text,
  membership_active boolean,
  credits integer,
  created_at timestamptz
)
language sql
security definer set search_path = public
stable
as $$
  select p.id, p.member_no, p.role, p.email, p.first_name, p.last_name, p.phone,
         (u.email_confirmed_at is not null) as activated,
         p.plan_id, pl.name as plan_name, p.membership_active, p.credits, u.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.plans pl on pl.id = p.plan_id
  where public.is_admin()
  order by p.member_no;
$$;
