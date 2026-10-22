-- ════════════════════════════════════════════════════════════════════
-- Proveedores y compras: a quién le compramos y a qué costo, con
-- historial. Cada compra registrada suma stock automáticamente y deja
-- actualizado el costo del producto, con el mismo rastro de auditoría
-- (quién, cuándo) que el resto de la app.
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  cuit text,
  telefono text,
  contacto text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.compras (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid references public.proveedores(id) on delete set null,
  numero_factura text,
  total numeric not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.compra_items (
  id uuid primary key default gen_random_uuid(),
  compra_id uuid not null references public.compras(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity numeric(12,4) not null,
  costo_unitario numeric not null,
  subtotal numeric not null
);
create index if not exists compra_items_compra_idx on public.compra_items (compra_id);
create index if not exists compras_proveedor_idx on public.compras (proveedor_id);

create or replace function public.registrar_compra(p_proveedor_id uuid, p_numero_factura text, p_items jsonb)
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

  insert into public.compras (proveedor_id, numero_factura, total, created_by)
  values (p_proveedor_id, nullif(trim(coalesce(p_numero_factura, '')), ''), 0, auth.uid())
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

revoke all on function public.registrar_compra(uuid, text, jsonb) from public, anon;
grant execute on function public.registrar_compra(uuid, text, jsonb) to authenticated;

alter table public.proveedores enable row level security;
alter table public.compras enable row level security;
alter table public.compra_items enable row level security;

drop policy if exists proveedores_select on public.proveedores;
create policy proveedores_select on public.proveedores for select to authenticated using (public.has_perm('stock'));
drop policy if exists proveedores_write on public.proveedores;
create policy proveedores_write on public.proveedores for all to authenticated
  using (public.has_perm('stock')) with check (public.has_perm('stock'));

drop policy if exists compras_select on public.compras;
create policy compras_select on public.compras for select to authenticated using (public.has_perm('stock'));
drop policy if exists compra_items_select on public.compra_items;
create policy compra_items_select on public.compra_items for select to authenticated using (public.has_perm('stock'));
-- Las compras y sus ítems solo se crean vía registrar_compra (security definer).
revoke insert, update, delete on public.compras from authenticated;
revoke insert, update, delete on public.compra_items from authenticated;
