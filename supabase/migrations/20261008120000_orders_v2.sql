-- Pedidos v2 — envío, guía, avisos por correo y permisos del admin.
-- Idempotente: se puede ejecutar más de una vez sin dañar datos.

alter table public.orders add column if not exists shipping_carrier      text;
alter table public.orders add column if not exists tracking_number       text;
alter table public.orders add column if not exists tracking_url          text;
alter table public.orders add column if not exists shipped_at            timestamptz;
alter table public.orders add column if not exists internal_note         text;
-- Marcas para no mandar el mismo aviso dos veces
alter table public.orders add column if not exists admin_notified_at     timestamptz;
alter table public.orders add column if not exists customer_notified_at  timestamptz;
alter table public.orders add column if not exists shipping_notified_at  timestamptz;

create index if not exists orders_created_idx on public.orders (created_at desc);
create index if not exists orders_status_idx  on public.orders (status);

-- El admin (sesión iniciada) puede ver, editar y borrar pedidos.
-- El público sigue pudiendo crear su pedido en el checkout (eso no cambia).
drop policy if exists "admin_all_orders" on public.orders;
create policy "admin_all_orders" on public.orders
  for all to authenticated
  using (true) with check (true);
grant select, insert, update, delete on public.orders to authenticated;
