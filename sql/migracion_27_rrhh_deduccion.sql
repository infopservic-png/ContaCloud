-- Migración: deducción fija anual de renta (US$1,600, Art. 29 n.° 7 LISR) para
-- asalariados con ingresos anuales <= US$9,100, aplicable en el Tramo II.
-- Idempotente: se puede correr varias veces sin error.
alter table rrhh_config
  add column if not exists deduccion_anual numeric(10,2) not null default 1600,
  add column if not exists deduccion_tope_ingresos numeric(12,2) not null default 9100;
