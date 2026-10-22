-- ════════════════════════════════════════════════════════════════════
-- Un medicamento bajo receta (o receta archivada) nunca se vende
-- fraccionado: siempre el envase cerrado, con el prospecto completo.
-- Esto ya se corrigió en la pantalla de Productos; acá se deja la
-- misma regla puesta en la base, para que no se pueda saltear ni
-- editando directo desde Supabase.
-- ════════════════════════════════════════════════════════════════════

-- Corrige los productos que ya hubieran quedado cargados como fraccionables
-- siendo bajo receta / receta archivada.
update public.products
   set unidades_por_envase = 1, nombre_fraccion = 'unidad'
 where tipo_venta <> 'libre' and coalesce(unidades_por_envase, 1) <> 1;

alter table public.products drop constraint if exists products_fraccion_solo_libre_check;
alter table public.products add constraint products_fraccion_solo_libre_check
  check (tipo_venta = 'libre' or coalesce(unidades_por_envase, 1) = 1);
