-- Migración: actividad económica y dirección por catálogo (Hacienda)
--  * Clientes (receptor): departamento, municipio y distrito por código (CAT-012, CAT-013, CAT-008).
--  * Empresas (emisor): actividad económica (CAT-019) y departamento, municipio y distrito por código.
-- La "dirección complementaria" sigue en la columna direccion de cada tabla.
-- Se puede correr varias veces sin error.

alter table clientes
  add column if not exists cod_departamento text,
  add column if not exists cod_municipio text,
  add column if not exists cod_distrito text;

alter table empresas
  add column if not exists cod_actividad text,
  add column if not exists desc_actividad text,
  add column if not exists cod_departamento text,
  add column if not exists cod_municipio text,
  add column if not exists cod_distrito text;
