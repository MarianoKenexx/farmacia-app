-- ════════════════════════════════════════════════════════════════════
-- Resumen por mail al cerrar cada turno de caja.
-- Solo agrega dónde guardar el mail del dueño y si está activado;
-- el envío lo hace la aplicación (no la base de datos).
-- ════════════════════════════════════════════════════════════════════

alter table public.app_settings add column if not exists owner_email text;
alter table public.app_settings add column if not exists notify_on_close boolean not null default true;
