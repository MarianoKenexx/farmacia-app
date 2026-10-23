-- ════════════════════════════════════════════════════════════════════
-- El % de cobertura ya no es fijo por obra social: el mismo medicamento
-- puede tener un % distinto en PAMI que en OSECAC, así que el cajero lo
-- elige en el momento de la venta (dos pasos: obra social, después %).
--
-- El % que viene cargado en "Configuración → Obras sociales" pasa a ser
-- solo un valor sugerido para prellenar el segundo desplegable — ya no
-- se usa solo ni se fuerza.
--
-- Guardamos el % realmente aplicado en la venta (sales.porcentaje_cobertura)
-- para que una devolución más adelante calcule con el % que se usó en
-- esa venta puntual, no con el valor "sugerido" actual de la obra
-- social (que puede haber cambiado desde entonces).
-- ════════════════════════════════════════════════════════════════════

alter table public.sales
  add column if not exists porcentaje_cobertura numeric;

drop function if exists public.create_sale(jsonb, text, uuid, uuid);

create or replace function public.create_sale(
  p_items jsonb, p_payment_method text, p_customer_id uuid default null,
  p_obra_social_id uuid default null, p_porcentaje_cobertura numeric default null
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
  v_pct_default numeric;
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
    select porcentaje_cobertura into v_pct_default from public.obras_sociales where id = p_obra_social_id and active;
    if v_pct_default is null then raise exception 'Obra social no encontrada o inactiva'; end if;
    v_pct := coalesce(p_porcentaje_cobertura, v_pct_default);
    if v_pct < 0 or v_pct > 100 then raise exception 'El %% de cobertura tiene que estar entre 0 y 100'; end if;
  end if;

  insert into public.sales (subtotal, tax, total, payment_method, register_id, customer_id, status, user_id, obra_social_id, porcentaje_cobertura)
  values (0, 0, 0, p_payment_method, v_reg, p_customer_id, 'completed', auth.uid(), p_obra_social_id,
          case when p_obra_social_id is not null then v_pct else null end)
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

    insert into public.sale_items (sale_id, product_id, quantity, unit_price, subtotal, con_cobertura)
    values (v_sale.id, v_prod.id, v_qty, v_unit, v_sub, v_con_cobertura);

    update public.products set stock = round(stock - v_qty, 4) where id = v_prod.id;

    insert into public.stock_movements (product_id, type, quantity, reason, user_id)
    values (v_prod.id, 'salida', v_qty, 'Venta #' || v_sale.invoice_number, auth.uid());

    v_lines := v_lines || jsonb_build_object('product_id', v_prod.id, 'unit_price', v_unit, 'subtotal', v_sub);
  end loop;

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

revoke all on function public.create_sale(jsonb, text, uuid, uuid, numeric) from public, anon;
grant execute on function public.create_sale(jsonb, text, uuid, uuid, numeric) to authenticated;

-- devolver_item ahora usa el % que efectivamente se aplicó en esa venta
-- (guardado en sales.porcentaje_cobertura), no el "sugerido" actual de
-- la obra social.
create or replace function public.devolver_item(p_sale_item_id uuid, p_qty numeric, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_item public.sale_items;
  v_sale public.sales;
  v_refund_lista numeric;
  v_refund_cobertura numeric := 0;
  v_refund_cliente numeric;
  v_refund_tax numeric;
  v_prod public.products;
  v_quien text;
begin
  if not public.is_admin() then raise exception 'Solo un administrador puede registrar devoluciones'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Indicá el motivo de la devolución'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Cantidad inválida'; end if;

  select * into v_item from public.sale_items where id = p_sale_item_id for update;
  if v_item.id is null then raise exception 'Ítem de venta no encontrado'; end if;

  select * into v_sale from public.sales where id = v_item.sale_id for update;
  if v_sale.id is null or v_sale.status <> 'completed' then raise exception 'La venta no está disponible para devoluciones'; end if;

  if p_qty > (v_item.quantity - v_item.returned_qty) then
    raise exception 'No podés devolver más de lo que queda sin devolver (quedan %)', (v_item.quantity - v_item.returned_qty);
  end if;

  select * into v_prod from public.products where id = v_item.product_id for update;

  v_refund_lista := round(p_qty * v_item.unit_price, 2);

  if v_item.con_cobertura and v_sale.obra_social_id is not null then
    v_refund_cobertura := round(v_refund_lista * coalesce(v_sale.porcentaje_cobertura, 0) / 100, 2);
  end if;
  v_refund_cliente := v_refund_lista - v_refund_cobertura;

  v_refund_tax := round(v_refund_lista * coalesce(v_prod.iva_rate, 0) / (100 + coalesce(v_prod.iva_rate, 0)), 2);

  update public.sale_items set returned_qty = returned_qty + p_qty where id = p_sale_item_id;

  update public.sales
     set total = round(total - v_refund_cliente, 2),
         tax = round(tax - v_refund_tax, 2),
         subtotal = round(subtotal - (v_refund_cliente - v_refund_tax), 2),
         valor_cobertura = round(valor_cobertura - v_refund_cobertura, 2)
   where id = v_sale.id;

  if v_prod.id is not null then
    update public.products set stock = round(stock + p_qty, 4) where id = v_prod.id;
    insert into public.stock_movements (product_id, type, quantity, reason, user_id)
    values (v_prod.id, 'entrada', p_qty, 'Devolución parcial venta #' || v_sale.invoice_number, auth.uid());
  end if;

  select name into v_quien from public.profiles where id = auth.uid();
  insert into public.alerts (type, severity, title, body, sale_id, register_id)
  values ('devolucion', 'info',
          'Devolución en venta #' || v_sale.invoice_number || ' (' || to_char(v_refund_cliente, 'FM999G999G990D00') || ')',
          'Registró ' || coalesce(v_quien, '?') || '. Motivo: ' || trim(p_reason),
          v_sale.id, v_sale.register_id);
end $$;

revoke all on function public.devolver_item(uuid, numeric, text) from public, anon;
grant execute on function public.devolver_item(uuid, numeric, text) to authenticated;
