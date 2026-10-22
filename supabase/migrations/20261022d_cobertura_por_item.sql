-- ════════════════════════════════════════════════════════════════════
-- Ajuste: el descuento de obra social ya no se aplica sobre toda la
-- venta, sino solo sobre los ítems que el cajero marcó con el
-- checkbox "con cobertura" (por ejemplo: venta libre normalmente no
-- tiene cobertura, aunque haya otros productos con receta en el mismo
-- carrito que sí la tienen).
-- ════════════════════════════════════════════════════════════════════

create or replace function public.create_sale(
  p_items jsonb, p_payment_method text, p_customer_id uuid default null, p_obra_social_id uuid default null
)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_reg uuid;
  v_sale public.sales;
  v_item jsonb;
  v_prod public.products;
  v_qty numeric;
  v_frac boolean;
  v_con_cobertura boolean;
  v_upe numeric;
  v_unit numeric;
  v_sub numeric;
  v_total numeric := 0;
  v_tax numeric := 0;
  v_base_cobertura numeric := 0;
  v_lines jsonb := '[]'::jsonb;
  v_pct numeric := 0;
  v_cobertura numeric := 0;
  v_cobrado numeric;
begin
  if not public.has_perm('pos') then raise exception 'No tenés permiso para vender'; end if;
  if p_payment_method not in ('efectivo', 'debito', 'credito', 'transferencia', 'qr') then
    raise exception 'Método de pago inválido';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'El carrito está vacío'; end if;

  select id into v_reg from public.cash_registers where status = 'open' limit 1;
  if v_reg is null then raise exception 'La caja está cerrada. Abrila antes de cobrar.'; end if;

  if p_obra_social_id is not null then
    select porcentaje_cobertura into v_pct from public.obras_sociales where id = p_obra_social_id and active;
    if v_pct is null then raise exception 'Obra social no encontrada o inactiva'; end if;
  end if;

  insert into public.sales (subtotal, tax, total, payment_method, register_id, customer_id, status, user_id, obra_social_id)
  values (0, 0, 0, p_payment_method, v_reg, p_customer_id, 'completed', auth.uid(), p_obra_social_id)
  returning * into v_sale;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item ->> 'quantity')::numeric;
    v_frac := coalesce((v_item ->> 'is_fraccion')::boolean, false);
    v_con_cobertura := coalesce((v_item ->> 'con_cobertura')::boolean, false);
    if v_qty is null or v_qty <= 0 then raise exception 'Cantidad inválida'; end if;

    select * into v_prod from public.products where id = (v_item ->> 'product_id')::uuid and active for update;
    if v_prod.id is null then raise exception 'Producto no encontrado o inactivo'; end if;

    v_upe := greatest(coalesce(v_prod.unidades_por_envase, 1), 1);
    v_unit := round(case when v_frac then v_prod.sale_price / v_upe else v_prod.sale_price end, 2);
    v_sub := round(v_qty * v_prod.sale_price, 2);
    v_total := v_total + v_sub;
    v_tax := v_tax + round(v_sub * coalesce(v_prod.iva_rate, 0) / (100 + coalesce(v_prod.iva_rate, 0)), 2);
    if v_con_cobertura then v_base_cobertura := v_base_cobertura + v_sub; end if;

    insert into public.sale_items (sale_id, product_id, quantity, unit_price, subtotal)
    values (v_sale.id, v_prod.id, v_qty, v_unit, v_sub);

    update public.products set stock = round(stock - v_qty, 4) where id = v_prod.id;

    insert into public.stock_movements (product_id, type, quantity, reason, user_id)
    values (v_prod.id, 'salida', v_qty, 'Venta #' || v_sale.invoice_number, auth.uid());

    v_lines := v_lines || jsonb_build_object('product_id', v_prod.id, 'unit_price', v_unit, 'subtotal', v_sub);
  end loop;

  -- El % de cobertura se aplica solo sobre el valor de los ítems marcados,
  -- no sobre toda la venta.
  v_cobertura := round(v_base_cobertura * v_pct / 100, 2);
  v_cobrado := v_total - v_cobertura;

  update public.sales
     set subtotal = v_cobrado - v_tax, tax = v_tax, total = v_cobrado,
         valor_cobertura = v_cobertura,
         estado_reclamo = case when v_cobertura > 0 then 'pendiente' else null end
   where id = v_sale.id;

  return json_build_object(
    'id', v_sale.id, 'invoice_number', v_sale.invoice_number, 'created_at', v_sale.created_at,
    'total', v_cobrado, 'tax', v_tax, 'neto', v_cobrado - v_tax, 'lines', v_lines,
    'valor_cobertura', v_cobertura, 'valor_lista', v_total
  );
end $$;

revoke all on function public.create_sale(jsonb, text, uuid, uuid) from public, anon;
grant execute on function public.create_sale(jsonb, text, uuid, uuid) to authenticated;
