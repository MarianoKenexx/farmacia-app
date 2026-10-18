-- ════════════════════════════════════════════════════════════════════
-- Arreglo: en Supabase, pgcrypto (las funciones crypt/gen_salt que
-- hashean el PIN) vive en el esquema "extensions", no en "public". Las
-- funciones de PIN buscaban solo en "public" y por eso fallaban con
-- "function gen_salt(unknown) does not exist". Se les agrega el
-- esquema "extensions" a la búsqueda.
-- ════════════════════════════════════════════════════════════════════

create or replace function public.set_my_pin(p_pin text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_admin() then
    raise exception 'Solo los administradores pueden tener un PIN de autorización';
  end if;
  if p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'El PIN tiene que ser de 4 a 6 números';
  end if;
  update public.profiles set pin_hash = crypt(p_pin, gen_salt('bf')) where id = auth.uid();
end $$;

create or replace function public.void_sale_with_pin(p_sale_id uuid, p_reason text, p_pin text)
returns void language plpgsql security definer set search_path = public, extensions as $$
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
