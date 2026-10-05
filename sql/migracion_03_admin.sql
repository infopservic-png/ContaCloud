-- Migración: modo administrador (ver todas las empresas, solo lectura)
-- Pega esto en Supabase > SQL Editor > New query > Run
-- IMPORTANTE: antes de correrlo, cambia el correo de abajo por el tuyo.

-- 1. Tabla de administradores (nadie puede leerla directo desde el cliente,
--    solo se consulta a través de la función is_admin()).
create table if not exists admins (
  email text primary key
);
alter table admins enable row level security;

-- 2. Agrega tu correo como administrador. Puedes correr esta línea varias
--    veces con distintos correos para agregar más administradores después.
insert into admins (email) values ('ogarcia@uca.edu.sv')
on conflict (email) do nothing;

-- 3. Función que revisa si el usuario que hace la consulta es administrador
create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from admins a where a.email = auth.jwt() ->> 'email'
  );
$$;

-- 4. Función que el sitio sí puede llamar, para saber si el usuario actual es admin
create or replace function soy_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select is_admin();
$$;
grant execute on function soy_admin() to authenticated;

-- 5. Columna para saber quién creó cada empresa (más fácil de mostrar en el
--    panel de administrador que buscarlo por separado).
alter table empresas add column if not exists propietario_email text;

-- Rellena el correo de las empresas que ya existían antes de este cambio.
update empresas e set propietario_email = u.email
from auth.users u
where e.user_id = u.id and e.propietario_email is null;

-- 6. Nuevas políticas de SOLO LECTURA para administradores.
--    (Se agregan aparte; no tocan ni reemplazan las políticas que ya
--    tenías, así que los estudiantes siguen viendo solo lo suyo.)
create policy "empresas: admin lee todo" on empresas
  for select using (is_admin());

create policy "cuentas: admin lee todo" on cuentas
  for select using (is_admin());

create policy "transacciones: admin lee todo" on transacciones
  for select using (is_admin());

create policy "movimientos: admin lee todo" on movimientos
  for select using (is_admin());
