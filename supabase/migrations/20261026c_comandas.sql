-- ════════════════════════════════════════════════════════════════════
-- Comandera: el farmacéutico despacha el producto y arma una "comanda"
-- (no una venta cerrada todavía) — el stock baja ahí mismo, porque el
-- producto ya salió físicamente del estante. La caja, por separado,
-- cobra esa comanda (puede ajustar cliente/obra social antes de
-- cobrar) y recién ahí queda como venta completada.
--
-- Reusa la tabla sales con un estado nuevo: 'pendiente_cobro'. Como
-- sales_select/sale_items_select son solo para admin, todo lo que
-- necesita la pantalla de caja para listar y cobrar comandas va por
-- funciones (RPC) que devuelven json, igual que create_sale.
-- ════════════════════════════════════════════════════════════════════

-- Despacha una comanda: valida y descuenta stock, arma las líneas,
-- pero NO pide método de pago ni cierra la venta.
create or replace function public.despachar_comanda(
  p_items jsonb, p_customer_id uuid default null,
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
  if not public.has_perm('pos') then raise exception 'No tenés permiso para despachar'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'El carrito está vacío'; end if;

  select id into v_reg from public.cash_registers where status = 'open' limit 1;
  if v_reg is null then raise exception 'La caja está cerrada. Abrila antes de despachar.'; end if;

  if p_obra_social_id is not null then
    select porcentaje_cobertura into v_pct_default from public.obras_sociales where id = p_obra_social_id and active;
    if v_pct_default is null then raise exception 'Obra social no encontrada o inactiva'; end if;
    v_pct := coalesce(p_porcentaje_cobertura, v_pct_default);
    if v_pct < 0 or v_pct > 100 then raise exception 'El %% de cobertura tiene que estar entre 0 y 100'; end if;
  end if;

  insert into public.sales (subtotal, tax, total, payment_method, register_id, customer_id, status, user_id, obra_social_id, porcentaje_cobertura)
  values (0, 0, 0, null, v_reg, p_customer_id, 'pendiente_cobro', auth.uid(), p_obra_social_id,
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
    values (v_prod.id, 'salida', v_qty, 'Comanda #' || v_sale.invoice_number, auth.uid());

    v_lines := v_lines || jsonb_build_object('product_id', v_prod.id, 'unit_price', v_unit, 'subtotal', v_sub);
  end loop;

  v_cobertura := round(v_base_cobertura * v_pct / 100, 2);
  v_cobrado := v_total - v_cobertura;

  update public.sales
     set subtotal = v_cobrado - v_tax, tax = v_tax, total = v_cobrado, valor_cobertura = v_cobertura
   where id = v_sale.id;

  return json_build_object(
    'id', v_sale.id, 'invoice_number', v_sale.invoice_number, 'created_at', v_sale.created_at,
    'total', v_cobrado, 'tax', v_tax, 'neto', v_cobrado - v_tax, 'lines', v_lines,
    'valor_cobertura', v_cobertura, 'valor_lista', v_total
  );
end $$;

revoke all on function public.despachar_comanda(jsonb, uuid, uuid, numeric) from public, anon;
grant execute on function public.despachar_comanda(jsonb, uuid, uuid, numeric) to authenticated;

-- Lista las comandas pendientes de cobro de la caja que está abierta ahora.
create or replace function public.listar_comandas_pendientes()
returns json language plpgsql security definer set search_path = public as $$
declare
  v_reg uuid;
begin
  if not (public.has_perm('caja') or public.is_admin()) then
    raise exception 'No tenés permiso para ver las comandas';
  end if;
  select id into v_reg from public.cash_registers where status = 'open' limit 1;
  if v_reg is null then return '[]'::json; end if;

  return coalesce((
    select json_agg(row_to_json(t) order by t.created_at asc) from (
      select s.id, s.invoice_number, s.created_at, s.total,
             c.name as customer_name,
             (select count(*) from public.sale_items si where si.sale_id = s.id) as items_count
        from public.sales s
        left join public.customers c on c.id = s.customer_id
       where s.register_id = v_reg and s.status = 'pendiente_cobro'
    ) t
  ), '[]'::json);
end $$;

revoke all on function public.listar_comandas_pendientes() from public, anon;
grant execute on function public.listar_comandas_pendientes() to authenticated;

-- Detalle completo de una comanda (para revisar/ajustar antes de cobrar e imprimir el ticket final).
create or replace function public.detalle_comanda(p_sale_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_reg uuid;
  v_sale public.sales;
begin
  if not (public.has_perm('caja') or public.is_admin()) then
    raise exception 'No tenés permiso para ver esta comanda';
  end if;
  select id into v_reg from public.cash_registers where status = 'open' limit 1;

  select * into v_sale from public.sales where id = p_sale_id and status = 'pendiente_cobro';
  if v_sale.id is null then raise exception 'Comanda no encontrada o ya resuelta'; end if;
  if v_reg is null or v_sale.register_id is distinct from v_reg then
    raise exception 'Esa comanda no corresponde a la caja abierta';
  end if;

  return (
    select json_build_object(
      'id', s.id, 'invoice_number', s.invoice_number, 'created_at', s.created_at,
      'customer_id', s.customer_id, 'customer_name', c.name,
      'obra_social_id', s.obra_social_id, 'obra_social_nombre', os.nombre,
      'porcentaje_cobertura', s.porcentaje_cobertura,
      'total', s.total, 'valor_cobertura', s.valor_cobertura,
      'lines', (
        select coalesce(json_agg(json_build_object(
          'product_id', si.product_id, 'name', p.name, 'quantity', si.quantity,
          'unit_price', si.unit_price, 'subtotal', si.subtotal, 'con_cobertura', si.con_cobertura
        )), '[]'::json)
        from public.sale_items si join public.products p on p.id = si.product_id
       where si.sale_id = s.id
      )
    )
    from public.sales s
    left join public.customers c on c.id = s.customer_id
    left join public.obras_sociales os on os.id = s.obra_social_id
    where s.id = p_sale_id
  );
end $$;

revoke all on function public.detalle_comanda(uuid) from public, anon;
grant execute on function public.detalle_comanda(uuid) to authenticated;

-- Cobra una comanda: elige método de pago y, si hace falta, ajusta
-- cliente/obra social/% de cobertura (lo que viene de la comanda es
-- un valor de partida, no algo fijo). El stock NO se vuelve a tocar:
-- ya bajó al despachar.
create or replace function public.cobrar_comanda(
  p_sale_id uuid, p_payment_method text,
  p_customer_id uuid default null, p_obra_social_id uuid default null,
  p_porcentaje_cobertura numeric default null
)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_reg uuid;
  v_sale public.sales;
  v_total numeric;
  v_tax numeric;
  v_base_cobertura numeric;
  v_pct_default numeric;
  v_pct numeric := 0;
  v_cobertura numeric := 0;
  v_cobrado numeric;
begin
  if not (public.has_perm('caja') or public.is_admin()) then
    raise exception 'No tenés permiso para cobrar';
  end if;
  if p_payment_method not in ('efectivo', 'debito', 'credito', 'transferencia', 'qr', 'fiado') then
    raise exception 'Método de pago inválido';
  end if;
  if p_payment_method = 'fiado' and p_customer_id is null then
    raise exception 'Para fiar una venta tenés que elegir un cliente';
  end if;

  select id into v_reg from public.cash_registers where status = 'open' limit 1;
  if v_reg is null then raise exception 'La caja está cerrada'; end if;

  select * into v_sale from public.sales where id = p_sale_id for update;
  if v_sale.id is null then raise exception 'Comanda no encontrada'; end if;
  if v_sale.status <> 'pendiente_cobro' then raise exception 'Esta comanda ya fue cobrada o anulada'; end if;
  if v_sale.register_id is distinct from v_reg then raise exception 'Esa comanda no corresponde a la caja abierta'; end if;

  select coalesce(sum(subtotal), 0) into v_total from public.sale_items where sale_id = p_sale_id;
  select coalesce(sum(subtotal), 0) into v_base_cobertura from public.sale_items where sale_id = p_sale_id and con_cobertura;
  v_tax := v_sale.tax;

  if p_obra_social_id is not null then
    select porcentaje_cobertura into v_pct_default from public.obras_sociales where id = p_obra_social_id and active;
    if v_pct_default is null then raise exception 'Obra social no encontrada o inactiva'; end if;
    v_pct := coalesce(p_porcentaje_cobertura, v_pct_default);
    if v_pct < 0 or v_pct > 100 then raise exception 'El %% de cobertura tiene que estar entre 0 y 100'; end if;
  end if;

  v_cobertura := round(v_base_cobertura * v_pct / 100, 2);
  v_cobrado := v_total - v_cobertura;

  update public.sales
     set payment_method = p_payment_method,
         customer_id = p_customer_id,
         obra_social_id = p_obra_social_id,
         porcentaje_cobertura = case when p_obra_social_id is not null then v_pct else null end,
         subtotal = v_cobrado - v_tax, tax = v_tax, total = v_cobrado,
         valor_cobertura = v_cobertura,
         estado_reclamo = case when v_cobertura > 0 then 'pendiente' else null end,
         status = 'completed'
   where id = p_sale_id;

  return json_build_object(
    'id', v_sale.id, 'invoice_number', v_sale.invoice_number, 'created_at', v_sale.created_at,
    'total', v_cobrado, 'tax', v_tax, 'neto', v_cobrado - v_tax,
    'valor_cobertura', v_cobertura, 'valor_lista', v_total
  );
end $$;

revoke all on function public.cobrar_comanda(uuid, text, uuid, uuid, numeric) from public, anon;
grant execute on function public.cobrar_comanda(uuid, text, uuid, uuid, numeric) to authenticated;

-- Anula una comanda sin cobrar (el cliente se arrepintió, se perdió el
-- papel, etc.) con PIN de supervisor — igual que anular una venta,
-- pero acá se le devuelve el stock porque ya se había descontado al
-- despachar.
create or replace function public.anular_comanda_with_pin(p_sale_id uuid, p_reason text, p_pin text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_admin_id uuid;
  v_quien text;
  v_sale public.sales;
  v_it record;
  v_reg uuid;
begin
  if coalesce(trim(p_reason), '') = '' then raise exception 'Indicá el motivo de la anulación'; end if;
  if coalesce(trim(p_pin), '') = '' then raise exception 'Ingresá el PIN del supervisor'; end if;

  select id into v_admin_id from public.profiles
   where role in ('admin', 'superadmin') and active and pin_hash is not null
     and pin_hash = crypt(p_pin, pin_hash)
   limit 1;
  if v_admin_id is null then raise exception 'PIN incorrecto'; end if;

  select * into v_sale from public.sales where id = p_sale_id for update;
  if v_sale.id is null then raise exception 'Comanda no encontrada'; end if;
  if v_sale.status <> 'pendiente_cobro' then raise exception 'Esta comanda ya fue cobrada o anulada'; end if;

  select id into v_reg from public.cash_registers where status = 'open' limit 1;
  if v_reg is null or v_sale.register_id is distinct from v_reg then
    raise exception 'Esa comanda no corresponde a la caja abierta';
  end if;

  update public.sales
     set status = 'voided', voided_at = now(), voided_by = auth.uid(),
         void_reason = trim(p_reason), pin_authorized_by = v_admin_id
   where id = p_sale_id;

  for v_it in select product_id, quantity from public.sale_items where sale_id = p_sale_id loop
    update public.products set stock = round(stock + v_it.quantity, 4) where id = v_it.product_id;
    insert into public.stock_movements (product_id, type, quantity, reason, user_id)
    values (v_it.product_id, 'entrada', v_it.quantity, 'Anulación comanda #' || v_sale.invoice_number, auth.uid());
  end loop;

  select name into v_quien from public.profiles where id = auth.uid();
  insert into public.alerts (type, severity, title, body, sale_id, register_id)
  values ('comanda_anulada', 'info',
          'Comanda #' || v_sale.invoice_number || ' anulada (' || to_char(v_sale.total, 'FM999G999G990D00') || ')',
          'Anuló ' || coalesce(v_quien, '?') || '. Motivo: ' || trim(p_reason),
          v_sale.id, v_sale.register_id);
end $$;

revoke all on function public.anular_comanda_with_pin(uuid, text, text) from public, anon;
grant execute on function public.anular_comanda_with_pin(uuid, text, text) to authenticated;
