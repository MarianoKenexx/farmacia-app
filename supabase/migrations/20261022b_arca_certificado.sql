-- ════════════════════════════════════════════════════════════════════
-- Lugar seguro para el certificado digital de ARCA. A diferencia de
-- app_settings (que cualquiera puede leer, porque incluye el logo que
-- se ve en el login), esta tabla NO se puede leer desde el navegador,
-- ni siquiera un admin. Solo se puede escribir (vía una función) y
-- solo el servidor de la aplicación la lee, cuando tenga que pedirle
-- un CAE a ARCA.
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.arca_credentials (
  id int primary key default 1 check (id = 1),
  cert_pem text,          -- certificado que entrega ARCA (texto, empieza con -----BEGIN CERTIFICATE-----)
  key_pem text,           -- clave privada que generaste vos (texto, empieza con -----BEGIN PRIVATE KEY-----)
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
insert into public.arca_credentials (id) values (1) on conflict (id) do nothing;

alter table public.arca_credentials enable row level security;
-- A propósito: ninguna policy de "select". Nadie lee esta tabla desde el
-- navegador, ni con RLS ni sin ella — ni siquiera un admin. Solo el
-- servidor (service role) la lee, sin pasar por RLS.

-- Guarda (o reemplaza) el certificado y la clave. Solo un admin puede llamarla,
-- y ni siquiera ella misma devuelve el contenido.
create or replace function public.set_arca_credentials(p_cert text, p_key text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo un administrador puede cargar el certificado'; end if;
  if coalesce(trim(p_cert), '') = '' or coalesce(trim(p_key), '') = '' then
    raise exception 'Faltan el certificado o la clave privada';
  end if;
  update public.arca_credentials
     set cert_pem = trim(p_cert), key_pem = trim(p_key), updated_at = now(), updated_by = auth.uid()
   where id = 1;
end $$;

create or replace function public.clear_arca_credentials()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'No corresponde'; end if;
  update public.arca_credentials set cert_pem = null, key_pem = null, updated_at = now(), updated_by = auth.uid() where id = 1;
end $$;

-- Para mostrar en Configuración si ya hay un certificado cargado, sin exponerlo
create or replace function public.arca_credentials_status()
returns table(cargado boolean, actualizado timestamptz) language sql stable security definer set search_path = public as $$
  select (cert_pem is not null and key_pem is not null), updated_at from public.arca_credentials where id = 1
$$;

revoke all on function public.set_arca_credentials(text, text) from public, anon;
revoke all on function public.clear_arca_credentials() from public, anon;
revoke all on function public.arca_credentials_status() from public, anon;
grant execute on function public.set_arca_credentials(text, text) to authenticated;
grant execute on function public.clear_arca_credentials() to authenticated;
grant execute on function public.arca_credentials_status() to authenticated;
