-- ════════════════════════════════════════════════════════════════════
-- DIVINA · Abastecimiento automático (v2)
-- 1) Proveedores autorizados con entrega al día siguiente
-- 2) Revisión automática cada 5 h con historial y precio automático
-- 3) Protección de cada venta (bloqueo sin proveedor, verificación de pedidos)
-- 4) Demanda, oportunidades y métricas por producto
-- Idempotente: se puede ejecutar más de una vez sin dañar datos.
-- Requiere antes: 20261002120000_sourcing.sql, 20261002130000_sourcing_shipping.sql
-- ════════════════════════════════════════════════════════════════════

create extension if not exists pg_cron;
create extension if not exists pg_net;
create schema if not exists private;

-- ── 1. Proveedores ──────────────────────────────────────────────────
alter table public.sourcing_merchants add column if not exists authorized     boolean not null default false;
alter table public.sourcing_merchants add column if not exists is_marketplace boolean not null default false;
alter table public.sourcing_merchants add column if not exists conditions     text;   -- condiciones de compra/envío

-- Empresas grandes autorizadas (solo se marcan; los días de entrega los capturas tú en Abastecimiento → Tiendas)
update public.sourcing_merchants set authorized = true
 where name_key in (
  'amazon mx','amazon','amazon.com.mx','mercado libre','mercadolibre','liverpool','el palacio de hierro',
  'sephora','sanborns','walmart','walmart.com.mx','bodega aurrera','sam''s club','sams club','costco',
  'chedraui','soriana','farmacias del ahorro','san pablo farmacia','farmacia san pablo','farmacias benavides',
  'farmacias guadalajara','coppel','isdin'
 ) and authorized = false;
update public.sourcing_merchants set is_marketplace = true
 where name_key in ('amazon mx','amazon','amazon.com.mx','mercado libre','mercadolibre','walmart','walmart.com.mx','coppel','liverpool')
   and is_marketplace = false;

-- Ofertas: mensualidad detectada y vendedor (cuando el anuncio lo dice)
alter table public.sourcing_offers add column if not exists is_installment boolean not null default false;
alter table public.sourcing_offers add column if not exists seller         text;

-- ── 2. Productos: estado de la automatización ──────────────────────
alter table public.products add column if not exists auto_price        boolean not null default true;
alter table public.products add column if not exists auto_hidden       boolean not null default false; -- lo ocultó el sistema (no tú)
alter table public.products add column if not exists sourcing_status   text;
alter table public.products add column if not exists sourcing_note     text;
alter table public.products add column if not exists sourcing_checked_at timestamptz;
alter table public.products add column if not exists search_query      text;   -- búsqueda exacta para revisar (si no, se arma con marca + nombre)
do $$ begin
  alter table public.products add constraint products_sourcing_status_chk
    check (sourcing_status is null or sourcing_status in ('ok','sin_proveedor','sin_datos','error'));
exception when duplicate_object then null; end $$;
create index if not exists products_sourcing_due_idx on public.products (sourcing_checked_at nulls first) where fulfillment = 'bajo_pedido';

-- Cada revisión de un producto (historial)
create table if not exists public.product_price_checks (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid not null references public.products(id) on delete cascade,
  checked_at       timestamptz not null default now(),
  status           text not null check (status in ('ok','sin_proveedor','sin_datos','error')),
  offers_total     int  not null default 0,
  offers_exact     int  not null default 0,
  best_shop        text,
  best_offer_title text,
  best_link        text,
  best_unit_cost   numeric(10,2),
  best_shipping    numeric(10,2),
  market_low       numeric(10,2),   -- precio más bajo del mercado para el mismo producto
  market_ref       numeric(10,2),   -- precio típico (mediana de las tiendas) con el que se compite
  floor_price      numeric(10,2),   -- precio mínimo para cumplir tu ganancia
  target_price     numeric(10,2),
  price_before     numeric(10,2),
  price_after      numeric(10,2),
  margin_mxn       numeric(10,2),
  margin_pct       numeric(6,2),
  reviews_total    int,
  note             text
);
alter table public.product_price_checks add column if not exists market_ref numeric(10,2);
create index if not exists product_price_checks_idx on public.product_price_checks (product_id, checked_at desc);
create index if not exists product_price_checks_recent_idx on public.product_price_checks (checked_at desc);

-- Cambios de precio aplicados
create table if not exists public.product_price_changes (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  changed_at  timestamptz not null default now(),
  old_price   numeric(10,2) not null,
  new_price   numeric(10,2) not null,
  unit_cost   numeric(10,2),
  market_low  numeric(10,2),
  reason      text not null,
  source      text not null default 'auto' check (source in ('auto','manual'))
);
create index if not exists product_price_changes_idx on public.product_price_changes (product_id, changed_at desc);

-- product_sources: datos vivos del proveedor principal
alter table public.product_sources add column if not exists last_checked_at timestamptz;
alter table public.product_sources add column if not exists available       boolean;

