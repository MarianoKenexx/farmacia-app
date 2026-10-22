-- ════════════════════════════════════════════════════════════════════
-- Trazabilidad del trámite de recetas con obra social.
--
-- Problema que resuelve: el cobro real a la obra social pasa por fuera
-- de la app (alguien entrega las recetas, la obra social paga después).
-- Para que eso no se preste a que esa persona se quede con parte del
-- dinero sin que nadie lo note, dejamos registrado automáticamente
-- QUIÉN marcó cada cambio de estado y CUÁNDO, y al marcar "cobrado"
-- pedimos el monto realmente recibido para compararlo con lo que la
-- app esperaba cobrar. Si no coincide, se nota enseguida.
-- ════════════════════════════════════════════════════════════════════

alter table public.sales
  add column if not exists estado_reclamo_at timestamptz,
  add column if not exists estado_reclamo_by uuid references public.profiles(id) on delete set null,
  add column if not exists monto_cobrado numeric;

-- Marcar "cobrado" es el paso más sensible (ahí se confirma que entró
-- la plata): lo deja solo el dueño (superadmin), no quien gestiona el
-- trámite día a día si esa persona es un admin común. Los pasos
-- anteriores (pendiente → presentado) los puede marcar cualquier admin,
-- como ya funcionaba.
create or replace function public.set_estado_reclamo(p_sale_id uuid, p_estado text, p_monto_cobrado numeric default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_sale public.sales;
begin
  if p_estado not in ('pendiente', 'presentado', 'cobrado') then raise exception 'Estado inválido'; end if;

  select * into v_sale from public.sales where id = p_sale_id and valor_cobertura > 0 for update;
  if v_sale.id is null then raise exception 'Venta no encontrada o sin cobertura de obra social'; end if;

  if p_estado = 'cobrado' then
    if not public.is_superadmin() then raise exception 'Solo el dueño puede confirmar que la obra social pagó'; end if;
    if p_monto_cobrado is null or p_monto_cobrado < 0 then raise exception 'Indicá el monto realmente cobrado'; end if;
  else
    if not public.is_admin() then raise exception 'Solo un administrador puede hacer esto'; end if;
  end if;

  update public.sales
     set estado_reclamo = p_estado,
         estado_reclamo_at = now(),
         estado_reclamo_by = auth.uid(),
         monto_cobrado = case when p_estado = 'cobrado' then p_monto_cobrado else monto_cobrado end
   where id = p_sale_id;
end $$;

revoke all on function public.set_estado_reclamo(uuid, text, numeric) from public, anon;
grant execute on function public.set_estado_reclamo(uuid, text, numeric) to authenticated;

-- Si quedó alguna función vieja con otra firma (2 argumentos), la sacamos
-- para que no quede ambigüedad de cuál se llama.
drop function if exists public.set_estado_reclamo(uuid, text);
