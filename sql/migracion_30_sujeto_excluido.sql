-- Compras a sujetos excluidos (factura de sujeto excluido, DTE 14) para la casilla 66 del F-07.
alter table public.compras
  add column if not exists sujeto_excluido boolean not null default false,
  add column if not exists retencion_iva numeric(14,2) not null default 0;

-- Factura de sujeto excluido (DTE 14) emitida desde Facturación: queda enlazada a la compra que registra.
alter table public.documentos_dte
  add column if not exists compra_id uuid references public.compras(id) on delete cascade;