-- ── 3. Verificación de pedidos antes de comprar al proveedor ───────
create table if not exists public.order_supplier_checks (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  checked_at  timestamptz not null default now(),
  decision    text not null check (decision in ('comprar','cambiar_proveedor','suspender')),
  margin_mxn  numeric(10,2),
  detail      jsonb not null default '[]'::jsonb,
  checked_by  uuid
);
create index if not exists order_supplier_checks_idx on public.order_supplier_checks (order_id, checked_at desc);

-- Ganancia estimada por pedido (costo del proveedor al momento de la venta)
alter table public.orders add column if not exists est_cost   numeric(12,2);
alter table public.orders add column if not exists est_profit numeric(12,2);

create or replace function private.orders_estimate_profit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  it jsonb;
  v_cost numeric := 0;
  v_unit numeric;
  v_known boolean := true;
begin
  if new.items is null or jsonb_typeof(new.items) <> 'array' then return new; end if;
  for it in select * from jsonb_array_elements(new.items) loop
    select coalesce(ps.unit_cost_mxn, 0) + coalesce(ps.shipping_mxn, 0) into v_unit
      from public.product_sources ps
     where ps.product_id = nullif(it->'product'->>'id', '')::uuid and ps.is_primary
     order by ps.created_at desc limit 1;
    if v_unit is null then
      select p.cost_price into v_unit from public.products p where p.id = nullif(it->'product'->>'id', '')::uuid;
    end if;
    if v_unit is null then v_known := false; v_unit := 0; end if;
    v_cost := v_cost + v_unit * greatest(coalesce((it->>'quantity')::int, 1), 1);
  end loop;
  if v_known then
    new.est_cost := round(v_cost, 2);
    new.est_profit := round(coalesce(new.total, 0) - v_cost, 2);
  end if;
  return new;
exception when others then
  return new; -- nunca bloquear un pedido por el cálculo
end;
$$;

drop trigger if exists orders_estimate_profit on public.orders;
create trigger orders_estimate_profit
before insert on public.orders
for each row execute function private.orders_estimate_profit();

-- ── 4. Demanda, oportunidades y métricas ────────────────────────────
create table if not exists public.sourcing_opportunities (
  id              uuid primary key default gen_random_uuid(),
  query           text not null,
  query_key       text not null unique,
  origin          text not null default 'manual' check (origin in ('manual','sugerencia')),
  seed            text,                        -- búsqueda de la que salió la sugerencia
  status          text not null default 'candidato'
                  check (status in ('candidato','verificado','publicado','descartado')),
  brand           text,
  demand_score    numeric(6,2),                -- 0–100
  suggest_rank    int,                         -- posición en el autocompletado de Google (1 = más buscado)
  reviews_total   int,
  reviews_delta   int,                         -- reseñas nuevas desde la revisión anterior (≈ ventas recientes)
  rating          numeric(3,2),
  sellers         int,                         -- tiendas distintas que lo venden (competencia)
  authorized_sellers int,
  best_shop       text,
  best_unit_cost  numeric(10,2),
  market_low      numeric(10,2),
  market_ref      numeric(10,2),
  suggested_price numeric(10,2),
  margin_mxn      numeric(10,2),
  margin_pct      numeric(6,2),
  reasons         text[] not null default '{}',
  product_id      uuid references public.products(id) on delete set null,
  checked_at      timestamptz,
  created_at      timestamptz not null default now()
);
alter table public.sourcing_opportunities add column if not exists market_ref numeric(10,2);
create index if not exists sourcing_opportunities_status_idx on public.sourcing_opportunities (status, demand_score desc nulls last);
create index if not exists sourcing_opportunities_due_idx on public.sourcing_opportunities (checked_at nulls first);

-- Visitas y carritos de la tienda (los inserta el navegador; nadie más los lee salvo el admin)
create table if not exists public.product_events (
  id          bigint generated always as identity primary key,
  product_id  uuid not null references public.products(id) on delete cascade,
  event       text not null check (event in ('view','add_to_cart')),
  session_id  text,
  created_at  timestamptz not null default now()
);
create index if not exists product_events_idx on public.product_events (product_id, event, created_at desc);
create index if not exists product_events_recent_idx on public.product_events (created_at desc);

-- ── 5. Permisos ─────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['product_price_checks','product_price_changes','order_supplier_checks','sourcing_opportunities'] loop
    execute format('alter table public.%1$s enable row level security', t);
    execute format('drop policy if exists "admin_all_%1$s" on public.%1$s', t);
    execute format('create policy "admin_all_%1$s" on public.%1$s for all to authenticated using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on public.%1$s to authenticated', t);
    execute format('revoke all on public.%1$s from anon', t);
  end loop;
end $$;

alter table public.product_events enable row level security;
drop policy if exists "events_public_insert" on public.product_events;
create policy "events_public_insert" on public.product_events
  for insert to anon, authenticated
  with check (event in ('view','add_to_cart') and (session_id is null or length(session_id) <= 64));
drop policy if exists "events_admin_read" on public.product_events;
create policy "events_admin_read" on public.product_events
  for select to authenticated using (true);
