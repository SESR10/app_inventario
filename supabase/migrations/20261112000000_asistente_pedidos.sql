-- Fase 9: asistente con IA y pedidos para recoger.
-- El asistente (función Edge "asistente") consulta el stock y deja pedidos aquí.
-- El stock no se mueve al crear el pedido: se descuenta cuando se marca como entregado.

create type public.order_status as enum ('pending', 'ready', 'delivered', 'cancelled');

create table public.customer_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  customer_name text not null check (length(trim(customer_name)) between 1 and 120),
  customer_phone text check (customer_phone is null or length(customer_phone) <= 40),
  pickup_at timestamptz,
  note text check (note is null or length(note) <= 500),
  status public.order_status not null default 'pending',
  source text not null default 'assistant' check (source in ('assistant', 'manual', 'whatsapp')),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (company_id, id)
);

create index customer_orders_company_idx on public.customer_orders (company_id, status, created_at desc);

create table public.customer_order_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  order_id uuid not null,
  product_id uuid,
  product_name text not null,
  unit text not null,
  quantity numeric(14, 3) not null check (quantity > 0),
  price numeric(14, 2) not null default 0,
  foreign key (company_id, order_id) references public.customer_orders (company_id, id) on delete cascade,
  foreign key (company_id, product_id) references public.products (company_id, id) on delete set null (product_id)
);

create index customer_order_items_order_idx on public.customer_order_items (order_id);
create index customer_order_items_product_idx on public.customer_order_items (company_id, product_id);

alter table public.customer_orders enable row level security;
alter table public.customer_order_items enable row level security;

create policy "miembros ven pedidos" on public.customer_orders
  for select to authenticated using (public.is_member(company_id));
create policy "miembros ven líneas de pedido" on public.customer_order_items
  for select to authenticated using (public.is_member(company_id));
-- Crear y cambiar pedidos solo por las funciones de abajo (revisan el rol).

-- Crea un pedido. p_items: [{"product_id": uuid, "quantity": número en la unidad base}].
create function public.create_customer_order(
  p_company uuid,
  p_customer text,
  p_phone text default null,
  p_pickup timestamptz default null,
  p_note text default null,
  p_items jsonb default '[]'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order uuid;
  v_count int;
begin
  if not public.has_role(p_company, '{admin,editor}') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty order' using errcode = '22023', hint = 'empty_order';
  end if;

  insert into public.customer_orders (company_id, customer_name, customer_phone, pickup_at, note)
  values (p_company, trim(p_customer), nullif(trim(p_phone), ''), p_pickup, nullif(trim(p_note), ''))
  returning id into v_order;

  insert into public.customer_order_items (company_id, order_id, product_id, product_name, unit, quantity, price)
  select p_company, v_order, p.id, p.name, p.unit, (i ->> 'quantity')::numeric, p.price
  from jsonb_array_elements(p_items) i
  join public.products p on p.company_id = p_company and p.id = (i ->> 'product_id')::uuid;

  get diagnostics v_count = row_count;
  if v_count <> jsonb_array_length(p_items) then
    raise exception 'product not found' using errcode = 'P0002', hint = 'product_not_found';
  end if;
  return v_order;
end;
$$;

-- Pedidos con sus líneas, los más nuevos primero.
create function public.list_customer_orders(
  p_company uuid,
  p_status public.order_status default null,
  p_limit int default 50
)
returns table (
  id uuid,
  customer_name text,
  customer_phone text,
  pickup_at timestamptz,
  note text,
  status public.order_status,
  source text,
  created_at timestamptz,
  items jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select o.id, o.customer_name, o.customer_phone, o.pickup_at, o.note, o.status, o.source, o.created_at,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_id', i.product_id, 'product_name', i.product_name, 'unit', i.unit,
        'quantity', i.quantity, 'price', i.price) order by i.product_name)
      from public.customer_order_items i where i.order_id = o.id
    ), '[]')
  from public.customer_orders o
  where o.company_id = p_company and (p_status is null or o.status = p_status)
  order by o.created_at desc, o.id
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

-- Cambia el estado. Al entregar, registra la salida de cada producto (todo o nada).
-- Security definer: los pedidos no tienen política de update; el rol se revisa aquí.
create function public.set_customer_order_status(p_order uuid, p_status public.order_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company uuid;
  v_status public.order_status;
  v_customer text;
  i record;
begin
  select o.company_id, o.status, o.customer_name into v_company, v_status, v_customer
  from public.customer_orders o where o.id = p_order
  for update;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  if not public.has_role(v_company, '{admin,editor}') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_status in ('delivered', 'cancelled') then
    raise exception 'order closed' using errcode = '22023', hint = 'order_closed';
  end if;

  if p_status = 'delivered' then
    for i in
      select it.product_id, it.quantity from public.customer_order_items it
      where it.order_id = p_order and it.product_id is not null
    loop
      perform public.record_movement(i.product_id, 'out', i.quantity, 'Pedido de ' || v_customer);
    end loop;
  end if;

  update public.customer_orders set status = p_status where id = p_order;
end;
$$;

revoke execute on function public.create_customer_order(uuid, text, text, timestamptz, text, jsonb) from public, anon;
revoke execute on function public.list_customer_orders(uuid, public.order_status, int) from public, anon;
revoke execute on function public.set_customer_order_status(uuid, public.order_status) from public, anon;
grant execute on function public.create_customer_order(uuid, text, text, timestamptz, text, jsonb) to authenticated;
grant execute on function public.list_customer_orders(uuid, public.order_status, int) to authenticated;
grant execute on function public.set_customer_order_status(uuid, public.order_status) to authenticated;
