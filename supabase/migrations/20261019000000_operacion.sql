-- Fase 4: movimientos con historial, panel con resumen y gestión del equipo.

-- Historial automático de stock ------------------------------------------------

-- Todo cambio de stock queda en stock_movements, venga de donde venga (formulario,
-- movimiento, importación). Quien cambia el stock puede indicar tipo y motivo con
--   set_config('app.movement_type', ..., true) y set_config('app.movement_reason', ..., true)
-- (solo para la transacción actual). Los motivos que empiezan con @ son códigos que
-- la interfaz traduce: @initial (stock inicial), @import (importación), @edit (edición).
create function public.log_stock_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_diff numeric := new.stock - case when tg_op = 'INSERT' then 0 else old.stock end;
begin
  if v_diff = 0 then
    return null;
  end if;
  insert into public.stock_movements (company_id, product_id, type, quantity, stock_after, reason)
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
      -- Movimiento registrado con record_movement: el motivo es el que escribió la persona.
      when nullif(current_setting('app.movement_type', true), '') is not null
        then nullif(current_setting('app.movement_reason', true), '')
      else coalesce(
        nullif(current_setting('app.movement_reason', true), ''),
        case when tg_op = 'INSERT' then '@initial' else '@edit' end
      )
    end
  );
  return null;
end;
$$;

create trigger products_log_stock
after insert or update of stock on public.products
for each row execute function public.log_stock_change();

-- Registra una entrada, salida o ajuste y devuelve el stock nuevo.
-- in/out: p_quantity es la cantidad que entra o sale (> 0).
-- adjust: p_quantity es el stock contado (>= 0); se guarda la diferencia.
create function public.record_movement(
  p_product uuid,
  p_type public.movement_type,
  p_quantity numeric,
  p_reason text default null
)
returns numeric
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_company uuid;
  v_stock numeric;
  v_new numeric;
begin
  select p.company_id, p.stock into v_company, v_stock
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

  v_new := case p_type
    when 'in' then v_stock + p_quantity
    when 'out' then v_stock - p_quantity
    else p_quantity
  end;
  if v_new < 0 then
    raise exception 'insufficient stock' using errcode = '22023', hint = 'insufficient_stock';
  end if;
  if v_new = v_stock then
    raise exception 'no change' using errcode = '22023', hint = 'no_change';
  end if;

  perform set_config('app.movement_type', p_type::text, true);
  perform set_config('app.movement_reason', coalesce(nullif(trim(p_reason), ''), ''), true);
  update public.products set stock = v_new where id = p_product;
  return v_new;
end;
$$;

revoke execute on function public.record_movement(uuid, public.movement_type, numeric, text) from public, anon;
grant execute on function public.record_movement(uuid, public.movement_type, numeric, text) to authenticated;

-- La importación también deja su rastro en el historial.
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
  -- El historial de movimientos registra los cambios de stock como importación.
  perform set_config('app.movement_reason', '@import', true);

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

-- Historial ------------------------------------------------------------------------

-- Orden del historial: el id crece con el tiempo y no se repite (created_at sí, dentro de una importación).
create index stock_movements_company_id_idx on public.stock_movements (company_id, id desc);

-- Movimientos más recientes primero, por páginas (cursor id), con el producto
-- y el correo de quien lo registró. security definer para leer el correo en auth.users.
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

-- Panel ------------------------------------------------------------------------------

-- Resumen del inventario. security definer: una sola validación de permiso en vez de
-- una por fila, para que sea rápido con 100.000+ productos.
create function public.dashboard_summary(p_company uuid)
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
    'stock_cost', coalesce(sum(greatest(p.stock, 0) * p.cost), 0),
    'stock_price', coalesce(sum(greatest(p.stock, 0) * p.price), 0),
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

-- Equipo -----------------------------------------------------------------------------

-- Invitaciones para correos que aún no tienen cuenta: se aceptan solas al ingresar.
create table public.company_invitations (
  company_id uuid not null references public.companies (id) on delete cascade,
  email text not null check (email = lower(trim(email)) and email like '%_@_%'),
  role public.app_role not null default 'viewer',
  invited_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (company_id, email)
);

create index company_invitations_email_idx on public.company_invitations (email);

alter table public.company_invitations enable row level security;
create policy "admin ve invitaciones" on public.company_invitations
  for select to authenticated using (public.has_role(company_id, '{admin}'));
create policy "admin cancela invitaciones" on public.company_invitations
  for delete to authenticated using (public.has_role(company_id, '{admin}'));
-- Se crean solo con invite_member.

-- Miembros de la empresa con su correo.
create function public.company_people(p_company uuid)
returns table (user_id uuid, email text, role public.app_role, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, u.email::text, m.role, m.created_at
  from public.company_members m
  join auth.users u on u.id = m.user_id
  where public.is_member(p_company) and m.company_id = p_company
  order by lower(u.email);
$$;

-- Agrega a la persona si ya tiene cuenta ('added'); si no, deja la invitación ('invited').
create function public.invite_member(p_company uuid, p_email text, p_role public.app_role)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
  v_user uuid;
begin
  if not public.has_role(p_company, '{admin}') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid email' using errcode = '22023', hint = 'invalid_email';
  end if;

  -- Solo cuentas con el correo confirmado; si no, queda como invitación.
  select u.id into v_user from auth.users u where lower(u.email) = v_email and u.email_confirmed_at is not null;
  if v_user is not null then
    if exists (select 1 from public.company_members m where m.company_id = p_company and m.user_id = v_user) then
      raise exception 'already member' using errcode = '23505', hint = 'already_member';
    end if;
    insert into public.company_members (company_id, user_id, role) values (p_company, v_user, p_role);
    return 'added';
  end if;

  insert into public.company_invitations (company_id, email, role) values (p_company, v_email, p_role)
  on conflict (company_id, email) do update set role = excluded.role, invited_by = auth.uid(), created_at = now();
  return 'invited';
end;
$$;

revoke execute on function public.invite_member(uuid, text, public.app_role) from public, anon;
grant execute on function public.invite_member(uuid, text, public.app_role) to authenticated;

-- Al ingresar: convierte en membresías las invitaciones al correo (confirmado) de quien entra.
create function public.claim_invitations()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_count int;
begin
  select lower(u.email) into v_email
  from auth.users u
  where u.id = (select auth.uid()) and u.email_confirmed_at is not null;
  if v_email is null then
    return 0;
  end if;

  insert into public.company_members (company_id, user_id, role)
  select i.company_id, (select auth.uid()), i.role
  from public.company_invitations i
  where i.email = v_email
  on conflict (company_id, user_id) do nothing;
  get diagnostics v_count = row_count;

  delete from public.company_invitations i where i.email = v_email;
  return v_count;
end;
$$;

revoke execute on function public.claim_invitations() from public, anon;
grant execute on function public.claim_invitations() to authenticated;

-- Toda empresa conserva al menos un administrador.
create function public.keep_one_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.role = 'admin'
    and exists (select 1 from public.companies c where c.id = old.company_id)
    and not exists (
      select 1 from public.company_members m where m.company_id = old.company_id and m.role = 'admin'
    )
  then
    raise exception 'last admin' using errcode = '23514', hint = 'last_admin';
  end if;
  return null;
end;
$$;

create trigger company_members_keep_admin
after update of role or delete on public.company_members
for each row execute function public.keep_one_admin();
