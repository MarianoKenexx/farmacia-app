-- ════════════════════════════════════════════════════════════════════
-- Seguridad (RLS), auditoría (quién hizo qué), anulación de ventas y alertas
-- Aplicado en el proyecto FARMAPP el 2026-10-17
-- ════════════════════════════════════════════════════════════════════

-- ─── 1. Funciones de ayuda para las reglas de acceso ────────────────

create or replace function public.app_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active = true
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.app_role() in ('admin', 'superadmin'), false)
$$;

create or replace function public.is_superadmin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.app_role() = 'superadmin', false)
$$;

-- Tiene habilitada la sección (los admin tienen todas)
create or replace function public.has_perm(p text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active = true
      and (role in ('admin', 'superadmin')
           or (permissions is not null and coalesce((permissions ->> p)::boolean, true)))
  )
$$;

-- ─── 2. Columnas nuevas: quién vendió, quién abrió/cerró, anulaciones ──

alter table public.sales
  add column if not exists user_id uuid default auth.uid() references public.profiles(id) on delete set null,
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references public.profiles(id) on delete set null,
  add column if not exists void_reason text;

alter table public.cash_registers
  add column if not exists opened_by uuid default auth.uid() references public.profiles(id) on delete set null,
  add column if not exists closed_by uuid references public.profiles(id) on delete set null;

-- Más precisión para fracciones (1/30 de caja = 0,0333)
alter table public.products alter column stock type numeric(12,4);
alter table public.products alter column min_stock type numeric(12,4);
alter table public.sale_items alter column quantity type numeric(12,4);
alter table public.stock_movements alter column quantity type numeric(12,4);

alter table public.stock_movements
  add column if not exists user_id uuid default auth.uid() references public.profiles(id) on delete set null;

create index if not exists sales_created_at_idx on public.sales (created_at);
create index if not exists sales_register_idx on public.sales (register_id);
create index if not exists sale_items_sale_idx on public.sale_items (sale_id);

-- Solo una caja abierta a la vez
create unique index if not exists one_open_register on public.cash_registers ((status)) where status = 'open';

