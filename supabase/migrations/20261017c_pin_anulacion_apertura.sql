-- ════════════════════════════════════════════════════════════════════
-- Más control sobre el cajero:
-- 1) El cajero puede pedir la anulación de una venta desde el Punto de
--    Venta, pero solo si un admin confirma con su PIN ahí mismo.
-- 2) Si lo que se cuenta al ABRIR la caja no coincide con lo que había
--    quedado contado en el cierre anterior, se genera una alerta (solo
--    la ve un admin, el cajero no).
-- ════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- PIN de autorización de cada admin (hasheado, nunca en texto plano)
alter table public.profiles add column if not exists pin_hash text;

-- Quién (admin) autorizó con su PIN una anulación pedida por un cajero
alter table public.sales add column if not exists pin_authorized_by uuid references public.profiles(id) on delete set null;

-- ─── Un admin define/cambia su propio PIN (4 a 6 números) ───────────
create or replace function public.set_my_pin(p_pin text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Solo los administradores pueden tener un PIN de autorización';
  end if;
  if p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'El PIN tiene que ser de 4 a 6 números';
  end if;
  update public.profiles set pin_hash = crypt(p_pin, gen_salt('bf')) where id = auth.uid();
end $$;

create or replace function public.clear_my_pin()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'No corresponde'; end if;
  update public.profiles set pin_hash = null where id = auth.uid();
end $$;

-- Para mostrar en Configuración si el admin que mira ya tiene un PIN cargado (sin exponerlo)
create or replace function public.my_pin_set()
returns boolean language sql stable security definer set search_path = public as $$
  select pin_hash is not null from public.profiles where id = auth.uid()
$$;

-- ─── Anulación pedida por el cajero, confirmada con el PIN de un admin ──
-- Solo puede anular ventas de la caja que está abierta en este momento
-- (no deja tocar ventas de cajas ya cerradas). El admin, en cambio,
-- sigue anulando sin PIN desde Historial con la función void_sale de siempre.
create or replace function public.void_sale_with_pin(p_sale_id uuid, p_reason text, p_pin text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_admin_id uuid;
  v_admin_name text;
  v_quien text;
  v_sale public.sales;
  v_it record;
  v_open_reg uuid;
begin
  if coalesce(trim(p_reason), '') = '' then raise exception 'Indicá el motivo de la anulación'; end if;
  if coalesce(trim(p_pin), '') = '' then raise exception 'Ingresá el PIN del supervisor'; end if;

  select id, name into v_admin_id, v_admin_name
    from public.profiles
   where role in ('admin', 'superadmin') and active and pin_hash is not null
     and pin_hash = crypt(p_pin, pin_hash)
   limit 1;
  if v_admin_id is null then raise exception 'PIN incorrecto'; end if;

  select * into v_sale from public.sales where id = p_sale_id for update;
  if v_sale.id is null then raise exception 'Venta no encontrada'; end if;
  if v_sale.status <> 'completed' then raise exception 'La venta ya estaba anulada'; end if;

  -- Un cajero (o cualquiera que no sea admin) solo puede anular una venta
  -- de la caja que sigue abierta ahora mismo, y que haya hecho él mismo.
  if not public.is_admin() then
    select id into v_open_reg from public.cash_registers where status = 'open' limit 1;
    if v_open_reg is null or v_sale.register_id is distinct from v_open_reg then
      raise exception 'Esa venta ya no se puede anular desde acá';
    end if;
    if v_sale.user_id is distinct from auth.uid() then
      raise exception 'Solo podés anular una venta que vos mismo cobraste';
    end if;
  end if;

  update public.sales
     set status = 'voided', voided_at = now(), voided_by = auth.uid(),
         void_reason = trim(p_reason), pin_authorized_by = v_admin_id
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
          'Pidió la anulación ' || coalesce(v_quien, '?') || ', autorizó ' || coalesce(v_admin_name, '?')
            || ' con PIN. Motivo: ' || trim(p_reason),
          v_sale.id, v_sale.register_id);
end $$;

revoke all on function public.set_my_pin(text) from public, anon;
revoke all on function public.clear_my_pin() from public, anon;
revoke all on function public.my_pin_set() from public, anon;
revoke all on function public.void_sale_with_pin(uuid, text, text) from public, anon;
grant execute on function public.set_my_pin(text) to authenticated;
grant execute on function public.clear_my_pin() to authenticated;
grant execute on function public.my_pin_set() to authenticated;
grant execute on function public.void_sale_with_pin(uuid, text, text) to authenticated;

-- ─── Aviso si lo contado al abrir no coincide con el último cierre ──
create or replace function public.open_register(p_amount numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_last_close numeric;
  v_diff numeric;
  v_quien text;
begin
  if not public.has_perm('caja') then raise exception 'No tenés permiso para abrir la caja'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'Monto inicial inválido'; end if;
  if exists (select 1 from public.cash_registers where status = 'open') then
    raise exception 'Ya hay una caja abierta';
  end if;

  insert into public.cash_registers (opening_amount, status, opened_by)
  values (p_amount, 'open', auth.uid()) returning id into v_id;

  select closing_amount into v_last_close
    from public.cash_registers
   where status = 'closed' and closing_amount is not null
   order by closed_at desc limit 1;

  if v_last_close is not null then
    v_diff := p_amount - v_last_close;
    if abs(v_diff) >= 1 then
      select name into v_quien from public.profiles where id = auth.uid();
      insert into public.alerts (type, severity, title, body, register_id)
      values ('apertura_no_coincide',
              case when abs(v_diff) >= 500 then 'alta' else 'media' end,
              'La apertura no coincide con el último cierre (' ||
                (case when v_diff > 0 then '+' else '' end) || to_char(v_diff, 'FM999G999G990D00') || ')',
              'Abrió ' || coalesce(v_quien, 'sin usuario') || ' con ' || to_char(p_amount, 'FM999G999G990D00')
                || '. El cierre anterior había quedado contado en ' || to_char(v_last_close, 'FM999G999G990D00') || '.',
              v_id);
    end if;
  end if;

  return v_id;
end $$;
