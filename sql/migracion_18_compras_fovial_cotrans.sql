-- Migración: monto de FOVIAL y COTRANS de cada compra (combustibles).
-- Se muestra en una columna aparte del Libro de compras; no da crédito fiscal.
-- Se puede correr varias veces sin error.

alter table compras add column if not exists fovial_cotrans numeric(14,2) not null default 0;
alter table compras drop constraint if exists compras_fovial_cotrans_check;
alter table compras add constraint compras_fovial_cotrans_check check (fovial_cotrans >= 0);
