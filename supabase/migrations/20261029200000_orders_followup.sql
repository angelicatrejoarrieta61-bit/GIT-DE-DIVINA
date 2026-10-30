-- ════════════════════════════════════════════════════════════════════
-- DIVINA · Seguimiento del correo de confirmación al cliente
-- Guarda el id del correo en Resend y su estado (enviado · entregado · rebotó · error)
-- para saber si le llegó al cliente y reenviarlo solo cuando falla.
-- Idempotente: se puede ejecutar más de una vez sin dañar datos.
-- Sin esta migración la tienda funciona igual; solo no se ve el estado del correo.
-- ════════════════════════════════════════════════════════════════════

alter table public.orders add column if not exists customer_email_id         text;          -- id del correo en Resend
alter table public.orders add column if not exists customer_email_status     text;          -- sent · delivered · delayed · bounced · error
alter table public.orders add column if not exists customer_email_tries      int not null default 0;
alter table public.orders add column if not exists customer_email_checked_at timestamptz;
alter table public.orders add column if not exists customer_email_alerted_at timestamptz;   -- ya se te avisó que no llegó

do $$ begin
  alter table public.orders add constraint orders_customer_email_status_chk
    check (customer_email_status is null or customer_email_status in ('sent','delivered','delayed','bounced','error'));
exception when duplicate_object then null; end $$;

create index if not exists orders_customer_email_pending_idx
  on public.orders (created_at desc)
  where customer_email_status in ('sent','delayed','error','bounced');

notify pgrst, 'reload schema';
