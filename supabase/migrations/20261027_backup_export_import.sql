-- ════════════════════════════════════════════════════════════════════
-- Respaldo de la base de datos: exportar todo a un archivo, y poder
-- cargarlo de nuevo si algo se rompe o se borra por error. Lo pueden
-- usar el dueño y los administradores (no los cajeros).
--
-- No incluye usuarios (profiles) ni las credenciales de ARCA
-- (arca_credentials): esos se manejan aparte, desde Usuarios y
-- Configuración, para no sacar contraseñas/PIN/certificados del
-- sistema en un archivo descargable.
--
-- Importar nunca borra nada: inserta lo que falte y actualiza (por id)
-- lo que ya exista. Así un respaldo viejo no puede "pisar" para atrás
-- datos nuevos sin querer — en el peor caso, deja filas de más que
-- ya estaban de antes.
-- ════════════════════════════════════════════════════════════════════

create or replace function public.export_backup()
returns json language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'No tenés permiso para exportar la base de datos';
  end if;

  return json_build_object(
    'version', 1,
    'exported_at', now(),
    'app_settings', (select coalesce(json_agg(t), '[]'::json) from public.app_settings t),
    'categories', (select coalesce(json_agg(t), '[]'::json) from public.categories t),
    'obras_sociales', (select coalesce(json_agg(t), '[]'::json) from public.obras_sociales t),
    'proveedores', (select coalesce(json_agg(t), '[]'::json) from public.proveedores t),
    'customers', (select coalesce(json_agg(t), '[]'::json) from public.customers t),
    'products', (select coalesce(json_agg(t), '[]'::json) from public.products t),
    'cash_registers', (select coalesce(json_agg(t), '[]'::json) from public.cash_registers t),
    'lotes', (select coalesce(json_agg(t), '[]'::json) from public.lotes t),
    'compras', (select coalesce(json_agg(t), '[]'::json) from public.compras t),
    'compra_items', (select coalesce(json_agg(t), '[]'::json) from public.compra_items t),
    'sales', (select coalesce(json_agg(t), '[]'::json) from public.sales t),
    'sale_items', (select coalesce(json_agg(t), '[]'::json) from public.sale_items t),
    'cash_withdrawals', (select coalesce(json_agg(t), '[]'::json) from public.cash_withdrawals t),
    'price_change_log', (select coalesce(json_agg(t), '[]'::json) from public.price_change_log t),
    'alerts', (select coalesce(json_agg(t), '[]'::json) from public.alerts t),
    'stock_movements', (select coalesce(json_agg(t), '[]'::json) from public.stock_movements t)
  );
end $$;

revoke all on function public.export_backup() from public, anon;
grant execute on function public.export_backup() to authenticated;

-- Inserta o actualiza (por id) las filas de una tabla a partir de un
-- array de objetos JSON. Se arma dinámicamente a partir de las
-- columnas reales de la tabla, así no hay que tocar esta función cada
-- vez que se le agrega una columna a alguna tabla.
create or replace function public._restore_table(p_table text, p_rows json)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_set text;
  v_count integer;
begin
  if p_rows is null or json_array_length(p_rows) = 0 then return 0; end if;

  select string_agg(quote_ident(column_name) || ' = excluded.' || quote_ident(column_name), ', ')
    into v_set
  from information_schema.columns
  where table_schema = 'public' and table_name = p_table and column_name <> 'id';

  if v_set is null then
    raise exception 'Tabla desconocida en el archivo: %', p_table;
  end if;

  execute format(
    'insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1) on conflict (id) do update set %s',
    p_table, p_table, v_set
  ) using p_rows::jsonb;

  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public._restore_table(text, json) from public, anon;

create or replace function public.import_backup(p_data json)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_table text;
  -- Orden pensado para respetar las referencias entre tablas (por
  -- ejemplo, los productos tienen que existir antes que las ventas).
  v_order text[] := array[
    'app_settings', 'categories', 'obras_sociales', 'proveedores', 'customers', 'products',
    'cash_registers', 'lotes', 'compras', 'compra_items', 'sales', 'sale_items',
    'cash_withdrawals', 'price_change_log', 'alerts', 'stock_movements'
  ];
  v_result jsonb := '{}'::jsonb;
  v_n integer;
begin
  if not public.is_admin() then
    raise exception 'No tenés permiso para importar una base de datos';
  end if;
  if p_data is null then
    raise exception 'El archivo está vacío o no es un respaldo válido';
  end if;

  foreach v_table in array v_order loop
    v_n := public._restore_table(v_table, p_data -> v_table);
    v_result := v_result || jsonb_build_object(v_table, v_n);
  end loop;

  -- La numeración de factura sigue después de la más alta que haya
  -- quedado cargada, para que la próxima venta no choque con una vieja.
  perform setval('public.sales_invoice_number_seq', coalesce((select max(invoice_number) from public.sales), 0) + 1, false);

  return v_result::json;
end $$;

revoke all on function public.import_backup(json) from public, anon;
grant execute on function public.import_backup(json) to authenticated;
