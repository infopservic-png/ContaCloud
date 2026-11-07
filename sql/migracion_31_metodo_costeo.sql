-- Método de costeo del inventario por empresa: costo promedio ponderado (por defecto) o PEPS.
alter table public.empresas
  add column if not exists metodo_costeo text not null default 'promedio';
alter table public.empresas drop constraint if exists empresas_metodo_costeo_check;
alter table public.empresas add constraint empresas_metodo_costeo_check check (metodo_costeo in ('promedio', 'peps'));
