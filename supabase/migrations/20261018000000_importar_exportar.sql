-- Fase 3: importar productos desde Excel/CSV por lotes y exportarlos.

-- Las búsquedas por SKU usan lower(sku); con RLS Postgres no puede usar ese índice
-- (lower no es "leakproof") y recorre toda la tabla. Por eso estas funciones son
-- security definer y validan el permiso al inicio.

-- SKU que ya existen en la empresa (sin distinguir mayúsculas), para la vista previa.
create function public.existing_skus(p_company uuid, p_skus text[])
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select p.sku
  from public.products p
  where public.is_member(p_company)
    and p.company_id = p_company
    and lower(p.sku) = any (select lower(trim(s)) from unnest(p_skus) s);
$$;

-- Filas del lote con los ids de catálogo y del producto existente (por SKU).
create function public.import_rows(p_company uuid, p_rows jsonb)
returns table (
  sku text, name text, unit text, cost numeric, price numeric, stock numeric, min_stock numeric,
  category_id uuid, location_id uuid, supplier_id uuid, product_id uuid
)
language sql
stable
set search_path = ''
as $$
  select r.sku, r.name, r.unit, r.cost, r.price, r.stock, r.min_stock, c.id, l.id, s.id, p.id
  from (
    select nullif(trim(x.sku), '') as sku, nullif(trim(x.name), '') as name, nullif(trim(x.unit), '') as unit,
      x.cost, x.price, x.stock, x.min_stock,
      nullif(trim(x.category), '') as category, nullif(trim(x.location), '') as location,
      nullif(trim(x.supplier), '') as supplier
    from jsonb_to_recordset(p_rows) as x (
      sku text, name text, unit text, cost numeric, price numeric, stock numeric, min_stock numeric,
      category text, location text, supplier text
    )
  ) r
  left join public.categories c on c.company_id = p_company and lower(c.name) = lower(r.category)
  left join public.locations l on l.company_id = p_company and lower(l.name) = lower(r.location)
  left join public.suppliers s on s.company_id = p_company and lower(s.name) = lower(r.supplier)
  left join public.products p on p.company_id = p_company and lower(p.sku) = lower(r.sku);
$$;

revoke execute on function public.import_rows(uuid, jsonb) from public, anon, authenticated;

-- Importa un lote de hasta 500 productos en una sola transacción.
-- Cada fila: {sku, name, unit, cost, price, stock, min_stock, category, location, supplier}.
-- Un campo ausente o null no cambia el valor de un producto existente; en uno nuevo usa el valor por defecto.
-- Categorías, ubicaciones y proveedores se buscan por nombre y se crean si no existen.
create function public.import_products(p_company uuid, p_rows jsonb, p_update_existing boolean default true)
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

  -- Catálogos que faltan.
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
      supplier_id = coalesce(i.supplier_id, p.supplier_id)
    from public.import_rows(p_company, p_rows) i
    where p.company_id = p_company and p.id = i.product_id;
    get diagnostics v_updated = row_count;
  end if;

  -- Productos nuevos; sin SKU, el trigger asigna uno automático.
  insert into public.products (
    company_id, sku, name, unit, cost, price, stock, min_stock, category_id, location_id, supplier_id
  )
  select p_company, i.sku, i.name, coalesce(i.unit, 'unidad'), coalesce(i.cost, 0), coalesce(i.price, 0),
    coalesce(i.stock, 0), coalesce(i.min_stock, 0), i.category_id, i.location_id, i.supplier_id
  from public.import_rows(p_company, p_rows) i
  where i.product_id is null;
  get diagnostics v_created = row_count;

  return jsonb_build_object('created', v_created, 'updated', v_updated, 'skipped', v_total - v_created - v_updated);
end;
$$;

revoke execute on function public.import_products(uuid, jsonb, boolean) from public, anon;
grant execute on function public.import_products(uuid, jsonb, boolean) to authenticated;

-- Exportación por páginas de hasta 1000 (cursor nombre + id), con nombres de catálogos.
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
  supplier text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, p.sku, p.name, c.name, p.unit, p.cost, p.price, p.stock, p.min_stock, l.name, s.name
  from public.products p
  left join public.categories c on c.company_id = p.company_id and c.id = p.category_id
  left join public.locations l on l.company_id = p.company_id and l.id = p.location_id
  left join public.suppliers s on s.company_id = p.company_id and s.id = p.supplier_id
  where p.company_id = p_company
    and (p_after_name is null or (p.name, p.id) > (p_after_name, p_after_id))
  order by p.name, p.id
  limit least(greatest(coalesce(p_limit, 1000), 1), 1000);
$$;
