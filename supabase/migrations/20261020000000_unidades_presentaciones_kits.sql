-- Fase 7: presentaciones (caja, pieza, rollo…) y kits armados con varias piezas.
--
-- El stock de cada producto se guarda en su unidad base (unidad, m², kg…). Una presentación
-- dice cuántas unidades base trae: "Caja = 1,44 m²", "Pieza = 0,18 m²".
-- Un kit (un baño completo) no tiene stock propio: su stock es cuántos kits se pueden armar
-- con las piezas disponibles, y la base lo recalcula sola cuando cambian las piezas.

-- Presentaciones -----------------------------------------------------------------

create table public.product_packages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  product_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 40),
  -- Unidades base que trae una presentación.
  factor numeric(14, 6) not null check (factor > 0),
  -- Código para escanear esta presentación; si no viene, se arma con el SKU: P-000001-1.
  barcode text check (barcode is null or length(trim(barcode)) between 1 and 64),
  created_at timestamptz not null default now(),
  foreign key (company_id, product_id) references public.products (company_id, id) on delete cascade
);

create unique index product_packages_name_key on public.product_packages (product_id, lower(name));
create unique index product_packages_barcode_key on public.product_packages (company_id, lower(barcode));
create index product_packages_product_idx on public.product_packages (company_id, product_id);

create function public.assign_package_barcode()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_sku text;
  n int := 1;
begin
  new.name = trim(new.name);
  if new.barcode is not null and trim(new.barcode) <> '' then
    new.barcode = trim(new.barcode);
    return new;
  end if;
  select p.sku into v_sku from public.products p where p.id = new.product_id;
  loop
    new.barcode = v_sku || '-' || n;
    exit when not exists (
      select 1 from public.product_packages k
      where k.company_id = new.company_id and lower(k.barcode) = lower(new.barcode) and k.id <> new.id
    );
    n = n + 1;
  end loop;
  return new;
end;
$$;

create trigger product_packages_barcode
before insert or update on public.product_packages
for each row execute function public.assign_package_barcode();

-- Kits -----------------------------------------------------------------------------

alter table public.products add column is_kit boolean not null default false;

create table public.kit_components (
  company_id uuid not null references public.companies (id) on delete cascade,
  kit_id uuid not null,
  component_id uuid not null,
  -- Cuánto de la pieza (en su unidad base) lleva un kit.
  quantity numeric(14, 3) not null check (quantity > 0),
  primary key (kit_id, component_id),
  check (kit_id <> component_id),
  foreign key (company_id, kit_id) references public.products (company_id, id) on delete cascade,
  -- Una pieza que está en un kit no se puede borrar sin sacarla antes del kit.
  foreign key (company_id, component_id) references public.products (company_id, id) on delete restrict
);

create index kit_components_component_idx on public.kit_components (component_id);

-- Un kit lleva piezas normales (no otros kits).
create function public.check_kit_component()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.products p where p.id = new.kit_id and p.is_kit) then
    raise exception 'kit_id is not a kit' using errcode = '22023', hint = 'not_a_kit';
  end if;
  if exists (select 1 from public.products p where p.id = new.component_id and p.is_kit) then
    raise exception 'a kit cannot contain another kit' using errcode = '22023', hint = 'kit_in_kit';
  end if;
  return new;
end;
$$;

create trigger kit_components_check
before insert or update on public.kit_components
for each row execute function public.check_kit_component();

