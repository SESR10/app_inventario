-- Fase 8: importar el Excel tal como lo tiene cada empresa.
-- 1) Las columnas del Excel que no son un dato de la app se guardan en products.extra (texto por título).
-- 2) Cada fila puede traer varias presentaciones (packages: [{name, factor}]), por ejemplo Caja y Pieza
--    leídas del nombre "PARED GARDA 30*60 - 1.62 - 9".
-- 3) import_formats recuerda, por empresa, qué columna es cuál en cada formato de Excel.

alter table public.products
  add column extra jsonb not null default '{}'
    constraint products_extra_object check (jsonb_typeof(extra) = 'object' and pg_column_size(extra) <= 8192);

create table public.import_formats (
  company_id uuid not null references public.companies (id) on delete cascade,
  -- Títulos de columna normalizados y unidos: identifica el formato del archivo.
  signature text not null check (length(signature) <= 4000),
  settings jsonb not null check (jsonb_typeof(settings) = 'object' and pg_column_size(settings) <= 16384),
  updated_at timestamptz not null default now(),
  primary key (company_id, signature)
);

alter table public.import_formats enable row level security;
create policy "miembros leen" on public.import_formats for select to authenticated
  using (public.is_member(company_id));
create policy "editores crean" on public.import_formats for insert to authenticated
  with check (public.has_role(company_id, '{admin,editor}'));
create policy "editores modifican" on public.import_formats for update to authenticated
  using (public.has_role(company_id, '{admin,editor}')) with check (public.has_role(company_id, '{admin,editor}'));
create policy "editores eliminan" on public.import_formats for delete to authenticated
  using (public.has_role(company_id, '{admin,editor}'));
grant select, insert, update, delete on public.import_formats to authenticated;

drop function public.import_rows(uuid, jsonb);

-- Igual que en la fase 7, más los datos extra y las presentaciones adicionales de cada fila.
create function public.import_rows(p_company uuid, p_rows jsonb)
returns table (
  sku text, name text, unit text, cost numeric, price numeric, stock numeric, min_stock numeric,
  category_id uuid, location_id uuid, supplier_id uuid, product_id uuid,
  package_name text, package_factor numeric, extra jsonb, packages jsonb
)
language sql
stable
set search_path = ''
as $$
  select r.sku, r.name, r.unit, r.cost, r.price, r.stock, r.min_stock, c.id, l.id, s.id, p.id,
    r.package_name, r.package_factor, r.extra, r.packages
  from (
    select nullif(trim(x.sku), '') as sku, nullif(trim(x.name), '') as name, nullif(trim(x.unit), '') as unit,
      x.cost, x.price, x.stock, x.min_stock,
      nullif(trim(x.category), '') as category, nullif(trim(x.location), '') as location,
      nullif(trim(x.supplier), '') as supplier,
      nullif(trim(x.package_name), '') as package_name, x.package_factor,
      case when jsonb_typeof(x.extra) = 'object' and x.extra <> '{}' then x.extra end as extra,
      case when jsonb_typeof(x.packages) = 'array' then x.packages end as packages
    from jsonb_to_recordset(p_rows) as x (
      sku text, name text, unit text, cost numeric, price numeric, stock numeric, min_stock numeric,
      category text, location text, supplier text, package_name text, package_factor numeric, extra jsonb,
      packages jsonb
    )
  ) r
  left join public.categories c on c.company_id = p_company and lower(c.name) = lower(r.category)
  left join public.locations l on l.company_id = p_company and lower(l.name) = lower(r.location)
  left join public.suppliers s on s.company_id = p_company and lower(s.name) = lower(r.supplier)
  left join public.products p on p.company_id = p_company and lower(p.sku) = lower(r.sku);
$$;

revoke execute on function public.import_rows(uuid, jsonb) from public, anon, authenticated;

-- Presentaciones de una fila importada: la de las columnas Presentación/Contenido y las de packages.
create function public.import_row_packages(p_name text, p_factor numeric, p_packages jsonb)
returns table (name text, factor numeric)
language sql
immutable
set search_path = ''
as $$
  select k.name, k.factor
  from (
    select p_name as name, p_factor as factor
    union all
    select nullif(trim(e ->> 'name'), ''), (e ->> 'factor')::numeric
    from jsonb_array_elements(coalesce(p_packages, '[]')) e
  ) k
  where k.name is not null and k.factor > 0;
$$;

revoke execute on function public.import_row_packages(text, numeric, jsonb) from public, anon, authenticated;

