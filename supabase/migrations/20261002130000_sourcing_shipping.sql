-- ════════════════════════════════════════════════════════════════════
-- DIVINA · Abastecimiento: datos de envío por tienda + sitio sugerido
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════

alter table public.sourcing_merchants add column if not exists shipping_days_min      int;
alter table public.sourcing_merchants add column if not exists shipping_days_max      int;
alter table public.sourcing_merchants add column if not exists shipping_cost_mxn      numeric(10,2);
alter table public.sourcing_merchants add column if not exists free_shipping_from_mxn numeric(10,2);

do $$ begin
  alter table public.sourcing_merchants
    add constraint sourcing_merchants_shipping_check check (
      (shipping_days_min is null or shipping_days_min >= 0)
      and (shipping_days_max is null or shipping_days_max >= 0)
      and (shipping_days_min is null or shipping_days_max is null or shipping_days_max >= shipping_days_min)
      and (shipping_cost_mxn is null or shipping_cost_mxn >= 0)
      and (free_shipping_from_mxn is null or free_shipping_from_mxn >= 0)
    );
exception when duplicate_object then null; end $$;

-- Sitio sugerido para tiendas ya descubiertas (solo si está vacío)
update public.sourcing_merchants m
set website = k.site
from (values
  ('mercado libre',          'https://www.mercadolibre.com.mx'),
  ('amazon mx',              'https://www.amazon.com.mx'),
  ('amazon',                 'https://www.amazon.com.mx'),
  ('liverpool',              'https://www.liverpool.com.mx'),
  ('farmacias del ahorro',   'https://www.fahorro.com'),
  ('san pablo farmacia',     'https://www.farmaciasanpablo.com.mx'),
  ('farmacia san pablo',     'https://www.farmaciasanpablo.com.mx'),
  ('farmacias benavides',    'https://www.benavides.com.mx'),
  ('farmacias guadalajara',  'https://www.farmaciasguadalajara.com'),
  ('chedraui',               'https://www.chedraui.com.mx'),
  ('soriana',                'https://www.soriana.com'),
  ('el palacio de hierro',   'https://www.elpalaciodehierro.com'),
  ('sephora',                'https://www.sephora.com.mx'),
  ('sam''s club',            'https://www.sams.com.mx'),
  ('sams club',              'https://www.sams.com.mx'),
  ('bodega aurrera',         'https://www.bodegaaurrera.com.mx'),
  ('walmart',                'https://www.walmart.com.mx'),
  ('costco',                 'https://www.costco.com.mx'),
  ('sanborns',               'https://www.sanborns.com.mx'),
  ('coppel',                 'https://www.coppel.com'),
  ('isdin',                  'https://www.isdin.com')
) as k(name_key, site)
where m.website is null and m.name_key = k.name_key;

-- Tiendas cuyo nombre ya es un dominio (ej. "supiel.com.mx", "soriana.com")
update public.sourcing_merchants
set website = 'https://' || case when name_key like 'www.%' then name_key else 'www.' || name_key end
where website is null
  and name_key ~ '^[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|mx|com\.mx|net|org|store|shop)$';
