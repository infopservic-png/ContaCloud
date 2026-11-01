-- Migración: cuentas contables predeterminadas por cliente y por proveedor.
-- Clientes:    cuenta de ingreso, cuenta de IVA (débito) y cuenta donde se recibe el pago.
-- Proveedores: cuenta de cargo (gasto/costo/inventario), cuenta de IVA crédito y cuenta con que se paga.
-- Se usan como sugerencia al registrar una venta o compra de ese cliente/proveedor y al importar DTE.
-- Se puede correr varias veces sin error.

alter table clientes
  add column if not exists cuenta_ingreso_id uuid references cuentas(id) on delete set null,
  add column if not exists cuenta_iva_id uuid references cuentas(id) on delete set null,
  add column if not exists cuenta_cobro_id uuid references cuentas(id) on delete set null;

alter table proveedores
  add column if not exists cuenta_cargo_id uuid references cuentas(id) on delete set null,
  add column if not exists cuenta_iva_id uuid references cuentas(id) on delete set null,
  add column if not exists cuenta_pago_id uuid references cuentas(id) on delete set null;
