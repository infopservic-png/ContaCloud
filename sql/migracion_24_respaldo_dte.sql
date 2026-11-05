-- Migración: guarda el JSON original del DTE importado en ventas y compras,
-- para poder generar el PDF de respaldo y adjuntarlo a la partida del día.
-- Idempotente: se puede correr varias veces sin error.

alter table ventas add column if not exists json_dte jsonb;
alter table compras add column if not exists json_dte jsonb;
