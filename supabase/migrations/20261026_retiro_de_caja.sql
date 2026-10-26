-- ════════════════════════════════════════════════════════════════════
-- Retiro de caja: sacar efectivo de la caja para pagar algo (luz, agua,
-- un flete, etc.) sin que esa plata "desaparezca" sin dejar rastro.
--
-- Se registra con un motivo obligatorio, queda ligado a la caja que
-- estaba abierta en ese momento, y resta del "esperado en caja" al
-- hacer el arqueo/cierre (eso se calcula en la pantalla de Caja).
-- También genera una alerta, igual que una devolución, para que quede
-- visible para el dueño/admin.
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.cash_withdrawals (
  id uuid primary key default gen_random_uuid(),
  register_id uuid not null references public.cash_registers(id) on delete cascade,
  amount numeric not null check (amount > 0),
  motivo text not null,
  user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists cash_withdrawals_register_idx on public.cash_withdrawals(register_id);

alter table public.cash_withdrawals enable row level security;

-- Mismo criterio que cash_registers: el cajero ve los retiros de la caja
-- que está abierta (los suyos y los de otros cajeros de ese turno); el
-- historial completo de cajas ya cerradas es solo para admin.
drop policy if exists cash_withdrawals_select on public.cash_withdrawals;
create policy cash_withdrawals_select on public.cash_withdrawals for select to authenticated
  using (
    public.is_admin()
    or (
      (public.has_perm('caja') or public.has_perm('pos'))
      and exists (
        select 1 from public.cash_registers r
        where r.id = cash_withdrawals.register_id and r.status = 'open'
      )
    )
  );

-- No hay policy de insert: se crea únicamente a través de retirar_de_caja,
-- que corre con privilegios de función (mismo patrón que create_sale).

create or replace function public.retirar_de_caja(p_monto numeric, p_motivo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_reg uuid;
  v_id uuid;
  v_quien text;
begin
  if not (public.has_perm('caja') or public.has_perm('pos')) then
    raise exception 'No tenés permiso para retirar de caja';
  end if;
  if p_monto is null or p_monto <= 0 then raise exception 'Monto inválido'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Indicá para qué es el retiro'; end if;

  select id into v_reg from public.cash_registers where status = 'open' limit 1;
  if v_reg is null then raise exception 'La caja está cerrada'; end if;

  insert into public.cash_withdrawals (register_id, amount, motivo, user_id)
  values (v_reg, p_monto, trim(p_motivo), auth.uid())
  returning id into v_id;

  select name into v_quien from public.profiles where id = auth.uid();
  insert into public.alerts (type, severity, title, body, register_id)
  values ('retiro_caja', 'info',
          'Retiro de caja: ' || to_char(p_monto, 'FM999G999G990D00'),
          coalesce(v_quien, '?') || ' retiró efectivo de la caja. Motivo: ' || trim(p_motivo),
          v_reg);

  return v_id;
end $$;

revoke all on function public.retirar_de_caja(numeric, text) from public, anon;
grant execute on function public.retirar_de_caja(numeric, text) to authenticated;
