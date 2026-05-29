-- ============================================================
-- Migration: habilitar cron automático de blog con IA
-- Timestamp: 20260528211435
-- Tabla destino: blog_posts (ya existe)
-- Tabla fuente: products (columnas: name, brand, description, price, image_url)
-- Frecuencia: cada 3 días a las 14:00 UTC (09:00 CDMX)
-- ============================================================

-- Extensiones necesarias (idempotente, no falla si ya existen)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remover job anterior si existe para evitar duplicados
do $$
begin
  if exists (select 1 from cron.job where jobname = 'auto-blog-post') then
    perform cron.unschedule('auto-blog-post');
  end if;
end;
$$;

-- Crear job: cada 3 días a las 14:00 UTC
select cron.schedule(
  'auto-blog-post',
  '0 14 */3 * *',
  $$
  select net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/generate-blog-post',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.anon_key'),
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  );
  $$
);
