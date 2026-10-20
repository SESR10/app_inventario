-- Fase 8 (continuación): eliminar muchos productos de una vez.
-- 1) products.import_id marca los productos creados en cada importación, para poder deshacerla.
-- 2) delete_products borra por lista de ids, por importación o por los mismos filtros de la lista de productos,
--    hasta 1000 por llamada. Primero los kits; las piezas que usa un kit que queda no se borran (se cuentan).

alter table public.products add column import_id uuid;
create index products_import on public.products (company_id, import_id) where import_id is not null;

drop function public.import_products(uuid, jsonb, boolean);

-- Igual que antes, más el id de la importación en los productos nuevos.
create function public.import_products(
  p_company uuid,
  p_rows jsonb,
  p_update_existing boolean default true,
  p_import uuid default null
)
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
      company_id, sku, name, unit, cost, price, stock, min_stock, category_id, location_id, supplier_id, extra,
      import_id
    )
    select p_company, s.final_sku, s.name, coalesce(s.unit, 'unidad'), coalesce(s.cost, 0), coalesce(s.price, 0),
      coalesce(s.stock, 0), coalesce(s.min_stock, 0), s.category_id, s.location_id, s.supplier_id,
      coalesce(s.extra, '{}'), p_import
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

revoke execute on function public.import_products(uuid, jsonb, boolean, uuid) from public, anon;
grant execute on function public.import_products(uuid, jsonb, boolean, uuid) to authenticated;

create function public.delete_products(
  p_company uuid,
  p_ids uuid[] default null,
  p_import uuid default null,
  p_query text default null,
  p_category uuid default null,
  p_location uuid default null,
  p_supplier uuid default null,
  p_low_stock boolean default false,
  p_limit int default 1000
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 1000), 1), 1000);
  v_targets uuid[];
  v_images text[];
  v_deleted int;
  v_more int;
  v_in_kit int;
begin
  if not public.has_role(p_company, '{admin,editor}') then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  -- Productos a borrar: los kits primero (al borrarlos se liberan sus piezas). Las piezas de un kit
  -- que no se borra quedan fuera, así varias llamadas seguidas siempre avanzan.
  if p_ids is not null then
    select array_agg(p.id) into v_targets
    from public.products p
    where p.company_id = p_company and p.id = any(p_ids[1:1000]);
  elsif p_import is not null then
    select array_agg(id) into v_targets from (
      select p.id from public.products p
      where p.company_id = p_company and p.import_id = p_import
        and (p.is_kit or not exists (
          select 1 from public.kit_components k where k.company_id = p_company and k.component_id = p.id))
      order by p.is_kit desc
      limit v_limit
    ) t;
  else
    execute format(
      'select array_agg(id) from (
         select p.id from public.products p
         where %s and (p.is_kit or not exists (
           select 1 from public.kit_components k where k.company_id = $1 and k.component_id = p.id))
         order by p.is_kit desc
         limit %s) t',
      public.product_filter(p_query, p_category, p_location, p_supplier, p_low_stock),
      v_limit
    )
    into v_targets
    using p_company, '%' || public.escape_like(trim(coalesce(p_query, ''))) || '%', p_category, p_location, p_supplier;
  end if;
  v_targets := coalesce(v_targets, '{}');

  with gone as (
    delete from public.products p
    where p.company_id = p_company and p.id = any(v_targets) and p.is_kit
    returning p.image_path
  )
  select coalesce(array_agg(image_path) filter (where image_path is not null), '{}'), count(*)
  into v_images, v_deleted from gone;

  with gone as (
    delete from public.products p
    where p.company_id = p_company and p.id = any(v_targets) and not p.is_kit
      and not exists (select 1 from public.kit_components k where k.company_id = p_company and k.component_id = p.id)
    returning p.image_path
  )
  select v_images || coalesce(array_agg(image_path) filter (where image_path is not null), '{}'), v_deleted + count(*)
  into v_images, v_more from gone;

  -- Piezas pedidas que siguen en un kit y por eso no se borraron.
  v_in_kit := cardinality(v_targets) - v_more;
  return jsonb_build_object('deleted', v_more, 'in_kit', v_in_kit, 'images', to_jsonb(v_images));
end;
$$;

revoke execute on function public.delete_products(uuid, uuid[], uuid, text, uuid, uuid, uuid, boolean, int) from public, anon;
grant execute on function public.delete_products(uuid, uuid[], uuid, text, uuid, uuid, uuid, boolean, int) to authenticated;
