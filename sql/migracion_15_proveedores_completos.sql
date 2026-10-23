-- Migración: ficha completa del proveedor (misma idea que la del cliente, migración 14)
--  * datos fiscales (NIT/DUI, NRC, actividad económica, dirección por catálogo), código, tipo de persona,
--    nombre en Hacienda, giro, contactos, móvil, representante legal, límite y días de crédito, retención, notas.
--  * tipo de operación (gravada, exenta, no sujeta) y clasificación (costo o gasto) para el libro de compras.
--  * ambiente: 'real' o 'practica' (los ya existentes quedan como práctica).
-- Se puede correr varias veces sin error.

alter table proveedores
  add column if not exists codigo text,
  add column if not exists tipo_persona text not null default 'juridica',
  add column if not exists nombre_hacienda text,
  add column if not exists nombre_comercial text,
  add column if not exists tipo_documento text not null default 'nit',
  add column if not exists nit_dui text,
  add column if not exists nrc text,
  add column if not exists giro text,
  add column if not exists cod_actividad text,
  add column if not exists desc_actividad text,
  add column if not exists cod_departamento text,
  add column if not exists cod_municipio text,
  add column if not exists cod_distrito text,
  add column if not exists contactos text,
  add column if not exists movil text,
  add column if not exists representante_legal text,
  add column if not exists limite_credito numeric(14,2) not null default 0,
  add column if not exists modalidad_pago text not null default 'contado',
  add column if not exists dias_credito integer,
  add column if not exists aplica_retencion boolean not null default false,
  add column if not exists tipo_operacion text not null default 'gravada',
  add column if not exists clasificacion text not null default 'gasto',
  add column if not exists notas text,
  add column if not exists ambiente text not null default 'practica';

alter table proveedores drop constraint if exists proveedores_tipo_persona_check;
alter table proveedores add constraint proveedores_tipo_persona_check check (tipo_persona in ('natural', 'juridica'));
alter table proveedores drop constraint if exists proveedores_tipo_documento_check;
alter table proveedores add constraint proveedores_tipo_documento_check check (tipo_documento in ('nit', 'dui'));
alter table proveedores drop constraint if exists proveedores_modalidad_pago_check;
alter table proveedores add constraint proveedores_modalidad_pago_check check (modalidad_pago in ('contado', 'credito'));
alter table proveedores drop constraint if exists proveedores_ambiente_check;
alter table proveedores add constraint proveedores_ambiente_check check (ambiente in ('real', 'practica'));
alter table proveedores drop constraint if exists proveedores_tipo_operacion_check;
alter table proveedores add constraint proveedores_tipo_operacion_check check (tipo_operacion in ('gravada', 'exenta', 'no_sujeta'));
alter table proveedores drop constraint if exists proveedores_clasificacion_check;
alter table proveedores add constraint proveedores_clasificacion_check check (clasificacion in ('costo', 'gasto'));
alter table proveedores drop constraint if exists proveedores_limite_credito_check;
alter table proveedores add constraint proveedores_limite_credito_check check (limite_credito >= 0);
alter table proveedores drop constraint if exists proveedores_dias_credito_check;
alter table proveedores add constraint proveedores_dias_credito_check check (dias_credito is null or (dias_credito >= 0 and dias_credito <= 365));

create unique index if not exists proveedores_empresa_codigo_idx
  on proveedores (empresa_id, codigo) where codigo is not null;
