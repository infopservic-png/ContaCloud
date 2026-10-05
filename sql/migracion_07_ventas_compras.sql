-- Migración: módulos de Ventas y Compras
-- Integran Contabilidad (Diario), Kardex y Cuentas por Cobrar / por Pagar.
-- Pega esto en Supabase > SQL Editor > New query > Run
-- (Requiere haber corrido antes las migraciones 03, 05 y 06.)

-- === Cuentas de configuración por empresa ================================
alter table empresas add column if not exists cuenta_ventas_id uuid references cuentas(id);
alter table empresas add column if not exists cuenta_iva_debito_ccf_id uuid references cuentas(id);
alter table empresas add column if not exists cuenta_iva_debito_cf_id uuid references cuentas(id);
alter table empresas add column if not exists cuenta_iva_credito_id uuid references cuentas(id);

-- === Ventas ==============================================================
create table if not exists ventas (
  id uuid primary key default uuid_generate_v4(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  cliente_id uuid references clientes(id) on delete restrict,
  fecha date not null,
  tipo_documento text not null check (tipo_documento in ('ccf', 'factura', 'sin_iva')),
  numero_documento text,
  condicion text not null check (condicion in ('contado', 'credito')),
  fecha_vencimiento date,
  cuenta_cobro_id uuid references cuentas(id) on delete restrict,
  descripcion text,
  subtotal numeric(14,2) not null default 0,
  iva numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  costo_total numeric(14,2) not null default 0,
  transaccion_id uuid references transacciones(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists venta_lineas (
  id uuid primary key default uuid_generate_v4(),
  venta_id uuid not null references ventas(id) on delete cascade,
  producto_id uuid references productos(id) on delete restrict,
  cuenta_id uuid not null references cuentas(id) on delete restrict,
  descripcion text,
  cantidad numeric(14,4) not null check (cantidad > 0),
  precio_unitario numeric(14,4) not null,
  subtotal numeric(14,2) not null,
  costo_total numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

-- === Compras =============================================================
create table if not exists compras (
  id uuid primary key default uuid_generate_v4(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  proveedor_id uuid references proveedores(id) on delete restrict,
  fecha date not null,
  tipo_documento text not null check (tipo_documento in ('ccf', 'factura', 'sin_iva')),
  numero_documento text,
  condicion text not null check (condicion in ('contado', 'credito')),
  fecha_vencimiento date,
  cuenta_pago_id uuid references cuentas(id) on delete restrict,
  descripcion text,
  subtotal numeric(14,2) not null default 0,
  iva numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  transaccion_id uuid references transacciones(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists compra_lineas (
  id uuid primary key default uuid_generate_v4(),
  compra_id uuid not null references compras(id) on delete cascade,
  producto_id uuid references productos(id) on delete restrict,
  cuenta_id uuid not null references cuentas(id) on delete restrict,
  descripcion text,
  cantidad numeric(14,4) not null check (cantidad > 0),
  precio_unitario numeric(14,4) not null,
  subtotal numeric(14,2) not null,
  created_at timestamptz not null default now()
);

-- === Vínculos con Kardex y con Cuentas por Cobrar / Pagar ================
-- Los renglones de kardex y las facturas que nacen de una venta o compra
-- quedan ligados a su documento de origen (y se borran junto con él).
alter table kardex_movimientos add column if not exists venta_id uuid references ventas(id) on delete cascade;
alter table kardex_movimientos add column if not exists compra_id uuid references compras(id) on delete cascade;
alter table facturas_cxc add column if not exists venta_id uuid references ventas(id) on delete cascade;
alter table facturas_cxp add column if not exists compra_id uuid references compras(id) on delete cascade;

-- === Seguridad (RLS) =====================================================
alter table ventas enable row level security;
alter table venta_lineas enable row level security;
alter table compras enable row level security;
alter table compra_lineas enable row level security;

create policy "ventas: por empresa propia" on ventas
  for all using (exists (select 1 from empresas e where e.id = ventas.empresa_id and e.user_id = auth.uid()))
  with check (exists (select 1 from empresas e where e.id = ventas.empresa_id and e.user_id = auth.uid()));
create policy "ventas: admin lee todo" on ventas for select using (is_admin());
create policy "ventas: admin elimina" on ventas for delete using (is_admin());

create policy "venta_lineas: por venta propia" on venta_lineas
  for all using (exists (
    select 1 from ventas v join empresas e on e.id = v.empresa_id
    where v.id = venta_lineas.venta_id and e.user_id = auth.uid()))
  with check (exists (
    select 1 from ventas v join empresas e on e.id = v.empresa_id
    where v.id = venta_lineas.venta_id and e.user_id = auth.uid()));
create policy "venta_lineas: admin lee todo" on venta_lineas for select using (is_admin());
create policy "venta_lineas: admin elimina" on venta_lineas for delete using (is_admin());

create policy "compras: por empresa propia" on compras
  for all using (exists (select 1 from empresas e where e.id = compras.empresa_id and e.user_id = auth.uid()))
  with check (exists (select 1 from empresas e where e.id = compras.empresa_id and e.user_id = auth.uid()));
create policy "compras: admin lee todo" on compras for select using (is_admin());
create policy "compras: admin elimina" on compras for delete using (is_admin());

create policy "compra_lineas: por compra propia" on compra_lineas
  for all using (exists (
    select 1 from compras c join empresas e on e.id = c.empresa_id
    where c.id = compra_lineas.compra_id and e.user_id = auth.uid()))
  with check (exists (
    select 1 from compras c join empresas e on e.id = c.empresa_id
    where c.id = compra_lineas.compra_id and e.user_id = auth.uid()));
create policy "compra_lineas: admin lee todo" on compra_lineas for select using (is_admin());
create policy "compra_lineas: admin elimina" on compra_lineas for delete using (is_admin());
