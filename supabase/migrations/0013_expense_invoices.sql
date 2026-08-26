-- ===========================================================================
-- Facturas adjuntas en los gastos
--
-- Cada gasto puede llevar una factura adjunta (imagen o PDF): foto hecha con
-- la cámara del móvil o archivo subido. Se guardan en el bucket privado
-- `invoices` de Supabase Storage; solo los administradores pueden subirlas,
-- verlas (mediante URL firmada) o borrarlas.
-- ===========================================================================

alter table public.finance_entries
  add column if not exists invoice_path text;

-- Bucket privado con límite de 10 MB y tipos permitidos (imágenes y PDF)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'invoices', 'invoices', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public = excluded.public;

-- Solo el admin gestiona los archivos del bucket de facturas
drop policy if exists "Admin gestiona facturas" on storage.objects;
create policy "Admin gestiona facturas"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'invoices' and public.is_admin())
  with check (bucket_id = 'invoices' and public.is_admin());
