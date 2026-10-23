-- Migración: código de generación del DTE en ventas y compras.
-- Sirve para (1) no importar dos veces el mismo documento y (2) mostrarlo en los libros de IVA.
-- Se puede correr varias veces sin error.

alter table ventas add column if not exists codigo_generacion text;
alter table compras add column if not exists codigo_generacion text;

create unique index if not exists ventas_empresa_codigo_generacion_idx
  on ventas (empresa_id, codigo_generacion) where codigo_generacion is not null;
create unique index if not exists compras_empresa_codigo_generacion_idx
  on compras (empresa_id, codigo_generacion) where codigo_generacion is not null;
