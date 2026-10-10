-- Pedidos ↔ Clip — confirmación del cobro directo con la API de Clip.
-- Idempotente: se puede ejecutar más de una vez sin dañar datos.
-- Requiere antes: 20261008120000_orders_v2.sql

-- 1) Datos del cobro tal como los devuelve Clip (GET/POST https://api.payclip.com/payments)
alter table public.orders add column if not exists clip_payment_id   text;
alter table public.orders add column if not exists clip_status       text;         -- approved · pending · rejected · cancelled · refunded · authorized
alter table public.orders add column if not exists clip_status_code  text;         -- status_detail.code (ej. AP-PAI01, PE-3DS01)
alter table public.orders add column if not exists clip_receipt_no   text;         -- receipt_no (número de recibo de Clip)
alter table public.orders add column if not exists clip_auth_code    text;         -- código de autorización, solo si Clip lo envía
alter table public.orders add column if not exists clip_card         text;         -- ej. VISA •••• 0004 · BBVA
alter table public.orders add column if not exists clip_amount       numeric(12,2);
alter table public.orders add column if not exists clip_approved_at  timestamptz;
alter table public.orders add column if not exists clip_verified_at  timestamptz;  -- última vez que se consultó a Clip
alter table public.orders add column if not exists clip_raw          jsonb;

create index if not exists orders_clip_payment_idx on public.orders (clip_payment_id);
create index if not exists orders_clip_status_idx  on public.orders (clip_status);

-- 2) Pedidos ya cobrados antes de este cambio: tomar el id de Clip guardado en payment_info
update public.orders
   set clip_payment_id = payment_info->>'transaction_id'
 where clip_payment_id is null
   and payment_info ? 'transaction_id'
   and coalesce(payment_info->>'transaction_id', '') <> '';

-- 3) Candado: los campos clip_* solo los escribe el servidor (llave de servicio).
--    Ni el navegador del cliente ni la sesión del admin pueden fingir un pago confirmado.
create or replace function public.orders_protect_clip()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.clip_payment_id  := null;
      new.clip_status      := null;
      new.clip_status_code := null;
      new.clip_receipt_no  := null;
      new.clip_auth_code   := null;
      new.clip_card        := null;
      new.clip_amount      := null;
      new.clip_approved_at := null;
      new.clip_verified_at := null;
      new.clip_raw         := null;
    else
      new.clip_payment_id  := old.clip_payment_id;
      new.clip_status      := old.clip_status;
      new.clip_status_code := old.clip_status_code;
      new.clip_receipt_no  := old.clip_receipt_no;
      new.clip_auth_code   := old.clip_auth_code;
      new.clip_card        := old.clip_card;
      new.clip_amount      := old.clip_amount;
      new.clip_approved_at := old.clip_approved_at;
      new.clip_verified_at := old.clip_verified_at;
      new.clip_raw         := old.clip_raw;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_protect_clip on public.orders;
create trigger orders_protect_clip
  before insert or update on public.orders
  for each row execute function public.orders_protect_clip();
