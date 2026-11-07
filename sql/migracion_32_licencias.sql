-- Licencias: cada usuario tiene una licencia (prueba de 15 días, profesional o estudiante).
-- Si vence o se suspende, la base de datos bloquea registrar o modificar datos (solo lectura).
-- Correr en Supabase > SQL Editor. Es seguro repetirla.

create table if not exists public.licencias (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  plan text not null default 'prueba' check (plan in ('prueba', 'profesional', 'estudiante')),
  estado text not null default 'activa' check (estado in ('activa', 'suspendida')),
  vence_el date not null,
  max_empresas integer not null default 2,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.licencias enable row level security;

drop policy if exists "licencias: ver la propia" on public.licencias;
create policy "licencias: ver la propia" on public.licencias
  for select using (user_id = auth.uid() or is_admin());
drop policy if exists "licencias: administrador escribe" on public.licencias;
create policy "licencias: administrador escribe" on public.licencias
  for all using (is_admin()) with check (is_admin());

-- ¿El usuario tiene licencia activa y no vencida? (los administradores siempre pasan)
create or replace function public.licencia_vigente(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select is_admin() or exists (
    select 1 from licencias l
    where l.user_id = uid and l.estado = 'activa' and l.vence_el >= current_date
  );
$$;
grant execute on function public.licencia_vigente(uuid) to authenticated;

-- Todo usuario nuevo recibe una licencia de prueba de 15 días
create or replace function public.crear_licencia_prueba()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into licencias (user_id, email, plan, vence_el, max_empresas)
  values (new.id, new.email, 'prueba', current_date + 15, 2)
  on conflict (user_id) do nothing;
  return new;
end;
$$;
drop trigger if exists al_crear_usuario_licencia on auth.users;
create trigger al_crear_usuario_licencia
  after insert on auth.users
  for each row execute function public.crear_licencia_prueba();

-- Usuarios que ya existen: licencia profesional de 1 año (ajústala luego en el panel de administrador)
insert into licencias (user_id, email, plan, vence_el, max_empresas)
select u.id, u.email, 'profesional', current_date + 365, 20
from auth.users u
on conflict (user_id) do nothing;

-- Bloqueo en la base de datos: sin licencia vigente no se puede insertar ni modificar.
-- (Políticas RESTRICTIVAS: se suman a las que ya existen, no las reemplazan.)
-- Si más adelante creas tablas nuevas, vuelve a correr:  select public.aplicar_politicas_licencia();
create or replace function public.aplicar_politicas_licencia()
returns void
language plpgsql
set search_path = public
as $$
declare t text;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
      and c.relname not in ('licencias', 'perfiles', 'admins')
  loop
    execute format('drop policy if exists "licencia vigente (insertar)" on public.%I', t);
    execute format('create policy "licencia vigente (insertar)" on public.%I as restrictive for insert to authenticated with check (public.licencia_vigente(auth.uid()))', t);
    execute format('drop policy if exists "licencia vigente (modificar)" on public.%I', t);
    execute format('create policy "licencia vigente (modificar)" on public.%I as restrictive for update to authenticated using (public.licencia_vigente(auth.uid())) with check (public.licencia_vigente(auth.uid()))', t);
  end loop;
end;
$$;
revoke execute on function public.aplicar_politicas_licencia() from public, anon, authenticated;
select public.aplicar_politicas_licencia();

-- Máximo de empresas por licencia
drop policy if exists "licencia: máximo de empresas" on public.empresas;
create policy "licencia: máximo de empresas" on public.empresas
  as restrictive for insert to authenticated
  with check (
    is_admin() or (
      select count(*) from public.empresas e where e.user_id = auth.uid()
    ) < coalesce((select l.max_empresas from public.licencias l where l.user_id = auth.uid()), 0)
  );
