-- Migración: tipo de operación y tipo de ingreso del cliente.
-- Se guardan con el mismo número que usa la ficha de un sistema contable comercial:
--   Tipo de operación: 0 Ninguno, 1 Gravada, 2 No gravada o exento, 3 Excluido o no constituye renta, 4 Mixta
--   Tipo de ingreso:   0 Ninguno, 1 Profesiones, artes y oficios, 2 Actividades de servicios,
--                      3 Actividades comerciales, 4 Actividades industriales, 5 Actividades agropecuarias,
--                      6 Utilidades y dividendos (se pueden agregar más números sin cambiar la tabla)
-- Los clientes ya creados quedan en 0 (Ninguno). Se puede correr varias veces sin error.

alter table clientes
  add column if not exists tipo_operacion text not null default '0',
  add column if not exists tipo_ingreso text not null default '0';

-- Por si se corrió una versión anterior de esta migración con otros valores
alter table clientes drop constraint if exists clientes_tipo_operacion_check;
alter table clientes drop constraint if exists clientes_tipo_ingreso_check;
update clientes set tipo_operacion = '0' where tipo_operacion !~ '^[0-9]{1,2}$';
update clientes set tipo_ingreso = '0' where tipo_ingreso !~ '^[0-9]{1,2}$';
alter table clientes add constraint clientes_tipo_operacion_check check (tipo_operacion ~ '^[0-9]{1,2}$');
alter table clientes add constraint clientes_tipo_ingreso_check check (tipo_ingreso ~ '^[0-9]{1,2}$');
