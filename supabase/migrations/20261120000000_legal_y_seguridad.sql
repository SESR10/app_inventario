-- Ley 1581 de 2012 y seguridad.
-- 1) Prueba de la autorización de datos personales (Decreto 1377 de 2013, art. 8): quién aceptó,
--    qué versión de los términos y la política, y cuándo.
-- 2) Endurecimiento: quien no ha ingresado (rol anon) no puede llamar funciones ni leer tablas,
--    invitar ya no revela si un correo tiene cuenta ni agrega a nadie sin que ingrese,
--    y límites de tamaño en textos libres.

-- 1) Autorizaciones ---------------------------------------------------------------------

create table public.legal_consents (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  document text not null check (document in ('terms', 'privacy')),
  version text not null check (length(version) between 1 and 20),
  source text not null check (source in ('signup', 'login')),
  accepted_at timestamptz not null default now(),
  unique (user_id, document, version)
);

alter table public.legal_consents enable row level security;
create policy "cada quien ve sus autorizaciones" on public.legal_consents
  for select to authenticated using (user_id = (select auth.uid()));
-- Se crean solo con el registro (trigger) o con accept_legal.

-- Al crear la cuenta, la app manda en los metadatos la versión que la persona aceptó.
create function public.record_signup_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version text := left(new.raw_user_meta_data ->> 'legal_version', 20);
begin
  -- La fecha es la del servidor al crear la cuenta, no la que mande el navegador.
  if coalesce(v_version, '') <> '' then
    insert into public.legal_consents (user_id, document, version, source)
    values (new.id, 'terms', v_version, 'signup'), (new.id, 'privacy', v_version, 'signup')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created_consent
after insert on auth.users
for each row execute function public.record_signup_consent();

-- Cuentas creadas antes de correr este archivo pero que ya aceptaron en el registro.
insert into public.legal_consents (user_id, document, version, source)
select u.id, d.document, left(u.raw_user_meta_data ->> 'legal_version', 20), 'signup'
from auth.users u
cross join (values ('terms'), ('privacy')) as d (document)
where coalesce(u.raw_user_meta_data ->> 'legal_version', '') <> ''
on conflict do nothing;

-- ¿Le falta aceptar esta versión? (cuentas antiguas o términos actualizados)
create function public.legal_pending(p_version text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select (select count(distinct c.document)
          from public.legal_consents c
          where c.user_id = (select auth.uid()) and c.version = p_version) < 2;
$$;

create function public.accept_legal(p_version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_version is null or length(p_version) not between 1 and 20 then
    raise exception 'invalid version' using errcode = '22023';
  end if;
  insert into public.legal_consents (user_id, document, version, source)
  values ((select auth.uid()), 'terms', p_version, 'login'), ((select auth.uid()), 'privacy', p_version, 'login')
  on conflict do nothing;
end;
$$;

-- 2) Invitaciones sin revelar cuentas -----------------------------------------------------

-- Antes: si el correo tenía cuenta, la agregaba de una vez ('added'), lo que dejaba saber qué
-- correos están registrados y metía a la persona en una empresa sin su intervención.
-- Ahora siempre deja la invitación; la persona entra a la empresa al abrir la app con ese correo.
create or replace function public.invite_member(p_company uuid, p_email text, p_role public.app_role)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
begin
  if not public.has_role(p_company, '{admin}') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254 then
    raise exception 'invalid email' using errcode = '22023', hint = 'invalid_email';
  end if;
  if exists (
    select 1 from public.company_members m join auth.users u on u.id = m.user_id
    where m.company_id = p_company and lower(u.email) = v_email
  ) then
    raise exception 'already member' using errcode = '23505', hint = 'already_member';
  end if;

  insert into public.company_invitations (company_id, email, role) values (p_company, v_email, p_role)
  on conflict (company_id, email) do update set role = excluded.role, invited_by = auth.uid(), created_at = now();
  return 'invited';
end;
$$;

-- Los miembros entran solo por create_company y claim_invitations (ambas security definer).
drop policy "admin agrega miembros" on public.company_members;

-- 3) Nadie sin sesión llama funciones ni lee tablas ---------------------------------------

-- Postgres da EXECUTE a PUBLIC en toda función nueva. Se conserva para "authenticated" donde ya
-- lo tenía y se quita a PUBLIC y anon.
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
  loop
    if has_function_privilege('authenticated', f, 'EXECUTE') then
      execute format('grant execute on function %s to authenticated', f);
    end if;
    execute format('revoke execute on function %s from public, anon', f);
  end loop;
end;
$$;

grant execute on function public.legal_pending(text) to authenticated;
grant execute on function public.accept_legal(text) to authenticated;
revoke execute on function public.record_signup_consent() from authenticated;

-- Funciones futuras: solo para authenticated (y service_role), no para PUBLIC ni anon.
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon;
alter default privileges for role postgres in schema public grant execute on functions to authenticated, service_role;

-- Tablas: todas las políticas son "to authenticated"; se quita también el permiso de base a anon.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;

-- 4) Límites de tamaño en textos libres (solo para filas nuevas o editadas) -----------------

alter table public.suppliers
  add constraint suppliers_contact_len check (
    coalesce(length(contact_name), 0) <= 120 and coalesce(length(phone), 0) <= 40 and coalesce(length(email), 0) <= 254
  ) not valid;
alter table public.products
  add constraint products_text_len check (
    length(unit) <= 40 and coalesce(length(image_path), 0) <= 300
  ) not valid;
alter table public.stock_movements
  add constraint stock_movements_reason_len check (coalesce(length(reason), 0) <= 500) not valid;
