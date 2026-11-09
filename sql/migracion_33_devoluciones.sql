-- Devoluciones sobre ventas y compras (notas de crédito) con efecto en el kardex.
-- Correr en Supabase > SQL Editor. Es seguro repetirla.

create table if not exists public.devoluciones (
  id uuid primary key default uuid_generate_v4(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo text not null check (tipo in ('venta', 'compra')),
  fecha date not null,
  venta_id uuid references public.ventas(id) on delete set null,
  compra_id uuid references public.compras(id) on delete set null,
  cliente_id uuid references public.clientes(id) on delete set null,
  proveedor_id uuid references public.proveedores(id) on delete set null,
  numero_documento text,
  codigo_generacion text,
  motivo text,
  liquidacion text not null default 'cuenta' check (liquidacion in ('cuenta', 'efectivo')),
  cuenta_dinero_id uuid references public.cuentas(id) on delete set null,
  factura_id uuid,
  monto_factura numeric(14,2) not null default 0,
  subtotal numeric(14,2) not null default 0,
  iva numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  costo_total numeric(14,2) not null default 0,
  transaccion_id uuid references public.transacciones(id) on delete set null,
  json_dte jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.devolucion_lineas (
  id uuid primary key default uuid_generate_v4(),
  devolucion_id uuid not null references public.devoluciones(id) on delete cascade,
  linea_origen_id uuid,
  producto_id uuid references public.productos(id) on delete restrict,
  cuenta_id uuid not null references public.cuentas(id) on delete restrict,
  descripcion text,
  cantidad numeric(14,4) not null check (cantidad > 0),
  precio_unitario numeric(14,4) not null default 0,
  subtotal numeric(14,2) not null,
  costo_total numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

-- El kardex liga sus renglones a la devolución; las devoluciones entran/salen a un costo fijo
-- (el de la venta o compra original), no al promedio vigente.
alter table public.kardex_movimientos add column if not exists devolucion_id uuid references public.devoluciones(id) on delete cascade;
alter table public.kardex_movimientos add column if not exists costo_fijo boolean not null default false;
-- La nota de crédito emitida desde Facturación queda ligada a su devolución
alter table public.documentos_dte add column if not exists devolucion_id uuid references public.devoluciones(id) on delete cascade;

alter table public.devoluciones enable row level security;
alter table public.devolucion_lineas enable row level security;

drop policy if exists "devoluciones: por empresa propia" on public.devoluciones;
create policy "devoluciones: por empresa propia" on public.devoluciones
  for all using (exists (select 1 from public.empresas e where e.id = devoluciones.empresa_id and e.user_id = auth.uid()))
  with check (exists (select 1 from public.empresas e where e.id = devoluciones.empresa_id and e.user_id = auth.uid()));
drop policy if exists "devoluciones: admin lee todo" on public.devoluciones;
create policy "devoluciones: admin lee todo" on public.devoluciones for select using (is_admin());
drop policy if exists "devoluciones: admin elimina" on public.devoluciones;
create policy "devoluciones: admin elimina" on public.devoluciones for delete using (is_admin());

drop policy if exists "devolucion_lineas: por devolución propia" on public.devolucion_lineas;
create policy "devolucion_lineas: por devolución propia" on public.devolucion_lineas
  for all using (exists (
    select 1 from public.devoluciones d join public.empresas e on e.id = d.empresa_id
    where d.id = devolucion_lineas.devolucion_id and e.user_id = auth.uid()))
  with check (exists (
    select 1 from public.devoluciones d join public.empresas e on e.id = d.empresa_id
    where d.id = devolucion_lineas.devolucion_id and e.user_id = auth.uid()));
drop policy if exists "devolucion_lineas: admin lee todo" on public.devolucion_lineas;
create policy "devolucion_lineas: admin lee todo" on public.devolucion_lineas for select using (is_admin());
drop policy if exists "devolucion_lineas: admin elimina" on public.devolucion_lineas;
create policy "devolucion_lineas: admin elimina" on public.devolucion_lineas for delete using (is_admin());

-- Bloqueo por licencia vencida también en las tablas nuevas
select public.aplicar_politicas_licencia();
