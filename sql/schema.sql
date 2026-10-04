-- ContaCloud — Esquema de base de datos para Supabase (Postgres)
-- Pega este archivo completo en: Supabase > SQL Editor > New query > Run

create extension if not exists "uuid-ossp";

create table if not exists empresas (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nombre text not null,
  tipo text not null check (tipo in ('comercial', 'servicio')),
  created_at timestamptz not null default now()
);

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

create table if not exists transacciones (
  id uuid primary key default uuid_generate_v4(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  fecha date not null,
  descripcion text not null,
  numero_partida integer not null,
  created_at timestamptz not null default now()
);

create table if not exists movimientos (
  id uuid primary key default uuid_generate_v4(),
  transaccion_id uuid not null references transacciones(id) on delete cascade,
  cuenta_id uuid not null references cuentas(id) on delete restrict,
  debe numeric(14,2) not null default 0,
  haber numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

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

-- Periodo contable y moneda por empresa (para encabezados de estados financieros)
alter table empresas
  add column if not exists periodo_inicio date,
  add column if not exists periodo_fin date,
  add column if not exists moneda text not null default 'USD';
