-- Migración: firmas en partidas + datos de presentación de la empresa
-- Pega esto en Supabase > SQL Editor > New query > Run
-- (Es seguro correrlo aunque ya tengas datos; no borra nada.)

alter table transacciones add column if not exists elaborado_por text;
alter table transacciones add column if not exists revisado_por text;

alter table empresas add column if not exists moneda text
  default 'Dólares de los Estados Unidos de América (US$)';
alter table empresas add column if not exists representante_legal text;
alter table empresas add column if not exists contador text;
alter table empresas add column if not exists auditor text;
