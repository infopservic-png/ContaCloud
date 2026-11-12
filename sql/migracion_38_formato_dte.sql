-- Migración 38: personalización del PDF de la factura electrónica (logo, color, pie y notas).
-- Idempotente.
alter table public.empresas add column if not exists dte_logo text;   -- imagen en data URL (PNG/JPG), reducida en el navegador
alter table public.empresas add column if not exists dte_color text;  -- color principal, formato #RRGGBB
alter table public.empresas add column if not exists dte_pie text;    -- texto del pie de página
alter table public.empresas add column if not exists dte_notas text;  -- datos de pago / observaciones (cuentas bancarias, condiciones)
