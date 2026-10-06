-- Migración: datos fiscales completos del cliente (para Facturación DTE)
-- Según la Normativa DTE (Anexo II, sección Receptor):
--   tipo de documento (NIT o DUI), número sin guiones, NRC sin guion,
--   actividad económica (código y descripción) y nombre comercial.
-- Se puede correr varias veces sin error.

alter table clientes
  add column if not exists tipo_documento text not null default 'nit',
  add column if not exists nombre_comercial text,
  add column if not exists cod_actividad text,
  add column if not exists desc_actividad text;

alter table clientes drop constraint if exists clientes_tipo_documento_check;
alter table clientes
  add constraint clientes_tipo_documento_check check (tipo_documento in ('nit', 'dui'));

-- Limpia lo ya guardado: NIT/DUI solo dígitos; NRC solo dígitos y sin ceros a la izquierda
update clientes set nit_dui = nullif(regexp_replace(nit_dui, '\D', '', 'g'), '')
  where nit_dui is not null and nit_dui ~ '\D';
update clientes set nrc = nullif(ltrim(regexp_replace(nrc, '\D', '', 'g'), '0'), '')
  where nrc is not null and (nrc ~ '\D' or nrc ~ '^0');
