-- ════════════════════════════════════════════════════════════════════
-- Datos de facturación electrónica (ARCA, ex AFIP). Por ahora solo
-- guarda la configuración; la conexión real con ARCA se agrega
-- después, cuando el CUIT tenga el servicio habilitado.
-- ════════════════════════════════════════════════════════════════════

alter table public.app_settings add column if not exists arca_cuit text;
alter table public.app_settings add column if not exists arca_punto_venta integer;
alter table public.app_settings add column if not exists arca_tipo_comprobante text; -- 'B' | 'C'
alter table public.app_settings add column if not exists arca_ambiente text not null default 'homologacion'; -- 'homologacion' | 'produccion'
alter table public.app_settings add column if not exists arca_activo boolean not null default false;

-- Datos de la factura electrónica, guardados en cada venta cuando se emite
alter table public.sales add column if not exists arca_cae text;
alter table public.sales add column if not exists arca_cae_vencimiento date;
alter table public.sales add column if not exists arca_comprobante_numero integer;
alter table public.sales add column if not exists arca_estado text; -- 'pendiente' | 'emitido' | 'error'
alter table public.sales add column if not exists arca_error text;
