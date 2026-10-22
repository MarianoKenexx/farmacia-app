-- ════════════════════════════════════════════════════════════════════
-- Vencimientos de stock y recordatorio de recompra.
--
-- Vencimientos: un control aparte y simple (no reemplaza el conteo de
-- stock total) para avisar qué lotes están por vencer o ya vencieron.
--
-- Recordatorio de recompra: si un producto tiene cargados los "días
-- de tratamiento" (por ejemplo, un tratamiento crónico que dura 30
-- días), y la venta quedó asociada a un cliente, se puede calcular
-- cuándo le tocaría volver a comprar y armar una lista para avisarle
-- (por ahora el aviso lo hace el personal, a mano — no hay envío
-- automático de WhatsApp/SMS todavía).
-- ════════════════════════════════════════════════════════════════════

alter table public.products
  add column if not exists dias_tratamiento integer;

create table if not exists public.lotes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  fecha_vencimiento date not null,
  cantidad numeric(12,4) not null,
  nota text,
  consumido boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists lotes_product_idx on public.lotes (product_id);
create index if not exists lotes_vencimiento_idx on public.lotes (fecha_vencimiento) where not consumido;

alter table public.lotes enable row level security;
drop policy if exists lotes_all on public.lotes;
create policy lotes_all on public.lotes for all to authenticated
  using (public.has_perm('stock')) with check (public.has_perm('stock'));
