-- Migración: Cuentas por Cobrar, Cuentas por Pagar y Bancos (con conciliación)
-- Pega esto en Supabase > SQL Editor > New query > Run

-- === Cuentas por Cobrar ===============================================
create table if not exists clientes (
  id uuid primary key default uuid_generate_v4(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nombre text not null,
  telefono text,
  correo text,
  direccion text,
  created_at timestamptz not null default now()
);

create table if not exists facturas_cxc (
  id uuid primary key default uuid_generate_v4(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  cliente_id uuid not null references clientes(id) on delete restrict,
  numero_factura text,
  fecha date not null,
  fecha_vencimiento date,
  descripcion text,
  monto numeric(14,2) not null check (monto > 0),
  saldo_pendiente numeric(14,2) not null,
  cuenta_contraria_id uuid not null references cuentas(id) on delete restrict,
  transaccion_id uuid references transacciones(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists abonos_cxc (
  id uuid primary key default uuid_generate_v4(),
  factura_id uuid not null references facturas_cxc(id) on delete cascade,
  fecha date not null,
  monto numeric(14,2) not null check (monto > 0),
  cuenta_contraria_id uuid not null references cuentas(id) on delete restrict,
  transaccion_id uuid references transacciones(id) on delete set null,
  created_at timestamptz not null default now()
);

-- === Cuentas por Pagar (simétrico) =====================================
create table if not exists proveedores (
  id uuid primary key default uuid_generate_v4(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nombre text not null,
  telefono text,
  correo text,
  direccion text,
  created_at timestamptz not null default now()
);

create table if not exists facturas_cxp (
  id uuid primary key default uuid_generate_v4(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  proveedor_id uuid not null references proveedores(id) on delete restrict,
  numero_factura text,
  fecha date not null,
  fecha_vencimiento date,
  descripcion text,
  monto numeric(14,2) not null check (monto > 0),
  saldo_pendiente numeric(14,2) not null,
  cuenta_contraria_id uuid not null references cuentas(id) on delete restrict,
  transaccion_id uuid references transacciones(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists abonos_cxp (
  id uuid primary key default uuid_generate_v4(),
  factura_id uuid not null references facturas_cxp(id) on delete cascade,
  fecha date not null,
  monto numeric(14,2) not null check (monto > 0),
  cuenta_contraria_id uuid not null references cuentas(id) on delete restrict,
  transaccion_id uuid references transacciones(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Cuenta de control (una sola por empresa) para Cuentas por Cobrar/Pagar
alter table empresas add column if not exists cuenta_cxc_id uuid references cuentas(id);
alter table empresas add column if not exists cuenta_cxp_id uuid references cuentas(id);

-- === Bancos y conciliación ==============================================
create table if not exists cuentas_bancarias (
  id uuid primary key default uuid_generate_v4(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nombre text not null,
  numero_cuenta text,
  cuenta_contable_id uuid not null references cuentas(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists movimientos_banco_estado (
  id uuid primary key default uuid_generate_v4(),
  cuenta_bancaria_id uuid not null references cuentas_bancarias(id) on delete cascade,
  fecha date not null,
  descripcion text,
  monto numeric(14,2) not null, -- positivo = depósito/abono, negativo = cargo/comisión
  conciliado boolean not null default false,
  created_at timestamptz not null default now()
);

-- Para poder marcar como "conciliado" un movimiento contable ya existente
-- (de cualquier módulo: partidas, kardex, CxC, CxP) cuando coincide con el
-- estado de cuenta del banco.
alter table movimientos add column if not exists conciliado boolean not null default false;

-- === Seguridad (RLS) ====================================================
alter table clientes enable row level security;
alter table facturas_cxc enable row level security;
alter table abonos_cxc enable row level security;
alter table proveedores enable row level security;
alter table facturas_cxp enable row level security;
alter table abonos_cxp enable row level security;
alter table cuentas_bancarias enable row level security;
alter table movimientos_banco_estado enable row level security;

create policy "clientes: por empresa propia" on clientes
  for all using (exists (select 1 from empresas e where e.id = clientes.empresa_id and e.user_id = auth.uid()))
  with check (exists (select 1 from empresas e where e.id = clientes.empresa_id and e.user_id = auth.uid()));
create policy "clientes: admin lee todo" on clientes for select using (is_admin());
create policy "clientes: admin elimina" on clientes for delete using (is_admin());

create policy "facturas_cxc: por empresa propia" on facturas_cxc
  for all using (exists (select 1 from empresas e where e.id = facturas_cxc.empresa_id and e.user_id = auth.uid()))
  with check (exists (select 1 from empresas e where e.id = facturas_cxc.empresa_id and e.user_id = auth.uid()));
create policy "facturas_cxc: admin lee todo" on facturas_cxc for select using (is_admin());
create policy "facturas_cxc: admin elimina" on facturas_cxc for delete using (is_admin());

create policy "abonos_cxc: por factura propia" on abonos_cxc
  for all using (exists (
    select 1 from facturas_cxc f join empresas e on e.id = f.empresa_id
    where f.id = abonos_cxc.factura_id and e.user_id = auth.uid()))
  with check (exists (
    select 1 from facturas_cxc f join empresas e on e.id = f.empresa_id
    where f.id = abonos_cxc.factura_id and e.user_id = auth.uid()));
create policy "abonos_cxc: admin lee todo" on abonos_cxc for select using (is_admin());
create policy "abonos_cxc: admin elimina" on abonos_cxc for delete using (is_admin());

create policy "proveedores: por empresa propia" on proveedores
  for all using (exists (select 1 from empresas e where e.id = proveedores.empresa_id and e.user_id = auth.uid()))
  with check (exists (select 1 from empresas e where e.id = proveedores.empresa_id and e.user_id = auth.uid()));
create policy "proveedores: admin lee todo" on proveedores for select using (is_admin());
create policy "proveedores: admin elimina" on proveedores for delete using (is_admin());

create policy "facturas_cxp: por empresa propia" on facturas_cxp
  for all using (exists (select 1 from empresas e where e.id = facturas_cxp.empresa_id and e.user_id = auth.uid()))
  with check (exists (select 1 from empresas e where e.id = facturas_cxp.empresa_id and e.user_id = auth.uid()));
create policy "facturas_cxp: admin lee todo" on facturas_cxp for select using (is_admin());
create policy "facturas_cxp: admin elimina" on facturas_cxp for delete using (is_admin());

create policy "abonos_cxp: por factura propia" on abonos_cxp
  for all using (exists (
    select 1 from facturas_cxp f join empresas e on e.id = f.empresa_id
    where f.id = abonos_cxp.factura_id and e.user_id = auth.uid()))
  with check (exists (
    select 1 from facturas_cxp f join empresas e on e.id = f.empresa_id
    where f.id = abonos_cxp.factura_id and e.user_id = auth.uid()));
create policy "abonos_cxp: admin lee todo" on abonos_cxp for select using (is_admin());
create policy "abonos_cxp: admin elimina" on abonos_cxp for delete using (is_admin());

create policy "cuentas_bancarias: por empresa propia" on cuentas_bancarias
  for all using (exists (select 1 from empresas e where e.id = cuentas_bancarias.empresa_id and e.user_id = auth.uid()))
  with check (exists (select 1 from empresas e where e.id = cuentas_bancarias.empresa_id and e.user_id = auth.uid()));
create policy "cuentas_bancarias: admin lee todo" on cuentas_bancarias for select using (is_admin());
create policy "cuentas_bancarias: admin elimina" on cuentas_bancarias for delete using (is_admin());

create policy "movimientos_banco_estado: por cuenta propia" on movimientos_banco_estado
  for all using (exists (
    select 1 from cuentas_bancarias cb join empresas e on e.id = cb.empresa_id
    where cb.id = movimientos_banco_estado.cuenta_bancaria_id and e.user_id = auth.uid()))
  with check (exists (
    select 1 from cuentas_bancarias cb join empresas e on e.id = cb.empresa_id
    where cb.id = movimientos_banco_estado.cuenta_bancaria_id and e.user_id = auth.uid()));
create policy "movimientos_banco_estado: admin lee todo" on movimientos_banco_estado for select using (is_admin());
create policy "movimientos_banco_estado: admin elimina" on movimientos_banco_estado for delete using (is_admin());
