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
