-- Esquema base: empresas, miembros con rol, catálogo y movimientos.
-- Cada fila de negocio lleva company_id y RLS limita el acceso a los miembros de esa empresa.

create extension if not exists pg_trgm with schema extensions;

create type public.app_role as enum ('admin', 'editor', 'viewer');
create type public.movement_type as enum ('in', 'out', 'adjust');

-- Empresas y miembros ---------------------------------------------------------

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  created_at timestamptz not null default now()
);

create table public.company_members (
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

create index company_members_user_idx on public.company_members (user_id);

-- Funciones de permisos. SECURITY DEFINER evita la recursión de RLS sobre company_members.

create function public.is_member(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.company_members m
    where m.company_id = cid and m.user_id = (select auth.uid())
  );
$$;

create function public.has_role(cid uuid, roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.company_members m
    where m.company_id = cid and m.user_id = (select auth.uid()) and m.role = any (roles)
  );
$$;

-- Crea una empresa y deja al usuario actual como administrador.
create function public.create_company(company_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  insert into public.companies (name) values (trim(company_name)) returning id into new_id;
  insert into public.company_members (company_id, user_id, role)
  values (new_id, (select auth.uid()), 'admin');
  return new_id;
end;
$$;

revoke execute on function public.create_company(text) from public, anon;
grant execute on function public.create_company(text) to authenticated;

-- Catálogos -----------------------------------------------------------------

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);
create unique index categories_company_name_key on public.categories (company_id, lower(name));
alter table public.categories add unique (company_id, id);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);
create unique index locations_company_name_key on public.locations (company_id, lower(name));
alter table public.locations add unique (company_id, id);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  contact_name text,
  phone text,
  email text,
  created_at timestamptz not null default now()
);
create unique index suppliers_company_name_key on public.suppliers (company_id, lower(name));
alter table public.suppliers add unique (company_id, id);

-- Productos -----------------------------------------------------------------

create table public.products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  sku text not null check (length(trim(sku)) between 1 and 64),
  name text not null check (length(trim(name)) between 1 and 200),
  category_id uuid,
  unit text not null default 'unidad',
  cost numeric(14, 2) not null default 0 check (cost >= 0),
  price numeric(14, 2) not null default 0 check (price >= 0),
  stock numeric(14, 3) not null default 0,
  min_stock numeric(14, 3) not null default 0 check (min_stock >= 0),
  location_id uuid,
  supplier_id uuid,
  image_path text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  -- Claves compuestas: un producto solo puede apuntar a catálogos de su misma empresa.
  foreign key (company_id, category_id) references public.categories (company_id, id) on delete set null (category_id),
  foreign key (company_id, location_id) references public.locations (company_id, id) on delete set null (location_id),
  foreign key (company_id, supplier_id) references public.suppliers (company_id, id) on delete set null (supplier_id)
);

create unique index products_company_sku_key on public.products (company_id, lower(sku));
-- Orden por nombre con paginación por cursor.
create index products_company_name_idx on public.products (company_id, name, id);
create index products_company_category_idx on public.products (company_id, category_id);
create index products_company_supplier_idx on public.products (company_id, supplier_id);
create index products_company_location_idx on public.products (company_id, location_id);
-- Búsqueda parcial por nombre o SKU (ILIKE '%texto%').
create index products_name_trgm_idx on public.products using gin (name extensions.gin_trgm_ops);
create index products_sku_trgm_idx on public.products using gin (sku extensions.gin_trgm_ops);
-- Alertas de stock bajo.
create index products_low_stock_idx on public.products (company_id) where stock <= min_stock;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

-- Movimientos -----------------------------------------------------------------

create table public.stock_movements (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies (id) on delete cascade,
  product_id uuid not null,
  type public.movement_type not null,
  quantity numeric(14, 3) not null check (quantity <> 0),
  stock_after numeric(14, 3) not null,
  reason text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (company_id, product_id) references public.products (company_id, id) on delete cascade
);

create index stock_movements_product_idx on public.stock_movements (company_id, product_id, created_at desc);
create index stock_movements_company_idx on public.stock_movements (company_id, created_at desc);

-- RLS -----------------------------------------------------------------------

alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.categories enable row level security;
alter table public.locations enable row level security;
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.stock_movements enable row level security;

create policy "miembros ven su empresa" on public.companies
  for select to authenticated using (public.is_member(id));
create policy "admin edita su empresa" on public.companies
  for update to authenticated
  using (public.has_role(id, '{admin}')) with check (public.has_role(id, '{admin}'));

create policy "miembros ven a su equipo" on public.company_members
  for select to authenticated using (public.is_member(company_id));
create policy "admin agrega miembros" on public.company_members
  for insert to authenticated with check (public.has_role(company_id, '{admin}'));
create policy "admin cambia roles" on public.company_members
  for update to authenticated
  using (public.has_role(company_id, '{admin}')) with check (public.has_role(company_id, '{admin}'));
create policy "admin quita miembros" on public.company_members
  for delete to authenticated using (public.has_role(company_id, '{admin}'));

-- Catálogo y productos: todos los miembros leen; admin y editor escriben.
do $$
declare
  t text;
begin
  foreach t in array array['categories', 'locations', 'suppliers', 'products'] loop
    execute format(
      'create policy "miembros leen" on public.%I for select to authenticated using (public.is_member(company_id))', t);
    execute format(
      'create policy "editores crean" on public.%I for insert to authenticated with check (public.has_role(company_id, ''{admin,editor}''))', t);
    execute format(
      'create policy "editores modifican" on public.%I for update to authenticated using (public.has_role(company_id, ''{admin,editor}'')) with check (public.has_role(company_id, ''{admin,editor}''))', t);
    execute format(
      'create policy "editores eliminan" on public.%I for delete to authenticated using (public.has_role(company_id, ''{admin,editor}''))', t);
  end loop;
end;
$$;

-- El historial no se edita ni se borra desde la app.
create policy "miembros leen movimientos" on public.stock_movements
  for select to authenticated using (public.is_member(company_id));
create policy "editores registran movimientos" on public.stock_movements
  for insert to authenticated with check (public.has_role(company_id, '{admin,editor}'));
