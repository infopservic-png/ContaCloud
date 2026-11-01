-- Migración: detalle por documento dentro de cada línea de partida (columna «Parciales» del reporte
-- de partida contable). Se llena al contabilizar por día: [{"texto":"PROVEEDOR, COMPROB. No. 123","monto":12.34}, ...]
-- Las partidas que ya existen quedan sin detalle. Se puede correr varias veces.
alter table movimientos add column if not exists detalle jsonb;
