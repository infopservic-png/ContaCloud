-- Migración 41: DUI de la empresa (persona natural). Una persona natural puede tener DUI y NIT;
-- los documentos pueden salir a nombre de cualquiera de los dos. Idempotente.
alter table public.empresas add column if not exists dui text;
