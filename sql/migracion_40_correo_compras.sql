-- Migración 40: conexión de un buzón de correo (IMAP) para traer las compras (DTE en JSON).
-- Una conexión por empresa. La contraseña de aplicación se guarda cifrada en el servidor. Idempotente.

create table if not exists public.correo_compras (
  empresa_id uuid primary key references public.empresas(id) on delete cascade,
  host text not null default 'imap.gmail.com',
  puerto integer not null default 993,
  usuario text not null,
  clave_cifrada text not null,
  carpeta text not null default 'INBOX',
  uid_validez bigint,            -- UIDVALIDITY de la carpeta (si cambia, se vuelve a empezar)
  ultimo_uid bigint,             -- último correo ya revisado
  ultima_revision timestamptz,
  actualizado_por text,
  updated_at timestamptz not null default now()
);

alter table public.correo_compras enable row level security;

drop policy if exists "correo_compras: acceso completo" on public.correo_compras;
create policy "correo_compras: acceso completo" on public.correo_compras
  for all using (public.puede_empresa(empresa_id, 'completo'))
  with check (public.puede_empresa(empresa_id, 'completo'));

select public.aplicar_politicas_licencia();
