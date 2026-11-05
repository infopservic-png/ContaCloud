-- Migración: módulo de Recursos humanos — empleados, configuración de planilla,
-- planillas y su partida contable. Idempotente: se puede correr varias veces.

create table if not exists rrhh_config (
  id uuid primary key default uuid_generate_v4(),
  empresa_id uuid not null unique references empresas(id) on delete cascade,
  -- Porcentajes y topes (editables si cambia la ley)
  isss_emp_pct numeric(6,3) not null default 3,
  isss_pat_pct numeric(6,3) not null default 7.5,
  isss_tope_base numeric(12,2) not null default 1000,
  afp_emp_pct numeric(6,3) not null default 7.25,
  afp_pat_pct numeric(6,3) not null default 8.75,
  insaforp_pct numeric(6,3) not null default 1,
  aplica_insaforp boolean not null default true,
  salario_minimo numeric(12,2) not null default 408.80,
  vacaciones_dias numeric(6,2) not null default 15,
  vacaciones_recargo_pct numeric(6,2) not null default 30,
  provisiona_vacaciones boolean not null default true,
  provisiona_aguinaldo boolean not null default true,
  provisiona_indemnizacion boolean not null default true,
  -- Tablas de retención de renta: [{desde, hasta, pct, cuota, exceso}]
  tabla_renta_mensual jsonb,
  tabla_renta_quincenal jsonb,
  tabla_renta_junio jsonb,        -- recálculo de junio (acumulado enero-junio)
  tabla_renta_diciembre jsonb,    -- recálculo de diciembre (acumulado del año)
  -- Cuentas contables de la planilla
  cuenta_sueldos_id uuid references cuentas(id) on delete set null,
  cuenta_comisiones_id uuid references cuentas(id) on delete set null,
  cuenta_otros_ingresos_id uuid references cuentas(id) on delete set null,
  cuenta_cuotas_patronales_id uuid references cuentas(id) on delete set null,
  cuenta_sueldos_pagar_id uuid references cuentas(id) on delete set null,
  cuenta_isss_pagar_id uuid references cuentas(id) on delete set null,
  cuenta_afp_pagar_id uuid references cuentas(id) on delete set null,
  cuenta_insaforp_pagar_id uuid references cuentas(id) on delete set null,
  cuenta_renta_pagar_id uuid references cuentas(id) on delete set null,
  cuenta_otros_desc_pagar_id uuid references cuentas(id) on delete set null,
  cuenta_gasto_vacaciones_id uuid references cuentas(id) on delete set null,
  cuenta_prov_vacaciones_id uuid references cuentas(id) on delete set null,
  cuenta_gasto_aguinaldo_id uuid references cuentas(id) on delete set null,
  cuenta_prov_aguinaldo_id uuid references cuentas(id) on delete set null,
  cuenta_gasto_indem_id uuid references cuentas(id) on delete set null,
  cuenta_prov_indem_id uuid references cuentas(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table rrhh_config add column if not exists tabla_renta_junio jsonb;
alter table rrhh_config add column if not exists tabla_renta_diciembre jsonb;

create table if not exists empleados (
  id uuid primary key default uuid_generate_v4(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  codigo text,
  nombre text not null,
  dui text,
  nit text,
  numero_isss text,
  numero_afp text,
  telefono text,
  correo text,
  direccion text,
  cargo text,
  fecha_ingreso date not null,
  sueldo numeric(12,2) not null default 0,        -- sueldo mensual nominal
  periodicidad text not null default 'mensual' check (periodicidad in ('mensual', 'quincenal')),
  aplica_isss boolean not null default true,
  aplica_afp boolean not null default true,
  estado text not null default 'activo' check (estado in ('activo', 'retirado')),
  fecha_retiro date,
  created_at timestamptz not null default now()
);
create index if not exists idx_empleados_empresa on empleados (empresa_id);

create table if not exists planillas (
  id uuid primary key default uuid_generate_v4(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  periodicidad text not null check (periodicidad in ('mensual', 'quincenal')),
  periodo_ini date not null,
  periodo_fin date not null,
  fecha_pago date not null,
  descripcion text,
  -- Si la partida se elimina en el Libro diario, la planilla vuelve a borrador.
  transaccion_id uuid references transacciones(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_planillas_empresa on planillas (empresa_id, periodo_ini);

create table if not exists planilla_lineas (
  id uuid primary key default uuid_generate_v4(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  planilla_id uuid not null references planillas(id) on delete cascade,
  empleado_id uuid not null references empleados(id) on delete restrict,
  sueldo numeric(12,2) not null default 0,
  comisiones numeric(12,2) not null default 0,
  otros_ingresos numeric(12,2) not null default 0,
  otros_descuentos numeric(12,2) not null default 0,
  devengado numeric(12,2) not null default 0,
  isss_emp numeric(12,2) not null default 0,
  afp_emp numeric(12,2) not null default 0,
  renta numeric(12,2) not null default 0,
  liquido numeric(12,2) not null default 0,
  isss_pat numeric(12,2) not null default 0,
  afp_pat numeric(12,2) not null default 0,
  insaforp numeric(12,2) not null default 0,
  prov_vacaciones numeric(12,2) not null default 0,
  prov_aguinaldo numeric(12,2) not null default 0,
  prov_indemnizacion numeric(12,2) not null default 0,
  unique (planilla_id, empleado_id)
);
create index if not exists idx_planilla_lineas_planilla on planilla_lineas (planilla_id);

do $$
declare t text;
begin
  foreach t in array array['rrhh_config', 'empleados', 'planillas', 'planilla_lineas'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "%s: por empresa propia" on %I', t, t);
    execute format('create policy "%s: por empresa propia" on %I for all using (exists (select 1 from empresas e where e.id = %I.empresa_id and e.user_id = auth.uid())) with check (exists (select 1 from empresas e where e.id = %I.empresa_id and e.user_id = auth.uid()))', t, t, t, t);
    execute format('drop policy if exists "%s: admin lee todo" on %I', t, t);
    execute format('create policy "%s: admin lee todo" on %I for select using (is_admin())', t, t);
    execute format('drop policy if exists "%s: admin elimina" on %I', t, t);
    execute format('create policy "%s: admin elimina" on %I for delete using (is_admin())', t, t);
  end loop;
end $$;
