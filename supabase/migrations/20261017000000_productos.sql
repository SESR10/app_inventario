-- Fase 2: SKU automático, búsqueda paginada de productos e imágenes.

-- SKU automático --------------------------------------------------------------

create table public.company_counters (
  company_id uuid primary key references public.companies (id) on delete cascade,
  next_sku bigint not null default 1
);

alter table public.company_counters enable row level security;
-- Sin políticas: solo la usa la función de abajo (security definer).

-- Si el producto llega sin SKU, asigna el siguiente libre de la empresa: P-000001, P-000002…
create function public.assign_sku()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  n bigint;
  candidate text;
begin
  if new.sku is not null and trim(new.sku) <> '' then
    new.sku = trim(new.sku);
    return new;
  end if;

  loop
    insert into public.company_counters as c (company_id, next_sku)
    values (new.company_id, 2)
    on conflict (company_id) do update set next_sku = c.next_sku + 1
    returning c.next_sku - 1 into n;

    candidate = 'P-' || lpad(n::text, 6, '0');
    exit when not exists (
      select 1 from public.products p where p.company_id = new.company_id and lower(p.sku) = lower(candidate)
    );
  end loop;

  new.sku = candidate;
  return new;
end;
$$;

create trigger products_assign_sku
before insert or update of sku on public.products
for each row execute function public.assign_sku();

-- Búsqueda ---------------------------------------------------------------------

-- Trata %, _ y \ como texto normal en la búsqueda.
create function public.escape_like(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(replace(replace(value, '\', '\\'), '%', '\%'), '_', '\_');
$$;

-- Arma el filtro solo con los criterios que vienen, para que cada consulta use el índice adecuado.
create function public.product_filter(
  p_query text,
  p_category uuid,
  p_location uuid,
  p_supplier uuid,
  p_low_stock boolean
)
returns text
language sql
immutable
set search_path = ''
as $$
  select concat_ws(' and ',
    'p.company_id = $1',
    case when coalesce(trim(p_query), '') <> '' then '(p.name ilike $2 or p.sku ilike $2)' end,
    case when p_category is not null then 'p.category_id = $3' end,
    case when p_location is not null then 'p.location_id = $4' end,
    case when p_supplier is not null then 'p.supplier_id = $5' end,
    -- Stock bajo: el producto tiene un mínimo definido y está en él o por debajo.
    case when p_low_stock then '(p.min_stock > 0 and p.stock <= p.min_stock)' end
  );
$$;

-- Lista paginada por cursor (nombre, id): rápida con 100.000+ productos.
-- security invoker: las reglas RLS de products se aplican a quien consulta.
create function public.search_products(
  p_company uuid,
  p_query text default null,
  p_category uuid default null,
  p_location uuid default null,
  p_supplier uuid default null,
  p_low_stock boolean default false,
  p_after_name text default null,
  p_after_id uuid default null,
  p_limit int default 50
)
returns table (
  id uuid,
  sku text,
  name text,
  unit text,
  price numeric,
  stock numeric,
  min_stock numeric,
  category_name text,
  location_name text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  return query execute format(
    'select p.id, p.sku, p.name, p.unit, p.price, p.stock, p.min_stock, c.name, l.name
     from public.products p
     left join public.categories c on c.company_id = p.company_id and c.id = p.category_id
     left join public.locations l on l.company_id = p.company_id and l.id = p.location_id
     where %s %s
     order by p.name, p.id
     limit %s',
    public.product_filter(p_query, p_category, p_location, p_supplier, p_low_stock),
    case when p_after_name is not null then 'and (p.name, p.id) > ($6, $7)' else '' end,
    least(greatest(coalesce(p_limit, 50), 1), 200)
  )
  using p_company, '%' || public.escape_like(trim(coalesce(p_query, ''))) || '%',
    p_category, p_location, p_supplier, p_after_name, p_after_id;
end;
$$;

create function public.count_products(
  p_company uuid,
  p_query text default null,
  p_category uuid default null,
  p_location uuid default null,
  p_supplier uuid default null,
  p_low_stock boolean default false
)
returns bigint
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  total bigint;
begin
  execute format(
    'select count(*) from public.products p where %s',
    public.product_filter(p_query, p_category, p_location, p_supplier, p_low_stock)
  )
  into total
  using p_company, '%' || public.escape_like(trim(coalesce(p_query, ''))) || '%',
    p_category, p_location, p_supplier;
  return total;
end;
$$;

-- Imágenes ---------------------------------------------------------------------

-- Bucket privado: las imágenes se guardan en <company_id>/<archivo>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Empresa dueña de un archivo según su carpeta; null si la ruta no es válida.
create function public.storage_company(object_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return split_part(object_name, '/', 1)::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

create policy "miembros ven imágenes" on storage.objects
  for select to authenticated
  using (bucket_id = 'product-images' and public.is_member(public.storage_company(name)));
create policy "editores suben imágenes" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images' and public.has_role(public.storage_company(name), '{admin,editor}'));
create policy "editores cambian imágenes" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images' and public.has_role(public.storage_company(name), '{admin,editor}'));
create policy "editores borran imágenes" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images' and public.has_role(public.storage_company(name), '{admin,editor}'));
