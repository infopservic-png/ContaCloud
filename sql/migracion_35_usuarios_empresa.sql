-- Migración 35: usuarios por empresa (acceso compartido) y reporte de accesos.
-- El dueño invita a otras personas por correo con un rol:
--   lector     → solo consulta
--   digitador  → consulta, crea y edita, pero no elimina
--   completo   → todo lo del dueño dentro de esa empresa (menos borrar la empresa o invitar gente)
-- Es idempotente: se puede correr más de una vez.

create table if not exists public.empresa_miembros (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  email text not null,
  rol text not null check (rol in ('lector', 'digitador', 'completo')),
  created_at timestamptz not null default now(),
  unique (empresa_id, email)
);
create unique index if not exists empresa_miembros_email_idx on public.empresa_miembros (empresa_id, lower(email));
alter table public.empresa_miembros enable row level security;

-- ¿Tiene el usuario actual este nivel de acceso a la empresa?  nivel: 'ver' | 'editar' | 'completo'
create or replace function public.puede_empresa(eid uuid, nivel text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.empresas e where e.id = eid and e.user_id = auth.uid())
      or exists (
        select 1 from public.empresa_miembros m
        where m.empresa_id = eid
          and lower(m.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
          and case nivel
                when 'ver' then true
                when 'editar' then m.rol in ('digitador', 'completo')
                when 'completo' then m.rol = 'completo'
                else false
              end
      );
$$;
grant execute on function public.puede_empresa(uuid, text) to authenticated;

drop policy if exists "miembros: dueño administra" on public.empresa_miembros;
create policy "miembros: dueño administra" on public.empresa_miembros
  for all using (exists (select 1 from public.empresas e where e.id = empresa_miembros.empresa_id and e.user_id = auth.uid()))
  with check (exists (select 1 from public.empresas e where e.id = empresa_miembros.empresa_id and e.user_id = auth.uid()));
drop policy if exists "miembros: cada quien ve su invitación" on public.empresa_miembros;
create policy "miembros: cada quien ve su invitación" on public.empresa_miembros
  for select using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
drop policy if exists "miembros: admin lee todo" on public.empresa_miembros;
create policy "miembros: admin lee todo" on public.empresa_miembros for select using (is_admin());

-- La empresa se ve (y los completos pueden cambiar su configuración); borrarla o crearla sigue siendo solo del dueño
drop policy if exists "empresas: miembros ven" on public.empresas;
create policy "empresas: miembros ven" on public.empresas for select using (public.puede_empresa(id, 'ver'));
drop policy if exists "empresas: miembros completos configuran" on public.empresas;
create policy "empresas: miembros completos configuran" on public.empresas for update
  using (public.puede_empresa(id, 'completo')) with check (public.puede_empresa(id, 'completo'));

-- La bitácora la ven el dueño y los usuarios con acceso completo
drop policy if exists "bitacora: dueño de la empresa lee" on public.bitacora;
drop policy if exists "bitacora: acceso completo lee" on public.bitacora;
create policy "bitacora: acceso completo lee" on public.bitacora for select using (public.puede_empresa(empresa_id, 'completo'));

-- La licencia vigente del dueño cubre a quienes trabajan en sus empresas
create or replace function public.licencia_vigente(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select is_admin()
    or exists (select 1 from licencias l where l.user_id = uid and l.estado = 'activa' and l.vence_el >= current_date)
    or exists (
      select 1
      from public.empresa_miembros m
      join public.empresas e on e.id = m.empresa_id
      join public.licencias l on l.user_id = e.user_id
      where lower(m.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and l.estado = 'activa' and l.vence_el >= current_date
    );
$$;
grant execute on function public.licencia_vigente(uuid) to authenticated;

-- Reporte de accesos: se anota cuando alguien entra a una empresa
create table if not exists public.accesos_empresa (
  id bigserial primary key,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  user_id uuid not null,
  email text,
  created_at timestamptz not null default now()
);
create index if not exists accesos_empresa_idx on public.accesos_empresa (empresa_id, created_at desc);
alter table public.accesos_empresa enable row level security;
drop policy if exists "accesos: registrar el propio" on public.accesos_empresa;
create policy "accesos: registrar el propio" on public.accesos_empresa
  for insert with check (user_id = auth.uid() and public.puede_empresa(empresa_id, 'ver'));
drop policy if exists "accesos: acceso completo lee" on public.accesos_empresa;
create policy "accesos: acceso completo lee" on public.accesos_empresa for select using (public.puede_empresa(empresa_id, 'completo'));
drop policy if exists "accesos: admin lee todo" on public.accesos_empresa;
create policy "accesos: admin lee todo" on public.accesos_empresa for select using (is_admin());

-- Reescribe las políticas existentes "empresa del dueño" para que también valgan para los miembros,
-- según el rol: ver (select) / editar (insert, update) / completo (delete).
do $$
declare
  p record;
  tablas_excluidas text[] := array['empresas', 'perfiles', 'licencias', 'admins', 'bitacora', 'empresa_miembros', 'accesos_empresa'];
  patron text := '\((\w+)\.user_id = auth\.uid\(\)\)';
  usando text;
  chequeo text;
  rol_a text;
begin
  for p in
    select * from pg_policies
    where schemaname = 'public' and permissive = 'PERMISSIVE'
      and tablename <> all (tablas_excluidas)
      and (coalesce(qual, '') ~ patron or coalesce(with_check, '') ~ patron)
  loop
    -- Segmenta cada política por comando; la de "ALL" se reparte en cuatro
    for rol_a in select unnest(case p.cmd when 'ALL' then array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] else array[p.cmd] end)
    loop
      usando := p.qual;
      chequeo := coalesce(p.with_check, p.qual);
      if usando is not null then
        usando := regexp_replace(usando, patron,
          case rol_a when 'SELECT' then 'public.puede_empresa(\1.id, ''ver'')' when 'DELETE' then 'public.puede_empresa(\1.id, ''completo'')' else 'public.puede_empresa(\1.id, ''editar'')' end, 'g');
      end if;
      if chequeo is not null then
        chequeo := regexp_replace(chequeo, patron, 'public.puede_empresa(\1.id, ''editar'')', 'g');
      end if;
      execute format('drop policy if exists %I on public.%I', left(p.policyname, 50) || ' [' || lower(rol_a) || ']', p.tablename);
      execute format(
        'create policy %I on public.%I as permissive for %s to %s %s %s',
        left(p.policyname, 50) || ' [' || lower(rol_a) || ']', p.tablename, rol_a, array_to_string(p.roles, ', '),
        case when rol_a in ('SELECT', 'UPDATE', 'DELETE') and usando is not null then 'using (' || usando || ')' else '' end,
        case when rol_a in ('INSERT', 'UPDATE') and chequeo is not null then 'with check (' || chequeo || ')' else '' end
      );
    end loop;
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

select public.aplicar_politicas_licencia();

-- Revisión: tablas con políticas que siguen exigiendo ser el dueño (deberían ser solo perfiles, licencias, etc.)
-- select tablename, policyname from pg_policies where schemaname = 'public' and (qual ~ 'user_id = auth.uid\(\)' or with_check ~ 'user_id = auth.uid\(\)');

-- Las invitaciones y cambios de acceso también quedan en la bitácora
drop trigger if exists bitacora_empresa_miembros on public.empresa_miembros;
create trigger bitacora_empresa_miembros after insert or update or delete on public.empresa_miembros
  for each row execute function public.registrar_bitacora();
