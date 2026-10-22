-- ════════════════════════════════════════════════════════════════════
-- Foto de la factura al registrar una compra.
--
-- Bucket privado (no público como "product-images"): las facturas de
-- proveedores pueden tener datos comerciales sensibles, así que solo se
-- puede ver con una URL firmada, y solo quien tenga permiso de "stock"
-- puede subirla, actualizarla o verla — igual que ya pasa con la fila
-- de la compra en sí.
-- ════════════════════════════════════════════════════════════════════

alter table public.compras
  add column if not exists foto_factura_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('compra-facturas', 'compra-facturas', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "Stock read compra facturas" on storage.objects;
drop policy if exists "Stock upload compra facturas" on storage.objects;
drop policy if exists "Stock update compra facturas" on storage.objects;
drop policy if exists "Stock delete compra facturas" on storage.objects;
create policy "Stock read compra facturas" on storage.objects for select to authenticated
  using (bucket_id = 'compra-facturas' and public.has_perm('stock'));
create policy "Stock upload compra facturas" on storage.objects for insert to authenticated
  with check (bucket_id = 'compra-facturas' and public.has_perm('stock'));
create policy "Stock update compra facturas" on storage.objects for update to authenticated
  using (bucket_id = 'compra-facturas' and public.has_perm('stock'));
create policy "Stock delete compra facturas" on storage.objects for delete to authenticated
  using (bucket_id = 'compra-facturas' and public.has_perm('stock'));

-- registrar_compra ahora acepta la ruta (ya subida) de la foto de la
-- factura, y la guarda en la compra.
drop function if exists public.registrar_compra(uuid, text, jsonb);

create or replace function public.registrar_compra(
  p_proveedor_id uuid, p_numero_factura text, p_items jsonb, p_foto_factura_path text default null
)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_compra public.compras;
  v_item jsonb;
  v_prod public.products;
  v_qty numeric;
  v_costo numeric;
  v_sub numeric;
  v_total numeric := 0;
begin
  if not public.has_perm('stock') then raise exception 'No tenés permiso para registrar compras'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'Agregá al menos un producto'; end if;

  insert into public.compras (proveedor_id, numero_factura, total, created_by, foto_factura_path)
  values (p_proveedor_id, nullif(trim(coalesce(p_numero_factura, '')), ''), 0, auth.uid(),
          nullif(trim(coalesce(p_foto_factura_path, '')), ''))
  returning * into v_compra;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item ->> 'quantity')::numeric;
    v_costo := (v_item ->> 'costo_unitario')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Cantidad inválida'; end if;
    if v_costo is null or v_costo < 0 then raise exception 'Costo inválido'; end if;

    select * into v_prod from public.products where id = (v_item ->> 'product_id')::uuid for update;
    if v_prod.id is null then raise exception 'Producto no encontrado'; end if;

    v_sub := round(v_qty * v_costo, 2);
    v_total := v_total + v_sub;

    insert into public.compra_items (compra_id, product_id, product_name, quantity, costo_unitario, subtotal)
    values (v_compra.id, v_prod.id, v_prod.name, v_qty, v_costo, v_sub);

    update public.products set stock = round(stock + v_qty, 4), purchase_price = v_costo where id = v_prod.id;

    insert into public.stock_movements (product_id, type, quantity, reason, user_id)
    values (v_prod.id, 'entrada', v_qty,
            'Compra' || case when v_compra.numero_factura is not null then ' #' || v_compra.numero_factura else '' end,
            auth.uid());
  end loop;

  update public.compras set total = v_total where id = v_compra.id;

  return json_build_object('id', v_compra.id, 'total', v_total);
end $$;

revoke all on function public.registrar_compra(uuid, text, jsonb, text) from public, anon;
grant execute on function public.registrar_compra(uuid, text, jsonb, text) to authenticated;
