-- ════════════════════════════════════════════════════════════════════
-- Auditoría de cambios de precio.
--
-- Queda un registro automático (vía trigger, no se puede saltear ni
-- editando directo desde Supabase) cada vez que cambia el precio de
-- venta o el precio de costo de un producto: quién lo cambió, cuándo,
-- y el valor anterior y el nuevo. Sirve para detectar que alguien baje
-- un precio para cobrarle de menos a un cliente (o a la inversa).
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.price_change_log (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade,
  product_name text not null,
  old_sale_price numeric,
  new_sale_price numeric,
  old_purchase_price numeric,
  new_purchase_price numeric,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now()
);
create index if not exists price_change_log_at_idx on public.price_change_log (changed_at desc);
create index if not exists price_change_log_product_idx on public.price_change_log (product_id);

create or replace function public.trg_log_price_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (old.sale_price is distinct from new.sale_price) or (old.purchase_price is distinct from new.purchase_price) then
    insert into public.price_change_log
      (product_id, product_name, old_sale_price, new_sale_price, old_purchase_price, new_purchase_price, changed_by)
    values
      (new.id, new.name, old.sale_price, new.sale_price, old.purchase_price, new.purchase_price, auth.uid());
  end if;
  return new;
end $$;

drop trigger if exists price_change_log_trg on public.products;
create trigger price_change_log_trg
  after update on public.products
  for each row execute function public.trg_log_price_change();

alter table public.price_change_log enable row level security;
drop policy if exists price_change_log_select on public.price_change_log;
create policy price_change_log_select on public.price_change_log for select to authenticated
  using (public.is_admin());
-- Nadie inserta/edita/borra a mano: solo lo hace el trigger (security definer).
revoke insert, update, delete on public.price_change_log from authenticated;
