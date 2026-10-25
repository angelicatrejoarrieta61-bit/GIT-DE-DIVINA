-- ═══════════════════════════════════════════════════════════════
-- Códigos de descuento (cupones) administrables desde /admin/cupones
-- Idempotente: se puede ejecutar más de una vez sin dañar datos.
-- Ejecutar en Supabase → SQL Editor.
-- ═══════════════════════════════════════════════════════════════

-- 1) Tabla de cupones
create table if not exists public.coupons (
  id              uuid primary key default gen_random_uuid(),
  code            text not null,
  description     text,
  discount_type   text not null default 'percent',
  discount_value  numeric(12,2) not null,
  min_subtotal    numeric(12,2) not null default 0,
  max_uses        integer,
  starts_at       timestamptz,
  ends_at         timestamptz,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Reglas (se agregan aparte para que la migración sea repetible)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'coupons_type_chk') then
    alter table public.coupons add constraint coupons_type_chk check (discount_type in ('percent', 'fixed'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'coupons_value_chk') then
    alter table public.coupons add constraint coupons_value_chk
      check (discount_value > 0 and (discount_type <> 'percent' or discount_value <= 100));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'coupons_min_chk') then
    alter table public.coupons add constraint coupons_min_chk check (min_subtotal >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'coupons_max_uses_chk') then
    alter table public.coupons add constraint coupons_max_uses_chk check (max_uses is null or max_uses > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'coupons_code_chk') then
    alter table public.coupons add constraint coupons_code_chk check (code ~ '^[A-Z0-9_-]{3,40}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'coupons_dates_chk') then
    alter table public.coupons add constraint coupons_dates_chk check (ends_at is null or starts_at is null or ends_at > starts_at);
  end if;
end $$;

create unique index if not exists coupons_code_key on public.coupons (code);

-- Código siempre en mayúsculas y sin espacios; updated_at automático
create or replace function public.coupons_normalize()
returns trigger
language plpgsql
as $$
begin
  new.code := upper(regexp_replace(coalesce(new.code, ''), '\s+', '', 'g'));
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists coupons_normalize on public.coupons;
create trigger coupons_normalize
before insert or update on public.coupons
for each row execute function public.coupons_normalize();

-- 2) Pedidos: qué cupón se usó y cuánto descontó
alter table public.orders add column if not exists coupon_code     text;
alter table public.orders add column if not exists discount_amount numeric(12,2) not null default 0;
create index if not exists orders_coupon_code_idx on public.orders (coupon_code) where coupon_code is not null;

-- 3) Permisos: solo el admin (sesión iniciada) lee y edita la tabla.
--    El público NO puede listar cupones; solo valida uno con la función de abajo.
alter table public.coupons enable row level security;
drop policy if exists "admin_all_coupons" on public.coupons;
create policy "admin_all_coupons" on public.coupons
  for all to authenticated using (true) with check (true);
revoke all on public.coupons from anon;
grant select, insert, update, delete on public.coupons to authenticated;

-- 4) Validación pública: recibe un código (y el subtotal del carrito)
--    y devuelve si aplica. No expone la lista de cupones.
create or replace function public.validate_coupon(p_code text, p_subtotal numeric default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '\s+', '', 'g'));
  c      public.coupons%rowtype;
  v_uses integer;
begin
  if v_code = '' then
    return jsonb_build_object('valid', false, 'reason', 'not_found');
  end if;

  select * into c from public.coupons where code = v_code;
  if not found then
    return jsonb_build_object('valid', false, 'reason', 'not_found');
  end if;
  if not c.active then
    return jsonb_build_object('valid', false, 'reason', 'inactive');
  end if;
  if c.starts_at is not null and now() < c.starts_at then
    return jsonb_build_object('valid', false, 'reason', 'not_started');
  end if;
  if c.ends_at is not null and now() >= c.ends_at then
    return jsonb_build_object('valid', false, 'reason', 'expired');
  end if;

  if c.max_uses is not null then
    select count(*) into v_uses
      from public.orders
     where coupon_code = c.code
       and status in ('paid', 'shipped', 'delivered');
    if v_uses >= c.max_uses then
      return jsonb_build_object('valid', false, 'reason', 'exhausted');
    end if;
  end if;

  if p_subtotal is not null and c.min_subtotal > 0 and p_subtotal < c.min_subtotal then
    return jsonb_build_object(
      'valid', false, 'reason', 'min_subtotal',
      'code', c.code, 'min_subtotal', c.min_subtotal
    );
  end if;

  return jsonb_build_object(
    'valid', true,
    'code', c.code,
    'discount_type', c.discount_type,
    'discount_value', c.discount_value,
    'min_subtotal', c.min_subtotal
  );
end;
$$;

revoke all on function public.validate_coupon(text, numeric) from public;
grant execute on function public.validate_coupon(text, numeric) to anon, authenticated;

-- 5) Primer cupón: el que estaba escrito en el código (10 %)
insert into public.coupons (code, description, discount_type, discount_value, active)
select 'DESCUENTO202610', 'Cupón de octubre 2026 (antes fijo en el código)', 'percent', 10, true
where not exists (select 1 from public.coupons where code = 'DESCUENTO202610');

-- 6) Que la API (PostgREST) vea la tabla y la función de inmediato
notify pgrst, 'reload schema';
