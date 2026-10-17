-- ════════════════════════════════════════════════════════════════════
-- Marca de la empresa (nombre + logo) y datos del ticket, compartidos
-- por todas las computadoras. Aplicado en FARMAPP el 2026-10-17.
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.app_settings (
  id int primary key default 1 check (id = 1),     -- una sola fila
  business_name text not null default 'Farmacia',
  tagline text not null default 'Sistema de Gestión',
  logo_url text,                                    -- logo del menú (PNG/JPG/SVG/WebP)
  show_name_with_logo boolean not null default true,
  ticket_logo_url text,                             -- logo del ticket (si no hay, usa el del menú)
  ticket_show_logo boolean not null default false,
  ticket_name text,                                 -- si está vacío, usa business_name
  ticket_address text,
  ticket_cuit text,
  ticket_phone text,
  ticket_footer text default '¡Gracias por su compra!',
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id) values (1) on conflict (id) do nothing;

alter table public.app_settings enable row level security;

-- Todos pueden leer (también la pantalla de login, para mostrar el logo)
drop policy if exists app_settings_select on public.app_settings;
create policy app_settings_select on public.app_settings for select to anon, authenticated using (true);

-- Solo administradores modifican
drop policy if exists app_settings_update on public.app_settings;
create policy app_settings_update on public.app_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin() and id = 1);

-- Carpeta pública para los logos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', true, 2097152, array['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 2097152,
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];

drop policy if exists "Public read branding" on storage.objects;
drop policy if exists "Admin upload branding" on storage.objects;
drop policy if exists "Admin update branding" on storage.objects;
drop policy if exists "Admin delete branding" on storage.objects;
create policy "Public read branding" on storage.objects for select to anon, authenticated
  using (bucket_id = 'branding');
create policy "Admin upload branding" on storage.objects for insert to authenticated
  with check (bucket_id = 'branding' and public.is_admin());
create policy "Admin update branding" on storage.objects for update to authenticated
  using (bucket_id = 'branding' and public.is_admin());
create policy "Admin delete branding" on storage.objects for delete to authenticated
  using (bucket_id = 'branding' and public.is_admin());

-- Stock en las alertas con 1 decimal como máximo (24,6667 → 24,6)
create or replace function public.fmt_stock(n numeric)
returns text language sql immutable as $$
  select replace(trim(trailing '.' from trim(trailing '0' from (trunc(n, 1))::text)), '.', ',')
$$;

create or replace function public.trg_product_stock()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.active and new.stock is distinct from old.stock then
    if new.stock <= 0 and old.stock > 0 then
      insert into public.alerts (type, severity, title, body, product_id)
      values ('sin_stock', 'alta', 'Sin stock: ' || new.name, 'Hay que reponer.', new.id);
    elsif new.min_stock > 0 and new.stock <= new.min_stock and old.stock > new.min_stock then
      insert into public.alerts (type, severity, title, body, product_id)
      values ('stock_bajo', 'media', 'Stock bajo: ' || new.name,
              'Quedan ' || public.fmt_stock(new.stock) || ' cajas (mínimo ' || public.fmt_stock(new.min_stock) || ').',
              new.id);
    end if;
  end if;
  return new;
end $$;

-- Arreglar textos de alertas de stock ya creadas
update public.alerts a
   set body = 'Quedan ' || public.fmt_stock(p.stock) || ' cajas (mínimo ' || public.fmt_stock(p.min_stock) || ').'
  from public.products p
 where a.type = 'stock_bajo' and a.product_id = p.id and a.read_at is null;
