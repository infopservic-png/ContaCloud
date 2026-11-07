-- Migración: Anexo F14 (retenciones de renta) y Anexo Q25.
-- Idempotente: se puede correr varias veces sin error.

-- Compras con retención de renta (servicios sin dependencia laboral, arrendamientos, etc.)
alter table compras
  add column if not exists retencion_renta numeric(14,2) not null default 0,
  add column if not exists codigo_ingreso text,
  add column if not exists cuenta_retencion_id uuid references cuentas(id) on delete set null;

alter table compras drop constraint if exists compras_retencion_renta_check;
alter table compras add constraint compras_retencion_renta_check check (retencion_renta >= 0);

-- Códigos por defecto de las columnas "Tipo de operación / Clasificación / Sector / Tipo de costo-gasto" del F14
alter table rrhh_config
  add column if not exists f14_tipo_operacion text not null default '1',
  add column if not exists f14_clasificacion text not null default '2',
  add column if not exists f14_sector text not null default '2',
  add column if not exists f14_tipo_costo text not null default '2';
