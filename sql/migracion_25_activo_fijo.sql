-- Migración: módulo de Activo fijo (Propiedad, Planta y Equipo) con depreciación
-- por línea recta. Idempotente: se puede correr varias veces sin error.

create table if not exists activos_fijos (
  id uuid primary key default uuid_generate_v4(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  codigo text,
  nombre text not null,
  categoria text,
  fecha_adquisicion date not null,
  fecha_inicio_dep date not null,
  costo numeric(14,2) not null check (costo > 0),
  valor_residual numeric(14,2) not null default 0 check (valor_residual >= 0),
  vida_util_meses integer not null check (vida_util_meses > 0),
  tasa_anual numeric(8,4) not null default 0,
  cuenta_activo_id uuid references cuentas(id) on delete restrict,
  cuenta_gasto_id uuid references cuentas(id) on delete restrict,
  cuenta_dep_acum_id uuid references cuentas(id) on delete restrict,
  estado text not null default 'activo' check (estado in ('activo', 'baja')),
  created_at timestamptz not null default now()
);

create index if not exists idx_activos_fijos_empresa on activos_fijos (empresa_id);

create table if not exists depreciaciones (
  id uuid primary key default uuid_generate_v4(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  activo_id uuid not null references activos_fijos(id) on delete restrict,
  periodo date not null,                       -- primer día del mes depreciado
  monto numeric(14,2) not null check (monto >= 0),
  -- Si la partida se elimina desde el Libro diario, el mes queda pendiente otra vez.
  transaccion_id uuid references transacciones(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (activo_id, periodo)
);

create index if not exists idx_depreciaciones_empresa on depreciaciones (empresa_id, periodo);

alter table activos_fijos enable row level security;
drop policy if exists "activos_fijos: por empresa propia" on activos_fijos;
create policy "activos_fijos: por empresa propia" on activos_fijos
  for all using (exists (select 1 from empresas e where e.id = activos_fijos.empresa_id and e.user_id = auth.uid()))
  with check (exists (select 1 from empresas e where e.id = activos_fijos.empresa_id and e.user_id = auth.uid()));
drop policy if exists "activos_fijos: admin lee todo" on activos_fijos;
create policy "activos_fijos: admin lee todo" on activos_fijos for select using (is_admin());
drop policy if exists "activos_fijos: admin elimina" on activos_fijos;
create policy "activos_fijos: admin elimina" on activos_fijos for delete using (is_admin());

alter table depreciaciones enable row level security;
drop policy if exists "depreciaciones: por empresa propia" on depreciaciones;
create policy "depreciaciones: por empresa propia" on depreciaciones
  for all using (exists (select 1 from empresas e where e.id = depreciaciones.empresa_id and e.user_id = auth.uid()))
  with check (exists (select 1 from empresas e where e.id = depreciaciones.empresa_id and e.user_id = auth.uid()));
drop policy if exists "depreciaciones: admin lee todo" on depreciaciones;
create policy "depreciaciones: admin lee todo" on depreciaciones for select using (is_admin());
drop policy if exists "depreciaciones: admin elimina" on depreciaciones;
create policy "depreciaciones: admin elimina" on depreciaciones for delete using (is_admin());
