-- ===========================================================================
-- Iconos de la PWA a partir del logo del box
--
-- Al subir un logo, la app genera sus iconos (192, 512 y maskable) y guarda
-- sus URLs aquí. El manifiesto y el favicon se reconstruyen en cliente con
-- ellos, así las nuevas instalaciones y la pestaña del navegador usan el logo
-- del box. get_branding() los expone (con el logo) a anónimos y autenticados.
-- ===========================================================================

alter table public.app_settings
  add column if not exists pwa_icons jsonb;

create or replace function public.get_branding()
returns jsonb
language sql
security definer set search_path = public
stable
as $$
  select jsonb_build_object('logo', logo_url, 'icons', pwa_icons)
  from public.app_settings where id;
$$;

grant execute on function public.get_branding() to anon, authenticated;
