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
