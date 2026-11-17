-- ════════════════════════════════════════════════════════════════════
-- DIVINA · Pedidos ↔ Stripe Checkout (reemplaza a Clip, cuenta cancelada nov 2026)
-- Idempotente: se puede ejecutar más de una vez sin dañar datos.
-- Requiere antes: 20261008120000_orders_v2.sql
-- ════════════════════════════════════════════════════════════════════

-- 1) Datos de la sesión de pago tal como los devuelve Stripe (/v1/checkout/sessions)
alter table public.orders add column if not exists stripe_session_id      text;         -- cs_...
alter table public.orders add column if not exists stripe_payment_intent  text;         -- pi_...
alter table public.orders add column if not exists stripe_status          text;         -- open · complete · expired
alter table public.orders add column if not exists stripe_payment_status  text;         -- paid · unpaid · no_payment_required
alter table public.orders add column if not exists stripe_amount          numeric(12,2);
alter table public.orders add column if not exists stripe_paid_at         timestamptz;
alter table public.orders add column if not exists stripe_verified_at     timestamptz;  -- última vez que se consultó a Stripe

create index if not exists orders_stripe_session_idx on public.orders (stripe_session_id);
create index if not exists orders_stripe_pi_idx      on public.orders (stripe_payment_intent);

-- 2) Candado:
--    a) Los campos stripe_* solo los escribe el servidor (llave de servicio).
--    b) El navegador (anon) no puede crear ni dejar un pedido como pagado/enviado/entregado.
--       La sesión del admin (authenticated) sí puede cambiar el estado (p. ej. pago por transferencia).
create or replace function public.orders_protect_stripe()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.stripe_session_id     := null;
      new.stripe_payment_intent := null;
      new.stripe_status         := null;
      new.stripe_payment_status := null;
      new.stripe_amount         := null;
      new.stripe_paid_at        := null;
      new.stripe_verified_at    := null;
    else
      new.stripe_session_id     := old.stripe_session_id;
      new.stripe_payment_intent := old.stripe_payment_intent;
      new.stripe_status         := old.stripe_status;
      new.stripe_payment_status := old.stripe_payment_status;
      new.stripe_amount         := old.stripe_amount;
      new.stripe_paid_at        := old.stripe_paid_at;
      new.stripe_verified_at    := old.stripe_verified_at;
    end if;
  end if;

  if current_user = 'anon' then
    if tg_op = 'INSERT' then
      if coalesce(new.status::text, 'pending') in ('paid', 'shipped', 'delivered') then
        new.status := 'pending';
      end if;
    elsif new.status::text is distinct from old.status::text
          and coalesce(new.status::text, '') in ('paid', 'shipped', 'delivered') then
      new.status := old.status;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists orders_protect_stripe on public.orders;
create trigger orders_protect_stripe
  before insert or update on public.orders
  for each row execute function public.orders_protect_stripe();

notify pgrst, 'reload schema';
