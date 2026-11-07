-- Migración: baja y venta de activo fijo. Idempotente: se puede correr varias veces.

alter table activos_fijos
  add column if not exists fecha_baja date,
  add column if not exists tipo_baja text check (tipo_baja in ('venta', 'baja')),
  add column if not exists precio_venta numeric(14,2),
  add column if not exists baja_transaccion_id uuid references transacciones(id) on delete set null;

-- Si se elimina desde el Libro diario la partida de la baja, el activo vuelve a estar activo
-- (sus depreciaciones ligadas a esa partida ya se eliminan solas por "on delete cascade").
create or replace function activo_fijo_revertir_baja() returns trigger as $$
begin
  update activos_fijos
     set estado = 'activo', fecha_baja = null, tipo_baja = null, precio_venta = null, baja_transaccion_id = null
   where baja_transaccion_id = old.id;
  return old;
end;
$$ language plpgsql;

drop trigger if exists trg_activo_fijo_revertir_baja on transacciones;
create trigger trg_activo_fijo_revertir_baja
  before delete on transacciones
  for each row execute function activo_fijo_revertir_baja();
