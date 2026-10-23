-- ════════════════════════════════════════════════════════════════════
-- Reinicio total de datos: para cuando se termina el período de prueba
-- y se quiere arrancar operativo con todo en cero.
--
-- Borra TODO lo que se carga usando la app (productos, categorías,
-- obras sociales, proveedores, compras, clientes, lotes, ventas, caja,
-- movimientos de stock, auditoría de precios, alertas).
--
-- NO borra: los usuarios/logins (profiles), la configuración de marca
-- y ticket (app_settings) ni las credenciales de ARCA (arca_credentials)
-- — eso es configuración de la farmacia, no datos de prueba, y hace
-- falta para poder seguir entrando a la app después del reinicio.
--
-- Solo lo puede ejecutar un superadmin (se valida acá adentro, aparte
-- de lo que ya valide la pantalla que llama a esto).
-- ════════════════════════════════════════════════════════════════════

create or replace function public.reiniciar_datos_app()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_superadmin() then
    raise exception 'Solo un superadmin puede reiniciar los datos de la app';
  end if;

  truncate table
    public.sale_items,
    public.sales,
    public.compra_items,
    public.compras,
    public.stock_movements,
    public.price_change_log,
    public.lotes,
    public.alerts,
    public.cash_registers,
    public.products,
    public.categories,
    public.customers,
    public.proveedores,
    public.obras_sociales
  cascade;
end $$;

revoke all on function public.reiniciar_datos_app() from public, anon;
grant execute on function public.reiniciar_datos_app() to authenticated;
