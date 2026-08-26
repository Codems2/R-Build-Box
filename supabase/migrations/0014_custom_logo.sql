-- ===========================================================================
-- Logo personalizable del box
--
-- El admin puede subir un logo nuevo desde Ajustes. Se guarda en el bucket
-- PÚBLICO `branding` (para que se vea también en la pantalla de login, sin
-- sesión) y su URL queda en app_settings.logo_url.
--
-- Para no exponer el resto de ajustes (cuota, límite) a usuarios anónimos,
-- el logo se lee mediante la función get_logo(), que devuelve solo la URL.
-- ===========================================================================

alter table public.app_settings
  add column if not exists logo_url text;

-- Bucket público de marca (logos). Máx 3 MB, solo imágenes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', true, 3145728, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Solo el admin sube/cambia/borra archivos de branding (la lectura es pública
-- por ser un bucket público, vía la URL /object/public/branding/...).
drop policy if exists "Admin gestiona branding" on storage.objects;
create policy "Admin gestiona branding"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'branding' and public.is_admin())
  with check (bucket_id = 'branding' and public.is_admin());

-- Logo legible por cualquiera (incluye la pantalla de login sin sesión),
-- sin exponer el resto de ajustes.
create or replace function public.get_logo()
returns text
language sql
security definer set search_path = public
stable
as $$
  select logo_url from public.app_settings where id;
$$;

grant execute on function public.get_logo() to anon, authenticated;
