-- Migración: NIT/DUI y NRC en clientes (para elegir el receptor en Facturación DTE)
-- Se puede correr varias veces sin error.
alter table clientes add column if not exists nit_dui text;
alter table clientes add column if not exists nrc text;
