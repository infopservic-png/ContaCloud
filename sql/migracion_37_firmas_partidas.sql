-- Migración 37: nombres por defecto de las firmas de las partidas (Elaborado, Revisado y Autorizado por).
-- Idempotente.
alter table public.empresas add column if not exists firma_elaborado text;
alter table public.empresas add column if not exists firma_revisado text;
alter table public.empresas add column if not exists firma_autorizado text;
