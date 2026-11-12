-- Migración 39: transmisión de DTE a Hacienda desde ContaCloud (firma + recepción).
-- Credenciales por empresa (cifradas en el servidor) y datos de la respuesta de Hacienda en cada documento.
-- Idempotente.

create table if not exists public.dte_credenciales (
  empresa_id uuid primary key references public.empresas(id) on delete cascade,
  ambiente text not null default '00' check (ambiente in ('00', '01')),  -- 00 pruebas, 01 producción
  usuario_api text,                 -- NIT del contribuyente (usuario de la API de Hacienda)
  clave_api_cifrada text,           -- AES-256-GCM con la clave del servidor
  certificado_cifrado text,         -- archivo del certificado de firma, cifrado
  clave_certificado_cifrada text,   -- contraseña del certificado, cifrada
  actualizado_por text,
  updated_at timestamptz not null default now()
);

alter table public.dte_credenciales enable row level security;

drop policy if exists "dte_credenciales: acceso completo" on public.dte_credenciales;
create policy "dte_credenciales: acceso completo" on public.dte_credenciales
  for all using (public.puede_empresa(empresa_id, 'completo'))
  with check (public.puede_empresa(empresa_id, 'completo'));

alter table public.documentos_dte add column if not exists sello_recibido text;
alter table public.documentos_dte add column if not exists fecha_procesamiento timestamptz;
alter table public.documentos_dte add column if not exists respuesta_mh jsonb;
alter table public.documentos_dte add column if not exists dte_firmado text;  -- JWS enviado a Hacienda
alter table public.documentos_dte add column if not exists ambiente text;

select public.aplicar_politicas_licencia();