-- Igual que en la fase 7, más los datos extra (al actualizar se suman a los que ya tenía).
create or replace function public.import_products(p_company uuid, p_rows jsonb, p_update_existing boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created int;
  v_updated int := 0;
  v_total int;
begin
  if not public.has_role(p_company, '{admin,editor}') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'send between 0 and 500 rows' using errcode = '22023';
  end if;
  v_total := jsonb_array_length(p_rows);
  perform set_config('app.movement_reason', '@import', true);

  insert into public.categories (company_id, name)
  select distinct on (lower(v)) p_company, v
  from (select nullif(trim(e ->> 'category'), '') v from jsonb_array_elements(p_rows) e) t where v is not null
  on conflict (company_id, lower(name)) do nothing;
  insert into public.locations (company_id, name)
  select distinct on (lower(v)) p_company, v
  from (select nullif(trim(e ->> 'location'), '') v from jsonb_array_elements(p_rows) e) t where v is not null
  on conflict (company_id, lower(name)) do nothing;
  insert into public.suppliers (company_id, name)
  select distinct on (lower(v)) p_company, v
  from (select nullif(trim(e ->> 'supplier'), '') v from jsonb_array_elements(p_rows) e) t where v is not null
  on conflict (company_id, lower(name)) do nothing;

  if p_update_existing then
    update public.products p set
      name = coalesce(i.name, p.name),
      unit = coalesce(i.unit, p.unit),
      cost = coalesce(i.cost, p.cost),
      price = coalesce(i.price, p.price),
      stock = coalesce(i.stock, p.stock),
      min_stock = coalesce(i.min_stock, p.min_stock),
      category_id = coalesce(i.category_id, p.category_id),
      location_id = coalesce(i.location_id, p.location_id),
      supplier_id = coalesce(i.supplier_id, p.supplier_id),
      extra = p.extra || coalesce(i.extra, '{}')
    from public.import_rows(p_company, p_rows) i
    where p.company_id = p_company and p.id = i.product_id;
    get diagnostics v_updated = row_count;

    insert into public.product_packages (company_id, product_id, name, factor)
    select distinct on (i.product_id, lower(k.name)) p_company, i.product_id, k.name, k.factor
    from public.import_rows(p_company, p_rows) i
    cross join lateral public.import_row_packages(i.package_name, i.package_factor, i.packages) k
    where i.product_id is not null
    on conflict (product_id, lower(name)) do update set factor = excluded.factor;
  end if;

  -- Productos nuevos: el SKU se decide aquí (el que trae la fila o el siguiente automático)
  -- para poder guardarle la presentación al producto recién creado.
  with src as materialized (
    select i.*, coalesce(i.sku, public.next_sku(p_company)) as final_sku
    from public.import_rows(p_company, p_rows) i
    where i.product_id is null
  ),
  created as (
    insert into public.products (
      company_id, sku, name, unit, cost, price, stock, min_stock, category_id, location_id, supplier_id, extra
    )
    select p_company, s.final_sku, s.name, coalesce(s.unit, 'unidad'), coalesce(s.cost, 0), coalesce(s.price, 0),
      coalesce(s.stock, 0), coalesce(s.min_stock, 0), s.category_id, s.location_id, s.supplier_id,
      coalesce(s.extra, '{}')
    from src s
    returning id, sku
  ),
  packages as (
    insert into public.product_packages (company_id, product_id, name, factor)
    select distinct on (c.id, lower(k.name)) p_company, c.id, k.name, k.factor
    from src s
    join created c on lower(c.sku) = lower(s.final_sku)
    cross join lateral public.import_row_packages(s.package_name, s.package_factor, s.packages) k
    returning 1
  )
  select count(*) into v_created from created;

  return jsonb_build_object('created', v_created, 'updated', v_updated, 'skipped', v_total - v_created - v_updated);
end;
$$;

drop function public.export_products(uuid, text, uuid, int);

-- Igual que en la fase 7, más los datos extra.
create function public.export_products(
  p_company uuid,
  p_after_name text default null,
  p_after_id uuid default null,
  p_limit int default 1000
)
returns table (
  id uuid,
  sku text,
  name text,
  category text,
  unit text,
  cost numeric,
  price numeric,
  stock numeric,
  min_stock numeric,
  location text,
  supplier text,
  package_name text,
  package_factor numeric,
  extra jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, p.sku, p.name, c.name, p.unit, p.cost, p.price, p.stock, p.min_stock, l.name, s.name,
    k.name, k.factor, p.extra
  from public.products p
  left join public.categories c on c.company_id = p.company_id and c.id = p.category_id
  left join public.locations l on l.company_id = p.company_id and l.id = p.location_id
  left join public.suppliers s on s.company_id = p.company_id and s.id = p.supplier_id
  left join lateral (
    select k.name, k.factor from public.product_packages k
    where k.company_id = p.company_id and k.product_id = p.id
    order by k.factor desc, k.name
    limit 1
  ) k on true
  where p.company_id = p_company
    and (p_after_name is null or (p.name, p.id) > (p_after_name, p_after_id))
  order by p.name, p.id
  limit least(greatest(coalesce(p_limit, 1000), 1), 1000);
$$;
