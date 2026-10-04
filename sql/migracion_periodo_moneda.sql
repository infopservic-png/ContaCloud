-- Migración: agrega periodo contable y moneda a cada empresa
-- (Ya incluido en schema.sql si partes de cero; usa este archivo solo si tu
-- base de datos fue creada ANTES de que existiera esta sección)
alter table empresas
  add column if not exists periodo_inicio date,
  add column if not exists periodo_fin date,
  add column if not exists moneda text not null default 'USD';