grant insert on public.product_events to anon, authenticated;
grant select on public.product_events to authenticated;
revoke update, delete on public.product_events from anon, authenticated;

-- Métricas por producto en una sola consulta (solo admin)
create or replace function public.product_metrics(p_days int default 30)
returns table (
  product_id uuid, views bigint, carts bigint, orders bigint, units bigint, revenue numeric, profit numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with since as (select now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365))) as t),
  ev as (
    select e.product_id,
           count(*) filter (where e.event = 'view') as views,
           count(*) filter (where e.event = 'add_to_cart') as carts
      from public.product_events e, since
     where e.created_at >= since.t
     group by e.product_id
  ),
  sold as (
    select nullif(it->'product'->>'id','')::uuid as product_id,
           count(distinct o.id) as orders,
           sum(greatest(coalesce((it->>'quantity')::int,1),1)) as units,
           sum(greatest(coalesce((it->>'quantity')::int,1),1) * coalesce((it->'product'->>'price')::numeric,0)) as revenue,
           sum(case when o.est_profit is null or coalesce(o.total,0) = 0 then null
                    else o.est_profit * (greatest(coalesce((it->>'quantity')::int,1),1) * coalesce((it->'product'->>'price')::numeric,0))
                         / nullif((select sum(greatest(coalesce((x->>'quantity')::int,1),1) * coalesce((x->'product'->>'price')::numeric,0))
                                     from jsonb_array_elements(o.items) x), 0) end) as profit
      from public.orders o
      cross join lateral jsonb_array_elements(case when jsonb_typeof(o.items) = 'array' then o.items else '[]'::jsonb end) it, since
     where o.status in ('paid','shipped','delivered') and o.created_at >= since.t
     group by 1
  )
  select coalesce(ev.product_id, sold.product_id),
         coalesce(ev.views,0), coalesce(ev.carts,0), coalesce(sold.orders,0), coalesce(sold.units,0),
         coalesce(round(sold.revenue,2),0), round(sold.profit,2)
    from ev full outer join sold on sold.product_id = ev.product_id
   where auth.role() = 'authenticated' or auth.role() = 'service_role';
$$;
revoke all on function public.product_metrics(int) from public, anon;
grant execute on function public.product_metrics(int) to authenticated, service_role;

-- ── 6. Configuración (editable desde el admin) ──────────────────────
insert into public.store_config (key, value) values
  ('auto_min_margin_pct',     '25'),     -- ganancia mínima en % del precio de venta
  ('auto_min_margin_mxn',     '100'),    -- y al menos estos pesos por pieza
  ('auto_undercut_pct',       '2'),      -- cuánto por debajo del precio más bajo del mercado
  ('auto_max_change_pct',     '35'),     -- tope de cambio por revisión (protección contra datos raros)
  ('auto_max_delivery_days',  '1'),      -- el proveedor debe entregar al día siguiente
  ('auto_check_hours',        '5'),      -- cada cuántas horas se revisa cada producto
  ('auto_enabled',            'true'),
  ('auto_opportunities_per_day', '6')    -- búsquedas de oportunidades por día (cada una cuesta en Bright Data)
on conflict (key) do nothing;

-- ── 7. Programación: pg_cron llama a la página cada 10 min ──────────
-- La página revisa solo los productos cuya última revisión tiene más de 5 h, unos pocos por llamada.
create table if not exists private.app_secrets (
  name  text primary key,
  value text not null,
  created_at timestamptz not null default now()
);
insert into private.app_secrets (name, value)
values ('sourcing_cron', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
on conflict (name) do nothing;
revoke all on private.app_secrets from public, anon, authenticated;

-- Solo el servidor (llave de servicio) puede comprobar el token
create or replace function public.sourcing_cron_token_ok(p_token text)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (select 1 from private.app_secrets where name = 'sourcing_cron' and value = p_token and length(p_token) >= 32);
$$;
revoke all on function public.sourcing_cron_token_ok(text) from public, anon, authenticated;
grant execute on function public.sourcing_cron_token_ok(text) to service_role;

create or replace function private.sourcing_cron_call(p_job text)
returns void
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare v_token text;
begin
  select value into v_token from private.app_secrets where name = 'sourcing_cron';
  if v_token is null then return; end if;
  perform net.http_post(
    url     := 'https://www.divinastore.com.mx/api/sourcing-auto?job=' || p_job,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-token', v_token),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;
revoke all on function private.sourcing_cron_call(text) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'divina-sourcing-tick') then
    perform cron.unschedule('divina-sourcing-tick');
  end if;
  if exists (select 1 from cron.job where jobname = 'divina-opportunities') then
    perform cron.unschedule('divina-opportunities');
  end if;
end $$;

select cron.schedule('divina-sourcing-tick', '*/10 * * * *', $$ select private.sourcing_cron_call('tick'); $$);
-- Oportunidades: una vez al día, 13:20 UTC (07:20 CDMX)
select cron.schedule('divina-opportunities', '20 13 * * *', $$ select private.sourcing_cron_call('opportunities'); $$);

notify pgrst, 'reload schema';
