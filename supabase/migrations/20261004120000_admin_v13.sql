-- Admin v1.3 — Mensajes de contacto + permisos para crear secciones desde el admin.
-- Idempotente: se puede ejecutar más de una vez sin dañar datos.

-- 1) Bandeja de mensajes de contacto (los formularios del sitio ya escriben aquí).
create table if not exists public.contact_messages (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  first_name         text,
  last_name_paterno  text,
  last_name_materno  text,
  email              text,
  message            text,
  source             text default 'contact_page',
  status             text not null default 'pending'
);

create index if not exists contact_messages_created_idx on public.contact_messages (created_at desc);
create index if not exists contact_messages_status_idx  on public.contact_messages (status);

alter table public.contact_messages enable row level security;

-- Cualquier visitante puede ENVIAR un mensaje; solo el admin (sesión iniciada) puede leerlos o borrarlos.
drop policy if exists "contact_public_insert" on public.contact_messages;
create policy "contact_public_insert" on public.contact_messages
  for insert to anon, authenticated
  with check (status = 'pending');

drop policy if exists "contact_admin_all" on public.contact_messages;
create policy "contact_admin_all" on public.contact_messages
  for all to authenticated
  using (true) with check (true);

grant insert on public.contact_messages to anon;
grant select, insert, update, delete on public.contact_messages to authenticated;

-- 2) "Añadir sección" crea una colección real y guarda/borra claves de configuración.
--    Se agregan permisos para la sesión del admin (no cambia lo que ve el público).
drop policy if exists "admin_all_collections" on public.collections;
create policy "admin_all_collections" on public.collections
  for all to authenticated
  using (true) with check (true);
grant select, insert, update, delete on public.collections to authenticated;

drop policy if exists "admin_all_store_config" on public.store_config;
create policy "admin_all_store_config" on public.store_config
  for all to authenticated
  using (true) with check (true);
grant select, insert, update, delete on public.store_config to authenticated;
