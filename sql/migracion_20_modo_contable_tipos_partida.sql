-- Migración: modo de contabilización y tipos de partida.
--  * empresas.modo_contable: 'documento' (una partida por cada venta/compra, como hasta ahora)
--                            'diferida'  (las ventas y compras se cargan sin partida y luego se
--                                         contabilizan por día desde la opción «Contabilizar»)
--  * transacciones.tipo: Diario, Egreso, Ingreso, Remesa, Transferencia. La numeración es por tipo.
--  * transacciones.agrupada: true cuando la partida resume varios documentos (contabilización diaria)
--  * ventas/compras.cuenta_iva_id: cuenta de IVA elegida para ese documento (si difiere de la de la empresa)
-- Todo lo existente queda igual (modo 'documento', tipo 'diario'). Se puede correr varias veces.

alter table empresas
  add column if not exists modo_contable text not null default 'documento';
alter table empresas drop constraint if exists empresas_modo_contable_check;
alter table empresas add constraint empresas_modo_contable_check check (modo_contable in ('documento', 'diferida'));

alter table transacciones
  add column if not exists tipo text not null default 'diario',
  add column if not exists agrupada boolean not null default false;
alter table transacciones drop constraint if exists transacciones_tipo_check;
alter table transacciones add constraint transacciones_tipo_check
  check (tipo in ('diario', 'egreso', 'ingreso', 'remesa', 'transferencia'));

alter table ventas  add column if not exists cuenta_iva_id uuid references cuentas(id) on delete set null;
alter table compras add column if not exists cuenta_iva_id uuid references cuentas(id) on delete set null;

create index if not exists idx_transacciones_empresa_tipo on transacciones (empresa_id, tipo, numero_partida);
