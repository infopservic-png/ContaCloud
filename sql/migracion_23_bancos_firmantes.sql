-- Migración: datos de mantenimiento de bancos — formato de cheque,
-- firmantes para la emisión de cheques y responsables de la conciliación
-- bancaria (como en el formulario clásico de "Mantenimiento de bancos").
-- Idempotente: se puede correr varias veces sin error.

alter table cuentas_bancarias
  add column if not exists formato_cheque integer not null default 1,
  add column if not exists imprimir_cheque_separado boolean not null default true,
  add column if not exists firmante_hace_nombre text,
  add column if not exists firmante_hace_cargo text,
  add column if not exists firmante_revisa_nombre text,
  add column if not exists firmante_revisa_cargo text,
  add column if not exists firmante_autoriza_nombre text,
  add column if not exists firmante_autoriza_cargo text,
  add column if not exists concilia_elabora text,
  add column if not exists concilia_revisa text,
  add column if not exists concilia_autoriza text;
