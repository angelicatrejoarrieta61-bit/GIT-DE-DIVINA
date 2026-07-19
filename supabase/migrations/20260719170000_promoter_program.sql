-- Programa de promotores DIVINA STORE: registro, atribucion y comisiones.
create schema if not exists private;

create table if not exists public.promoters (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text,
  social_handle text,
  code text not null unique,
  status text not null default 'active' check (status in ('active', 'paused')),
  commission_rate numeric(5,4) not null default 0.12 check (commission_rate = 0.12),
  terms_accepted boolean not null default false check (terms_accepted),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists promoters_email_lower_unique
  on public.promoters (lower(email));

alter table public.orders add column if not exists promoter_id uuid references public.promoters(id) on delete set null;
alter table public.orders add column if not exists promoter_code text;
alter table public.orders add column if not exists commission_rate numeric(5,4);
alter table public.orders add column if not exists commission_amount numeric(12,2) not null default 0;
alter table public.orders add column if not exists commission_status text not null default 'not_applicable'
  check (commission_status in ('not_applicable', 'pending', 'paid', 'cancelled'));
alter table public.orders add column if not exists commission_paid_at timestamptz;

create index if not exists orders_promoter_id_idx on public.orders(promoter_id);
create index if not exists orders_commission_status_idx on public.orders(commission_status);

create or replace function private.prepare_promoter()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  first_word text;
begin
  new.full_name := btrim(regexp_replace(new.full_name, '\s+', ' ', 'g'));
  new.email := lower(btrim(new.email));
  new.phone := nullif(btrim(new.phone), '');
  new.social_handle := nullif(btrim(new.social_handle), '');
  first_word := upper(regexp_replace(split_part(translate(new.full_name, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'), ' ', 1), '[^A-Za-z0-9]', '', 'g'));
  if first_word = '' then first_word := 'DIVINA'; end if;
  if new.code is null or new.code = '' then
    new.code := 'DIVINA-' || left(first_word, 10) || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists promoters_prepare on public.promoters;
create trigger promoters_prepare
before insert or update on public.promoters
for each row execute function private.prepare_promoter();

create or replace function public.register_promoter(
  p_full_name text,
  p_email text,
  p_phone text default null,
  p_social_handle text default null,
  p_terms_accepted boolean default false
)
returns table (promoter_id uuid, promoter_code text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if length(btrim(coalesce(p_full_name, ''))) not between 3 and 100 then
    raise exception 'Nombre no valido';
  end if;
  if length(btrim(coalesce(p_email, ''))) > 254 or btrim(coalesce(p_email, '')) !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
    raise exception 'Correo no valido';
  end if;
  if not coalesce(p_terms_accepted, false) then
    raise exception 'Debes aceptar las reglas del programa';
  end if;

  return query
  insert into public.promoters (full_name, email, phone, social_handle, code, terms_accepted)
  values (p_full_name, p_email, p_phone, p_social_handle, '', true)
  returning id, code;
end;
$$;

create or replace function private.attribute_promoter_commission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  matched public.promoters%rowtype;
begin
  if tg_op = 'INSERT' or new.promoter_code is distinct from old.promoter_code then
    select * into matched
    from public.promoters
    where upper(code) = upper(btrim(coalesce(new.promoter_code, '')))
      and status = 'active'
    limit 1;

    if found then
      new.promoter_id := matched.id;
      new.promoter_code := matched.code;
      new.commission_rate := matched.commission_rate;
    else
      new.promoter_id := null;
      new.promoter_code := null;
      new.commission_rate := null;
    end if;
  end if;

  if new.promoter_id is null then
    new.commission_amount := 0;
    new.commission_status := 'not_applicable';
    new.commission_paid_at := null;
  elsif new.status in ('paid', 'shipped', 'delivered') then
    new.commission_amount := round(coalesce(new.total, 0) * coalesce(new.commission_rate, 0.12), 2);
    if new.commission_status not in ('paid', 'cancelled') then new.commission_status := 'pending'; end if;
  elsif new.status = 'cancelled' then
    new.commission_amount := 0;
    new.commission_status := 'cancelled';
  else
    new.commission_amount := 0;
    new.commission_status := 'not_applicable';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_attribute_promoter on public.orders;
create trigger orders_attribute_promoter
before insert or update of status, promoter_code on public.orders
for each row execute function private.attribute_promoter_commission();

alter table public.promoters enable row level security;

revoke all on public.promoters from public, anon, authenticated;
grant select on public.promoters to authenticated;
grant update (status, updated_at) on public.promoters to authenticated;

drop policy if exists "authenticated_can_read_promoters" on public.promoters;
create policy "authenticated_can_read_promoters"
on public.promoters for select to authenticated using (true);

drop policy if exists "authenticated_can_update_promoters" on public.promoters;
create policy "authenticated_can_update_promoters"
on public.promoters for update to authenticated using (true) with check (commission_rate = 0.12);

revoke all on function public.register_promoter(text, text, text, text, boolean) from public;
grant execute on function public.register_promoter(text, text, text, text, boolean) to anon, authenticated;
revoke all on function private.prepare_promoter() from public, anon, authenticated;
revoke all on function private.attribute_promoter_commission() from public, anon, authenticated;
