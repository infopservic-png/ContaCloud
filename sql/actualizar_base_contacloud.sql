-- =====================================================================
-- ContaCloud — Actualización COMPLETA de la base de datos
-- Para una base que ya tiene las tablas básicas (empresas, cuentas,
-- transacciones, movimientos) y la facturación DTE de la versión anterior.
-- Agrega: firmas, modo administrador, Kardex, CxC, CxP, Bancos,
-- Ventas, Compras y la facturación DTE.
--
-- Pega TODO este archivo en Supabase > SQL Editor > New query > Run.
-- Se ejecuta como una sola operación: si algo falla, no se aplica nada
-- y puedes corregir y volver a correrlo.
--
-- >>> ADMINISTRADOR: el correo que aparece en la sección 03 (más abajo,
-- >>> en la línea "insert into admins") podrá VER y ELIMINAR todas las
-- >>> empresas. Cámbialo por el tuyo antes de ejecutar si hace falta.
-- =====================================================================


-- ###################################################################
-- ## migracion_02_firmas_y_config.sql
-- ###################################################################
-- Migración: firmas en partidas + datos de presentación de la empresa
-- Pega esto en Supabase > SQL Editor > New query > Run
-- (Es seguro correrlo aunque ya tengas datos; no borra nada.)

alter table transacciones add column if not exists elaborado_por text;
alter table transacciones add column if not exists revisado_por text;

alter table empresas add column if not exists moneda text
  default 'Dólares de los Estados Unidos de América (US$)';
alter table empresas add column if not exists representante_legal text;
alter table empresas add column if not exists contador text;
alter table empresas add column if not exists auditor text;


-- ###################################################################
-- ## migracion_03_admin.sql
-- ###################################################################
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


-- ###################################################################
-- ## migracion_04_admin_eliminar.sql
-- ###################################################################
-- Migración: permite al administrador ELIMINAR empresas de cualquier usuario
-- (antes solo podía leerlas). Pega esto en Supabase > SQL Editor > New query > Run.

create policy "empresas: admin elimina" on empresas
  for delete using (is_admin());

create policy "cuentas: admin elimina" on cuentas
  for delete using (is_admin());

create policy "transacciones: admin elimina" on transacciones
  for delete using (is_admin());

create policy "movimientos: admin elimina" on movimientos
  for delete using (is_admin());


-- ###################################################################
-- ## migracion_05_kardex.sql
-- ###################################################################
-- Migración: módulo de Kardex (inventarios por costo promedio ponderado)
-- Pega esto en Supabase > SQL Editor > New query > Run

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

create policy "productos: admin lee todo" on productos
  for select using (is_admin());
create policy "productos: admin elimina" on productos
  for delete using (is_admin());

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

create policy "kardex_movimientos: admin lee todo" on kardex_movimientos
  for select using (is_admin());
create policy "kardex_movimientos: admin elimina" on kardex_movimientos
  for delete using (is_admin());


-- ###################################################################
-- ## migracion_06_cxc_cxp_bancos.sql
-- ###################################################################
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


-- ###################################################################
-- ## migracion_07_ventas_compras.sql
-- ###################################################################
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


-- ###################################################################
-- ## migracion_08_facturacion_dte.sql
-- ###################################################################
-- Migración: Facturación Electrónica (DTE El Salvador)
-- Datos fiscales del emisor + documentos DTE emitidos.
-- Requiere haber corrido antes la migración 03 (función is_admin).
-- Se puede correr varias veces sin error.

alter table empresas
  add column if not exists nit text,
  add column if not exists nrc text,
  add column if not exists nombre_comercial text,
  add column if not exists giro text,
  add column if not exists direccion text,
  add column if not exists departamento text,
  add column if not exists municipio text,
  add column if not exists telefono_emisor text,
  add column if not exists correo_emisor text,
  add column if not exists cod_establecimiento text not null default '0001',
  add column if not exists cod_punto_venta text not null default '0001';

create table if not exists documentos_dte (
  id uuid primary key default uuid_generate_v4(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  tipo_dte text not null,
  numero_control text not null,
  codigo_generacion text not null,
  fecha_emision date not null,
  forma_pago text not null default 'contado',
  receptor jsonb not null,
  items jsonb not null,
  subtotal numeric(14,2) not null default 0,
  iva numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  estado text not null default 'generado'
    check (estado in ('generado','firmado','transmitido','rechazado','invalidado')),
  json_dte jsonb not null,
  transaccion_id uuid references transacciones(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (empresa_id, numero_control)
);

alter table documentos_dte enable row level security;

drop policy if exists "documentos_dte: por empresa propia" on documentos_dte;
create policy "documentos_dte: por empresa propia" on documentos_dte
  for all using (
    exists (select 1 from empresas e where e.id = documentos_dte.empresa_id and e.user_id = auth.uid())
  ) with check (
    exists (select 1 from empresas e where e.id = documentos_dte.empresa_id and e.user_id = auth.uid())
  );

drop policy if exists "documentos_dte: admin lee todo" on documentos_dte;
create policy "documentos_dte: admin lee todo" on documentos_dte for select using (is_admin());
drop policy if exists "documentos_dte: admin elimina" on documentos_dte;
create policy "documentos_dte: admin elimina" on documentos_dte for delete using (is_admin());


-- ###################################################################
-- ## Ajuste final: texto de moneda igual al de las pantallas de reportes
-- ###################################################################
alter table empresas alter column moneda set default 'Dólares de los Estados Unidos de América (US$)';
update empresas set moneda = 'Dólares de los Estados Unidos de América (US$)' where moneda = 'USD';
