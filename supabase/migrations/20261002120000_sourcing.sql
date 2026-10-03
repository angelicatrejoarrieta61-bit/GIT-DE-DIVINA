-- ════════════════════════════════════════════════════════════════════
-- DIVINA · Abastecimiento bajo pedido (sourcing)
-- Busca fuentes en Google Shopping MX (Bright Data), guarda el directorio
-- de tiendas descubiertas, el histórico de ofertas y las decisiones de compra.
-- Idempotente: se puede correr más de una vez.
-- ════════════════════════════════════════════════════════════════════

-- 1. Columnas nuevas en productos (no tocan las existentes)
alter table public.products add column if not exists ean text;
alter table public.products add column if not exists cost_price numeric(10,2);
alter table public.products add column if not exists fulfillment text not null default 'stock_propio';

do $$ begin
  alter table public.products
    add constraint products_fulfillment_check check (fulfillment in ('stock_propio','bajo_pedido'));
exception when duplicate_object then null; end $$;

create index if not exists products_ean_idx on public.products (ean) where ean is not null;

-- 2. Directorio de tiendas descubiertas
create table if not exists public.sourcing_merchants (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  name_key      text not null unique,          -- nombre normalizado (minúsculas, sin acentos)
  website       text,
  trust         text not null default 'nuevo' check (trust in ('nuevo','confiable','descartado')),
  gives_invoice boolean,
  notes         text,
  times_seen    int  not null default 0,
  last_price    numeric(10,2),
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

-- 3. Cada búsqueda (también funciona como caché)
create table if not exists public.sourcing_searches (
  id           uuid primary key default gen_random_uuid(),
  query        text not null,
  query_key    text not null,                  -- consulta normalizada para caché
  page         int  not null default 0,
  product_id   uuid references public.products(id) on delete set null,
  results      int  not null default 0,
  duration_ms  int,
  status       text not null default 'ok' check (status in ('ok','error')),
  error        text,
  created_at   timestamptz not null default now()
);
create index if not exists sourcing_searches_key_idx on public.sourcing_searches (query_key, page, created_at desc);
create index if not exists sourcing_searches_created_idx on public.sourcing_searches (created_at desc);

-- 4. Ofertas encontradas (histórico de precios por tienda)
create table if not exists public.sourcing_offers (
  id              uuid primary key default gen_random_uuid(),
  search_id       uuid not null references public.sourcing_searches(id) on delete cascade,
  merchant_id     uuid references public.sourcing_merchants(id) on delete set null,
  shop            text not null,
  title           text not null,
  link            text,
  price_mxn       numeric(10,2),
  old_price_mxn   numeric(10,2),
  alt_price_text  text,                         -- otro precio que muestra Google (promo / mensualidad)
  pack_qty        int  not null default 1,
  unit_price_mxn  numeric(10,2),
  rating          numeric(3,2),
  reviews         int,
  thumbnail       text,                         -- miniatura (data URI pequeño)
  position        int,
  fetched_at      timestamptz not null default now()
);
create index if not exists sourcing_offers_search_idx on public.sourcing_offers (search_id, position);
create index if not exists sourcing_offers_merchant_idx on public.sourcing_offers (merchant_id, fetched_at desc);

-- 5. Proveedor elegido por producto (lo que pasa a "mi stock")
create table if not exists public.product_sources (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references public.products(id) on delete cascade,
  merchant_id     uuid references public.sourcing_merchants(id) on delete set null,
  offer_id        uuid references public.sourcing_offers(id) on delete set null,
  shop            text not null,
  offer_title     text not null,
  link            text,
  unit_cost_mxn   numeric(10,2) not null,
  shipping_mxn    numeric(10,2) not null default 0,
  sale_price_mxn  numeric(10,2) not null,
  margin_mxn      numeric(10,2) not null,
  match_level     text not null check (match_level in ('exacta','probable','no_confirmada')),
  is_primary      boolean not null default true,
  created_at      timestamptz not null default now()
);
create index if not exists product_sources_product_idx on public.product_sources (product_id, created_at desc);

-- 6. Seguridad: solo usuarios autenticados del admin
alter table public.sourcing_merchants enable row level security;
alter table public.sourcing_searches  enable row level security;
alter table public.sourcing_offers    enable row level security;
alter table public.product_sources    enable row level security;

do $$
declare t text;
begin
  foreach t in array array['sourcing_merchants','sourcing_searches','sourcing_offers','product_sources'] loop
    execute format('drop policy if exists "admin_all_%1$s" on public.%1$s', t);
    execute format('create policy "admin_all_%1$s" on public.%1$s for all to authenticated using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on public.%1$s to authenticated', t);
  end loop;
end $$;

-- 7. Configuración de márgenes (editable desde el admin)
insert into public.store_config (key, value) values
  ('sourcing_clip_fee_pct',       '3.6'),
  ('sourcing_clip_fee_fixed',     '0'),
  ('sourcing_iva_on_fee',         'true'),
  ('sourcing_supplier_shipping',  '0'),
  ('sourcing_customer_shipping',  '0')
on conflict (key) do nothing;
