-- Migración: enlaza cada DTE con la venta que lo originó (inventario y costo)
-- y permite que el consecutivo del Número de Control reinicie cada año.
-- Al eliminar la venta (por ejemplo desde Ventas), se elimina también su DTE
-- mientras no esté firmado ni transmitido.
-- Se puede correr varias veces sin error.

alter table documentos_dte
  add column if not exists venta_id uuid references ventas(id) on delete cascade;

-- La normativa reinicia el consecutivo en 000000000000001 con el primer DTE de
-- cada ejercicio (año), así que el mismo Número de Control puede repetirse en
-- años distintos: la unicidad pasa a ser por empresa, número y año.
alter table documentos_dte
  drop constraint if exists documentos_dte_empresa_id_numero_control_key;

create unique index if not exists documentos_dte_numero_control_anio_idx
  on documentos_dte (empresa_id, numero_control, (extract(year from fecha_emision)::int));
