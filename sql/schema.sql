-- ContaCloud — Esquema de base de datos para Supabase (Postgres)
-- Pega este archivo completo en: Supabase > SQL Editor > New query > Run

create extension if not exists "uuid-ossp";

-- 1. Empresas de práctica creadas por cada estudiante
create table if not exists empresas (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nombre text not null,
  tipo text not null check (tipo in ('comercial', 'servicio')),
  moneda text default 'Dólares de los Estados Unidos de América (US$)',
  representante_legal text,
  contador text,
  auditor text,
  propietario_email text,
  created_at timestamptz not null default now()
);

-- 2. Catálogo de cuentas (una por empresa)
create table if not exists cuentas (
  id uuid primary key default uuid_generate_v4(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  codigo text not null,
  nombre text not null,
  clase text not null,
  tipo_saldo text not null check (tipo_saldo in ('deudor', 'acreedor')),
  created_at timestamptz not null default now(),
  unique (empresa_id, codigo)
);

-- 3. Transacciones (encabezado de cada asiento de diario)
create table if not exists transacciones (
  id uuid primary key default uuid_generate_v4(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  fecha date not null,
  descripcion text not null,
  numero_partida integer not null,
  elaborado_por text,
  revisado_por text,
  created_at timestamptz not null default now()
);

-- 4. Líneas de cada transacción (partida doble: debe/haber)
create table if not exists movimientos (
  id uuid primary key default uuid_generate_v4(),
  transaccion_id uuid not null references transacciones(id) on delete cascade,
  cuenta_id uuid not null references cuentas(id) on delete restrict,
  debe numeric(14,2) not null default 0,
  haber numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

-- Seguridad a nivel de fila: cada estudiante solo ve sus propias empresas y datos
alter table empresas enable row level security;
alter table cuentas enable row level security;
alter table transacciones enable row level security;
alter table movimientos enable row level security;

create policy "empresas: dueño" on empresas
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "cuentas: por empresa propia" on cuentas
  for all using (
    exists (select 1 from empresas e where e.id = cuentas.empresa_id and e.user_id = auth.uid())
  ) with check (
    exists (select 1 from empresas e where e.id = cuentas.empresa_id and e.user_id = auth.uid())
  );

create policy "transacciones: por empresa propia" on transacciones
  for all using (
    exists (select 1 from empresas e where e.id = transacciones.empresa_id and e.user_id = auth.uid())
  ) with check (
    exists (select 1 from empresas e where e.id = transacciones.empresa_id and e.user_id = auth.uid())
  );

create policy "movimientos: por transaccion propia" on movimientos
  for all using (
    exists (
      select 1 from transacciones t
      join empresas e on e.id = t.empresa_id
      where t.id = movimientos.transaccion_id and e.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from transacciones t
      join empresas e on e.id = t.empresa_id
      where t.id = movimientos.transaccion_id and e.user_id = auth.uid()
    )
  );

-- 5. Kardex de inventarios (costo promedio ponderado)
create table if not exists productos (
  id uuid primary key default uuid_generate_v4(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  codigo text,
  nombre text not null,
  unidad text,
  cuenta_inventario_id uuid not null references cuentas(id) on delete restrict,
  cuenta_costo_venta_id uuid not null references cuentas(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists kardex_movimientos (
  id uuid primary key default uuid_generate_v4(),
  producto_id uuid not null references productos(id) on delete cascade,
  fecha date not null,
  tipo text not null check (tipo in ('entrada', 'salida')),
  descripcion text,
  cantidad numeric(14,4) not null check (cantidad > 0),
  costo_unitario numeric(14,4) not null,
  costo_total numeric(14,2) not null,
  saldo_cantidad numeric(14,4) not null,
  saldo_costo_unitario numeric(14,4) not null,
  saldo_costo_total numeric(14,2) not null,
  transaccion_id uuid references transacciones(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table productos enable row level security;
alter table kardex_movimientos enable row level security;

create policy "productos: por empresa propia" on productos
  for all using (
    exists (select 1 from empresas e where e.id = productos.empresa_id and e.user_id = auth.uid())
  ) with check (
    exists (select 1 from empresas e where e.id = productos.empresa_id and e.user_id = auth.uid())
  );

create policy "kardex_movimientos: por producto propio" on kardex_movimientos
  for all using (
    exists (
      select 1 from productos p
      join empresas e on e.id = p.empresa_id
      where p.id = kardex_movimientos.producto_id and e.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from productos p
      join empresas e on e.id = p.empresa_id
      where p.id = kardex_movimientos.producto_id and e.user_id = auth.uid()
    )
  );

-- Para activar el modo administrador (ver todas las empresas de solo
-- lectura), corre también sql/migracion_03_admin.sql, sql/migracion_04_admin_eliminar.sql
-- y sql/migracion_05_kardex.sql (para las políticas de admin sobre productos/kardex),
-- y cambia el correo de ejemplo por el tuyo.