-- ─── 3. Alertas ─────────────────────────────────────────────────────

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  type text not null,                 -- faltante | sobrante | sin_stock | stock_bajo | venta_anulada
  severity text not null default 'info', -- alta | media | info
  title text not null,
  body text,
  register_id uuid references public.cash_registers(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  sale_id uuid references public.sales(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists alerts_created_idx on public.alerts (created_at desc);

-- Alerta al cerrar caja con diferencia
create or replace function public.trg_register_closed()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_efectivo numeric;
  v_esperado numeric;
  v_diff numeric;
  v_quien text;
begin
  if new.status = 'closed' and old.status is distinct from 'closed' then
    select coalesce(sum(total), 0) into v_efectivo
      from public.sales
     where register_id = new.id and status = 'completed' and payment_method = 'efectivo';
    v_esperado := coalesce(new.opening_amount, 0) + v_efectivo;
    v_diff := coalesce(new.closing_amount, 0) - v_esperado;
    select name into v_quien from public.profiles where id = new.closed_by;

    if v_diff <= -1 then
      insert into public.alerts (type, severity, title, body, register_id)
      values ('faltante', 'alta',
              'Faltante en caja: ' || to_char(abs(v_diff), 'FM999G999G990D00'),
              'Cerró ' || coalesce(v_quien, 'sin usuario') || '. Esperado ' || to_char(v_esperado, 'FM999G999G990D00')
                || ', contado ' || to_char(new.closing_amount, 'FM999G999G990D00') || '.',
              new.id);
    elsif v_diff >= 1 then
      insert into public.alerts (type, severity, title, body, register_id)
      values ('sobrante', 'media',
              'Sobrante en caja: ' || to_char(v_diff, 'FM999G999G990D00'),
              'Cerró ' || coalesce(v_quien, 'sin usuario') || '. Esperado ' || to_char(v_esperado, 'FM999G999G990D00')
                || ', contado ' || to_char(new.closing_amount, 'FM999G999G990D00') || '.',
              new.id);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists on_register_closed on public.cash_registers;
create trigger on_register_closed after update on public.cash_registers
  for each row execute function public.trg_register_closed();

-- Alerta cuando un producto se queda sin stock o baja del mínimo
create or replace function public.trg_product_stock()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.active and new.stock is distinct from old.stock then
    if new.stock <= 0 and old.stock > 0 then
      insert into public.alerts (type, severity, title, body, product_id)
      values ('sin_stock', 'alta', 'Sin stock: ' || new.name, 'Hay que reponer.', new.id);
    elsif new.min_stock > 0 and new.stock <= new.min_stock and old.stock > new.min_stock then
      insert into public.alerts (type, severity, title, body, product_id)
      values ('stock_bajo', 'media', 'Stock bajo: ' || new.name,
              'Quedan ' || trim(to_char(new.stock, 'FM999990D99')) || ' (mínimo ' || trim(to_char(new.min_stock, 'FM999990D99')) || ').',
              new.id);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists on_product_stock on public.products;
create trigger on_product_stock after update of stock on public.products
  for each row execute function public.trg_product_stock();

-- ─── 4. Operaciones de caja y venta (todo junto o nada) ─────────────

create or replace function public.open_register(p_amount numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.has_perm('caja') then raise exception 'No tenés permiso para abrir la caja'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'Monto inicial inválido'; end if;
  if exists (select 1 from public.cash_registers where status = 'open') then
    raise exception 'Ya hay una caja abierta';
  end if;
  insert into public.cash_registers (opening_amount, status, opened_by)
  values (p_amount, 'open', auth.uid()) returning id into v_id;
  return v_id;
end $$;

create or replace function public.close_register(p_amount numeric)
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.has_perm('caja') then raise exception 'No tenés permiso para cerrar la caja'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'Monto contado inválido'; end if;
  select id into v_id from public.cash_registers where status = 'open' for update;
  if v_id is null then raise exception 'No hay ninguna caja abierta'; end if;
  update public.cash_registers
     set closing_amount = p_amount, closed_at = now(), status = 'closed', closed_by = auth.uid()
   where id = v_id;
end $$;

-- p_items: [{ "product_id": "...", "quantity": 1, "is_fraccion": false }, ...]
-- Los precios se toman de la base, no de la pantalla.
create or replace function public.create_sale(p_items jsonb, p_payment_method text, p_customer_id uuid default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_reg uuid;
  v_sale public.sales;
  v_item jsonb;
  v_prod public.products;
  v_qty numeric;
  v_frac boolean;
  v_upe numeric;
  v_unit numeric;
  v_sub numeric;
  v_total numeric := 0;
  v_tax numeric := 0;
  v_lines jsonb := '[]'::jsonb;
begin
  if not public.has_perm('pos') then raise exception 'No tenés permiso para vender'; end if;
  if p_payment_method not in ('efectivo', 'debito', 'credito', 'transferencia', 'qr') then
    raise exception 'Método de pago inválido';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'El carrito está vacío'; end if;

  select id into v_reg from public.cash_registers where status = 'open' limit 1;
  if v_reg is null then raise exception 'La caja está cerrada. Abrila antes de cobrar.'; end if;

  insert into public.sales (subtotal, tax, total, payment_method, register_id, customer_id, status, user_id)
  values (0, 0, 0, p_payment_method, v_reg, p_customer_id, 'completed', auth.uid())
  returning * into v_sale;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item ->> 'quantity')::numeric;
    v_frac := coalesce((v_item ->> 'is_fraccion')::boolean, false);
    if v_qty is null or v_qty <= 0 then raise exception 'Cantidad inválida'; end if;

    select * into v_prod from public.products where id = (v_item ->> 'product_id')::uuid and active for update;
    if v_prod.id is null then raise exception 'Producto no encontrado o inactivo'; end if;

    v_upe := greatest(coalesce(v_prod.unidades_por_envase, 1), 1);
    v_unit := round(case when v_frac then v_prod.sale_price / v_upe else v_prod.sale_price end, 2);
    v_sub := round(v_qty * v_prod.sale_price, 2);
    v_total := v_total + v_sub;
    v_tax := v_tax + round(v_sub * coalesce(v_prod.iva_rate, 0) / (100 + coalesce(v_prod.iva_rate, 0)), 2);

    insert into public.sale_items (sale_id, product_id, quantity, unit_price, subtotal)
    values (v_sale.id, v_prod.id, v_qty, v_unit, v_sub);

    update public.products set stock = round(stock - v_qty, 4) where id = v_prod.id;

    insert into public.stock_movements (product_id, type, quantity, reason, user_id)
    values (v_prod.id, 'salida', v_qty, 'Venta #' || v_sale.invoice_number, auth.uid());

    v_lines := v_lines || jsonb_build_object('product_id', v_prod.id, 'unit_price', v_unit, 'subtotal', v_sub);
  end loop;

  update public.sales set subtotal = v_total - v_tax, tax = v_tax, total = v_total where id = v_sale.id;

  return json_build_object(
    'id', v_sale.id, 'invoice_number', v_sale.invoice_number, 'created_at', v_sale.created_at,
    'total', v_total, 'tax', v_tax, 'neto', v_total - v_tax, 'lines', v_lines
  );
end $$;

-- Anular una venta: queda registrada, se devuelve el stock y avisa
create or replace function public.void_sale(p_sale_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_sale public.sales;
  v_it record;
  v_quien text;
begin
  if not public.is_admin() then raise exception 'Solo un administrador puede anular ventas'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Indicá el motivo de la anulación'; end if;

  select * into v_sale from public.sales where id = p_sale_id for update;
  if v_sale.id is null then raise exception 'Venta no encontrada'; end if;
  if v_sale.status <> 'completed' then raise exception 'La venta ya estaba anulada'; end if;

  update public.sales
     set status = 'voided', voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason)
   where id = p_sale_id;

  for v_it in select product_id, quantity from public.sale_items where sale_id = p_sale_id loop
    update public.products set stock = round(stock + v_it.quantity, 4) where id = v_it.product_id;
    insert into public.stock_movements (product_id, type, quantity, reason, user_id)
    values (v_it.product_id, 'entrada', v_it.quantity, 'Anulación venta #' || v_sale.invoice_number, auth.uid());
  end loop;

  select name into v_quien from public.profiles where id = auth.uid();
  insert into public.alerts (type, severity, title, body, sale_id, register_id)
  values ('venta_anulada', 'info',
          'Venta #' || v_sale.invoice_number || ' anulada (' || to_char(v_sale.total, 'FM999G999G990D00') || ')',
          'Anuló ' || coalesce(v_quien, '?') || '. Motivo: ' || trim(p_reason),
          v_sale.id, v_sale.register_id);
end $$;

revoke all on function public.open_register(numeric) from public, anon;
revoke all on function public.close_register(numeric) from public, anon;
revoke all on function public.create_sale(jsonb, text, uuid) from public, anon;
revoke all on function public.void_sale(uuid, text) from public, anon;
grant execute on function public.open_register(numeric) to authenticated;
grant execute on function public.close_register(numeric) to authenticated;
grant execute on function public.create_sale(jsonb, text, uuid) to authenticated;
grant execute on function public.void_sale(uuid, text) to authenticated;

-- ─── 5. Reglas de acceso (RLS) ──────────────────────────────────────

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.cash_registers enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.alerts enable row level security;

-- profiles: cada uno ve el suyo; los admin ven todos. Los cambios solo desde el servidor.
drop policy if exists "Authenticated read all profiles" on public.profiles;
drop policy if exists "Users insert own profile" on public.profiles;
drop policy if exists "Users update own profile" on public.profiles;
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- categories: todos leen, admin escribe
drop policy if exists "Admins write categories" on public.categories;
drop policy if exists categories_write on public.categories;
create policy categories_write on public.categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- products
drop policy if exists products_select on public.products;
drop policy if exists products_insert on public.products;
drop policy if exists products_update on public.products;
drop policy if exists products_delete on public.products;
create policy products_select on public.products for select to authenticated using (public.app_role() is not null);
create policy products_insert on public.products for insert to authenticated with check (public.has_perm('productos'));
create policy products_update on public.products for update to authenticated
  using (public.has_perm('productos') or public.has_perm('stock'))
  with check (public.has_perm('productos') or public.has_perm('stock'));
create policy products_delete on public.products for delete to authenticated using (public.has_perm('productos'));

-- customers
drop policy if exists customers_select on public.customers;
drop policy if exists customers_insert on public.customers;
drop policy if exists customers_update on public.customers;
drop policy if exists customers_delete on public.customers;
create policy customers_select on public.customers for select to authenticated
  using (public.has_perm('clientes') or public.has_perm('pos'));
create policy customers_insert on public.customers for insert to authenticated
  with check (public.has_perm('clientes') or public.has_perm('pos'));
create policy customers_update on public.customers for update to authenticated
  using (public.has_perm('clientes')) with check (public.has_perm('clientes'));
create policy customers_delete on public.customers for delete to authenticated using (public.is_admin());

-- cash_registers: el cajero solo ve la caja abierta; los cambios van por open/close_register
drop policy if exists registers_select on public.cash_registers;
create policy registers_select on public.cash_registers for select to authenticated
  using (public.is_admin() or (status = 'open' and (public.has_perm('caja') or public.has_perm('pos'))));

-- sales y sale_items: solo admin lee; se crean/anulan por funciones; se borran desde el servidor
drop policy if exists sales_select on public.sales;
create policy sales_select on public.sales for select to authenticated using (public.is_admin());
drop policy if exists sale_items_select on public.sale_items;
create policy sale_items_select on public.sale_items for select to authenticated using (public.is_admin());

-- stock_movements
drop policy if exists stock_mov_select on public.stock_movements;
drop policy if exists stock_mov_insert on public.stock_movements;
create policy stock_mov_select on public.stock_movements for select to authenticated using (public.has_perm('stock'));
create policy stock_mov_insert on public.stock_movements for insert to authenticated with check (public.has_perm('stock'));

-- alerts: solo admin
drop policy if exists alerts_select on public.alerts;
drop policy if exists alerts_update on public.alerts;
create policy alerts_select on public.alerts for select to authenticated using (public.is_admin());
create policy alerts_update on public.alerts for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Imágenes de productos: subir/cambiar/borrar solo quien edita productos
drop policy if exists "Auth upload product images" on storage.objects;
drop policy if exists "Auth update product images" on storage.objects;
drop policy if exists "Auth delete product images" on storage.objects;
create policy "Auth upload product images" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.has_perm('productos'));
create policy "Auth update product images" on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.has_perm('productos'));
create policy "Auth delete product images" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.has_perm('productos'));

-- ─── 6. Tiempo real para las alertas ────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'alerts') then
    alter publication supabase_realtime add table public.alerts;
  end if;
end $$;