-- Cuántos kits completos se pueden armar con el stock de las piezas.
create function public.kit_available(p_kit uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(min(floor(greatest(c.stock, 0) / k.quantity)), 0)
  from public.kit_components k
  join public.products c on c.id = k.component_id
  where k.kit_id = p_kit;
$$;

-- El stock de un kit siempre es el calculado; y un producto no cambia de tipo después de creado.
create function public.kit_stock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.is_kit <> old.is_kit then
    raise exception 'product type cannot change' using errcode = '22023', hint = 'kit_type_locked';
  end if;
  if new.is_kit then
    new.stock = case when tg_op = 'INSERT' then 0 else public.kit_available(new.id) end;
  end if;
  return new;
end;
$$;

create trigger products_kit_stock
before insert or update on public.products
for each row execute function public.kit_stock();

-- Cuando cambia el stock de una pieza, se recalculan los kits que la usan.
create function public.refresh_kits_of_component()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not new.is_kit then
    update public.products p set stock = p.stock
    where p.id in (select k.kit_id from public.kit_components k where k.component_id = new.id);
  end if;
  return null;
end;
$$;

create trigger products_refresh_kits
after update of stock on public.products
for each row execute function public.refresh_kits_of_component();

create function public.refresh_kit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.products p set stock = p.stock
  where p.id = case when tg_op = 'DELETE' then old.kit_id else new.kit_id end;
  return null;
end;
$$;

create trigger kit_components_refresh
after insert or update or delete on public.kit_components
for each row execute function public.refresh_kit();

-- RLS: como los productos, todos los miembros leen y admin/editor escriben.
alter table public.product_packages enable row level security;
alter table public.kit_components enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['product_packages', 'kit_components'] loop
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

-- Guardar desde la ficha del producto ----------------------------------------------------

-- Reemplaza las presentaciones del producto por la lista recibida, en una sola transacción.
-- Cada elemento: {id?, name, factor, barcode?}. Las que no vienen en la lista se borran.
create function public.set_product_packages(p_product uuid, p_packages jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_company uuid;
begin
  select p.company_id into v_company from public.products p where p.id = p_product;
  if not found then
    raise exception 'product not found' using errcode = 'P0002';
  end if;
  if not public.has_role(v_company, '{admin,editor}') then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  delete from public.product_packages k
  where k.product_id = p_product
    and k.id not in (
      select (e ->> 'id')::uuid from jsonb_array_elements(p_packages) e where e ->> 'id' is not null
    );

  update public.product_packages k set
    name = e.name,
    factor = e.factor,
    barcode = nullif(trim(e.barcode), '')
  from jsonb_to_recordset(p_packages) as e (id uuid, name text, factor numeric, barcode text)
  where e.id is not null and k.id = e.id and k.product_id = p_product;

  insert into public.product_packages (company_id, product_id, name, factor, barcode)
  select v_company, p_product, e.name, e.factor, nullif(trim(e.barcode), '')
  from jsonb_to_recordset(p_packages) as e (id uuid, name text, factor numeric, barcode text)
  where e.id is null;
end;
$$;

revoke execute on function public.set_product_packages(uuid, jsonb) from public, anon;
grant execute on function public.set_product_packages(uuid, jsonb) to authenticated;

-- Reemplaza las piezas del kit por la lista recibida: [{component_id, quantity}].
create function public.set_kit_components(p_kit uuid, p_components jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_company uuid;
begin
  select p.company_id into v_company from public.products p where p.id = p_kit and p.is_kit;
  if not found then
    raise exception 'kit not found' using errcode = 'P0002';
  end if;
  if not public.has_role(v_company, '{admin,editor}') then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  delete from public.kit_components k
  where k.kit_id = p_kit
    and k.component_id not in (
      select (e ->> 'component_id')::uuid from jsonb_array_elements(p_components) e
    );

  insert into public.kit_components (company_id, kit_id, component_id, quantity)
  select v_company, p_kit, e.component_id, e.quantity
  from jsonb_to_recordset(p_components) as e (component_id uuid, quantity numeric)
  on conflict (kit_id, component_id) do update set quantity = excluded.quantity;
end;
$$;

revoke execute on function public.set_kit_components(uuid, jsonb) from public, anon;
grant execute on function public.set_kit_components(uuid, jsonb) to authenticated;

-- Historial -----------------------------------------------------------------------------

-- En qué presentación se registró ("10 cajas") y si vino de la venta o entrada de un kit.
alter table public.stock_movements
  add column package_name text,
  add column package_qty numeric(14, 3),
  add column kit_name text,
  add column kit_qty numeric(14, 3);

-- Igual que en la fase 4, más presentación y kit (app.movement_package, app.movement_package_qty,
-- app.movement_kit, app.movement_kit_qty). El stock de un kit es calculado: no deja historial.
create or replace function public.log_stock_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_diff numeric := new.stock - case when tg_op = 'INSERT' then 0 else old.stock end;
begin
  if v_diff = 0 or new.is_kit then
    return null;
  end if;
  insert into public.stock_movements (
    company_id, product_id, type, quantity, stock_after, reason, package_name, package_qty, kit_name, kit_qty
  )
  values (
    new.company_id,
    new.id,
    coalesce(
      nullif(current_setting('app.movement_type', true), '')::public.movement_type,
      case when tg_op = 'INSERT' then 'in' else 'adjust' end::public.movement_type
    ),
    v_diff,
    new.stock,
    case
      when nullif(current_setting('app.movement_type', true), '') is not null
        then nullif(current_setting('app.movement_reason', true), '')
      else coalesce(
        nullif(current_setting('app.movement_reason', true), ''),
        case when tg_op = 'INSERT' then '@initial' else '@edit' end
      )
    end,
    nullif(current_setting('app.movement_package', true), ''),
    nullif(current_setting('app.movement_package_qty', true), '')::numeric,
    nullif(current_setting('app.movement_kit', true), ''),
    nullif(current_setting('app.movement_kit_qty', true), '')::numeric
  );
  return null;
end;
$$;

-- Movimientos -----------------------------------------------------------------------------

drop function public.record_movement(uuid, public.movement_type, numeric, text);

-- Registra una entrada, salida o ajuste y devuelve el stock nuevo (en unidad base).
-- p_quantity va en la presentación p_package (o en la unidad base si es null).
-- Un kit no se ajusta: su entrada o salida suma o descuenta cada pieza.
create function public.record_movement(
  p_product uuid,
  p_type public.movement_type,
  p_quantity numeric,
  p_reason text default null,
  p_package uuid default null
)
returns numeric
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_company uuid;
  v_name text;
  v_stock numeric;
  v_is_kit boolean;
  v_factor numeric := 1;
  v_package text;
  v_base numeric;
  v_new numeric;
  c record;
begin
  select p.company_id, p.name, p.stock, p.is_kit into v_company, v_name, v_stock, v_is_kit
  from public.products p where p.id = p_product
  for update;
  if not found then
    raise exception 'product not found' using errcode = 'P0002';
  end if;
  if not public.has_role(v_company, '{admin,editor}') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity < 0 or (p_type <> 'adjust' and p_quantity = 0) then
    raise exception 'invalid quantity' using errcode = '22023';
  end if;
  if p_package is not null then
    select k.name, k.factor into v_package, v_factor
    from public.product_packages k where k.id = p_package and k.product_id = p_product;
    if not found then
      raise exception 'package not found' using errcode = 'P0002';
    end if;
  end if;
  v_base := round(p_quantity * v_factor, 3);

  perform set_config('app.movement_type', p_type::text, true);
  perform set_config('app.movement_reason', coalesce(nullif(trim(p_reason), ''), ''), true);

  if v_is_kit then
    if p_type = 'adjust' then
      raise exception 'kits are not adjusted' using errcode = '22023', hint = 'kit_adjust';
    end if;
    if v_base <> trunc(v_base) then
      raise exception 'kits move in whole units' using errcode = '22023', hint = 'kit_whole';
    end if;
    if not exists (select 1 from public.kit_components k where k.kit_id = p_product) then
      raise exception 'kit has no components' using errcode = '22023', hint = 'kit_empty';
    end if;
    perform set_config('app.movement_kit', v_name, true);
    perform set_config('app.movement_kit_qty', v_base::text, true);
    -- Cada pieza deja su propio movimiento; se bloquean en orden fijo para evitar esperas cruzadas.
    for c in
      select k.component_id, k.quantity * v_base as need, p.stock, p.name
      from public.kit_components k
      join public.products p on p.id = k.component_id
      where k.kit_id = p_product
      order by k.component_id
      for update of p
    loop
      if p_type = 'out' and c.stock < c.need then
        raise exception 'insufficient stock' using errcode = '22023', hint = 'insufficient_stock', detail = c.name;
      end if;
      update public.products set stock = stock + case when p_type = 'in' then c.need else -c.need end
      where id = c.component_id;
    end loop;
    return (select p.stock from public.products p where p.id = p_product);
  end if;

  v_new := case p_type
    when 'in' then v_stock + v_base
    when 'out' then v_stock - v_base
    else v_base
  end;
  if v_new < 0 then
    raise exception 'insufficient stock' using errcode = '22023', hint = 'insufficient_stock';
  end if;
  if v_new = v_stock then
    raise exception 'no change' using errcode = '22023', hint = 'no_change';
  end if;

  perform set_config('app.movement_package', coalesce(v_package, ''), true);
  perform set_config('app.movement_package_qty', case when v_package is null then '' else p_quantity::text end, true);
  update public.products set stock = v_new where id = p_product;
  return v_new;
end;
$$;

revoke execute on function public.record_movement(uuid, public.movement_type, numeric, text, uuid) from public, anon;
grant execute on function public.record_movement(uuid, public.movement_type, numeric, text, uuid) to authenticated;

drop function public.list_movements(uuid, uuid, public.movement_type, date, date, bigint, int);

-- Igual que en la fase 4, con la presentación y el kit de cada movimiento.
create function public.list_movements(
  p_company uuid,
  p_product uuid default null,
  p_type public.movement_type default null,
  p_from date default null,
  p_to date default null,
  p_before_id bigint default null,
  p_limit int default 50
)
returns table (
  id bigint,
  created_at timestamptz,
  type public.movement_type,
  quantity numeric,
  stock_after numeric,
  reason text,
  package_name text,
  package_qty numeric,
  kit_name text,
  kit_qty numeric,
  product_id uuid,
  product_name text,
  product_sku text,
  unit text,
  user_email text
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.created_at, m.type, m.quantity, m.stock_after, m.reason,
    m.package_name, m.package_qty, m.kit_name, m.kit_qty,
    p.id, p.name, p.sku, p.unit, u.email::text
  from public.stock_movements m
  join public.products p on p.company_id = m.company_id and p.id = m.product_id
  left join auth.users u on u.id = m.created_by
  where public.is_member(p_company)
    and m.company_id = p_company
    and (p_product is null or m.product_id = p_product)
    and (p_type is null or m.type = p_type)
    and (p_from is null or m.created_at >= p_from)
    and (p_to is null or m.created_at < p_to + 1)
    and (p_before_id is null or m.id < p_before_id)
  order by m.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

-- Busca un código escaneado: SKU de un producto o código de una presentación.
create function public.find_code(p_company uuid, p_code text)
returns table (product_id uuid, package_id uuid)
language sql
stable
security invoker
set search_path = ''
as $$
  (select p.id, null::uuid from public.products p
   where p.company_id = p_company and lower(p.sku) = lower(trim(p_code)))
  union all
  (select k.product_id, k.id from public.product_packages k
   where k.company_id = p_company and lower(k.barcode) = lower(trim(p_code)))
  limit 1;
$$;

-- Lista de productos ------------------------------------------------------------------------

drop function public.search_products(uuid, text, uuid, uuid, uuid, boolean, text, uuid, int);

-- Igual que en la fase 2, más is_kit.
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
  is_kit boolean,
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
    'select p.id, p.sku, p.name, p.unit, p.price, p.stock, p.min_stock, p.is_kit, c.name, l.name
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

-- Panel: el valor del inventario cuenta las piezas, no los kits (serían el mismo stock dos veces).
create or replace function public.dashboard_summary(p_company uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.is_member(p_company) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'products', count(*),
    'low_stock', count(*) filter (where p.min_stock > 0 and p.stock <= p.min_stock),
    'out_of_stock', count(*) filter (where p.stock <= 0),
    'stock_cost', coalesce(sum(greatest(p.stock, 0) * p.cost) filter (where not p.is_kit), 0),
    'stock_price', coalesce(sum(greatest(p.stock, 0) * p.price) filter (where not p.is_kit), 0),
    'movements_7d', (
      select count(*) from public.stock_movements m
      where m.company_id = p_company and m.created_at >= now() - interval '7 days'
    )
  )
  into result
  from public.products p
  where p.company_id = p_company;
  return result;
end;
$$;

-- Importar y exportar ---------------------------------------------------------------------------

-- El siguiente SKU libre de la empresa (antes vivía dentro de assign_sku). La importación lo
-- usa para saber el SKU de cada producto nuevo y guardarle su presentación.
create function public.next_sku(p_company uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  n bigint;
  candidate text;
begin
  loop
    insert into public.company_counters as c (company_id, next_sku)
    values (p_company, 2)
    on conflict (company_id) do update set next_sku = c.next_sku + 1
    returning c.next_sku - 1 into n;

    candidate = 'P-' || lpad(n::text, 6, '0');
    exit when not exists (
      select 1 from public.products p where p.company_id = p_company and lower(p.sku) = lower(candidate)
    );
  end loop;
  return candidate;
end;
$$;

revoke execute on function public.next_sku(uuid) from public, anon, authenticated;

create or replace function public.assign_sku()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.sku is not null and trim(new.sku) <> '' then
    new.sku = trim(new.sku);
  else
    new.sku = public.next_sku(new.company_id);
  end if;
  return new;
end;
$$;

drop function public.import_rows(uuid, jsonb);

-- Igual que en la fase 3, más una presentación por fila (nombre y contenido).
create function public.import_rows(p_company uuid, p_rows jsonb)
returns table (
  sku text, name text, unit text, cost numeric, price numeric, stock numeric, min_stock numeric,
  category_id uuid, location_id uuid, supplier_id uuid, product_id uuid,
  package_name text, package_factor numeric
)
language sql
stable
set search_path = ''
as $$
  select r.sku, r.name, r.unit, r.cost, r.price, r.stock, r.min_stock, c.id, l.id, s.id, p.id,
    r.package_name, r.package_factor
  from (
    select nullif(trim(x.sku), '') as sku, nullif(trim(x.name), '') as name, nullif(trim(x.unit), '') as unit,
      x.cost, x.price, x.stock, x.min_stock,
      nullif(trim(x.category), '') as category, nullif(trim(x.location), '') as location,
      nullif(trim(x.supplier), '') as supplier,
      nullif(trim(x.package_name), '') as package_name, x.package_factor
    from jsonb_to_recordset(p_rows) as x (
      sku text, name text, unit text, cost numeric, price numeric, stock numeric, min_stock numeric,
      category text, location text, supplier text, package_name text, package_factor numeric
    )
  ) r
  left join public.categories c on c.company_id = p_company and lower(c.name) = lower(r.category)
  left join public.locations l on l.company_id = p_company and lower(l.name) = lower(r.location)
  left join public.suppliers s on s.company_id = p_company and lower(s.name) = lower(r.supplier)
  left join public.products p on p.company_id = p_company and lower(p.sku) = lower(r.sku);
$$;

revoke execute on function public.import_rows(uuid, jsonb) from public, anon, authenticated;

-- Igual que en la fase 4, más la presentación de cada fila (se crea o se actualiza su contenido).
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
      supplier_id = coalesce(i.supplier_id, p.supplier_id)
    from public.import_rows(p_company, p_rows) i
    where p.company_id = p_company and p.id = i.product_id;
    get diagnostics v_updated = row_count;

    insert into public.product_packages (company_id, product_id, name, factor)
    select distinct on (i.product_id, lower(i.package_name)) p_company, i.product_id, i.package_name, i.package_factor
    from public.import_rows(p_company, p_rows) i
    where i.product_id is not null and i.package_name is not null and i.package_factor > 0
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
      company_id, sku, name, unit, cost, price, stock, min_stock, category_id, location_id, supplier_id
    )
    select p_company, s.final_sku, s.name, coalesce(s.unit, 'unidad'), coalesce(s.cost, 0), coalesce(s.price, 0),
      coalesce(s.stock, 0), coalesce(s.min_stock, 0), s.category_id, s.location_id, s.supplier_id
    from src s
    returning id, sku
  ),
  packages as (
    insert into public.product_packages (company_id, product_id, name, factor)
    select p_company, c.id, s.package_name, s.package_factor
    from src s
    join created c on lower(c.sku) = lower(s.final_sku)
    where s.package_name is not null and s.package_factor > 0
    returning 1
  )
  select count(*) into v_created from created;

  return jsonb_build_object('created', v_created, 'updated', v_updated, 'skipped', v_total - v_created - v_updated);
end;
$$;

drop function public.export_products(uuid, text, uuid, int);

-- Igual que en la fase 3, con la presentación más grande del producto.
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
  package_factor numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, p.sku, p.name, c.name, p.unit, p.cost, p.price, p.stock, p.min_stock, l.name, s.name,
    k.name, k.factor
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
