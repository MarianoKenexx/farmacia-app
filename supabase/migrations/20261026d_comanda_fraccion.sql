-- ════════════════════════════════════════════════════════════════════
-- Para poder armar bien el ticket final en Caja (mostrar "3 comprimidos"
-- en vez de "0.3 cajas"), hace falta guardar si el ítem se vendió
-- fraccionado o no — antes esa info solo vivía en la pantalla del POS
-- y se perdía. La guardamos en sale_items y la devolvemos en
-- detalle_comanda junto con los datos del producto para armar la
-- etiqueta de cantidad igual que en el despacho.
-- ════════════════════════════════════════════════════════════════════

alter table public.sale_items
  add column if not exists is_fraccion boolean not null default false;

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

    insert into public.sale_items (sale_id, product_id, quantity, unit_price, subtotal, con_cobertura, is_fraccion)
    values (v_sale.id, v_prod.id, v_qty, v_unit, v_sub, v_con_cobertura, v_frac);

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
          'unit_price', si.unit_price, 'subtotal', si.subtotal, 'con_cobertura', si.con_cobertura,
          'is_fraccion', si.is_fraccion, 'unidades_por_envase', p.unidades_por_envase,
          'nombre_fraccion', p.nombre_fraccion
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
