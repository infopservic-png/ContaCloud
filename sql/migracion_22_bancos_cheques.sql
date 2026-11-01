-- Migración: módulo de Bancos (cuentas bancarias completas, cheques y transacciones bancarias).
-- Cada cheque / depósito / nota / transferencia genera su partida contable y queda registrado aquí.
-- Se puede correr varias veces sin error.

alter table cuentas_bancarias
  add column if not exists banco text,
  add column if not exists tipo_cuenta text not null default 'corriente',
  add column if not exists siguiente_cheque integer not null default 1,
  add column if not exists activa boolean not null default true;

create table if not exists bancos_transacciones (
  id uuid primary key default uuid_generate_v4(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  cuenta_bancaria_id uuid not null references cuentas_bancarias(id) on delete cascade,
  tipo text not null check (tipo in ('cheque', 'deposito', 'nota_cargo', 'nota_abono', 'transferencia')),
  fecha date not null,
  numero text,
  beneficiario text,
  concepto text,
  monto numeric(14,2) not null check (monto > 0),
  cuenta_contraria_id uuid references cuentas(id) on delete restrict,
  estado text not null default 'emitido' check (estado in ('emitido', 'anulado')),
  transaccion_id uuid references transacciones(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_bancos_tx_cuenta on bancos_transacciones (cuenta_bancaria_id, fecha);
create index if not exists idx_bancos_tx_empresa on bancos_transacciones (empresa_id);

alter table bancos_transacciones enable row level security;
drop policy if exists "bancos_transacciones: por empresa propia" on bancos_transacciones;
create policy "bancos_transacciones: por empresa propia" on bancos_transacciones
  for all using (exists (select 1 from empresas e where e.id = bancos_transacciones.empresa_id and e.user_id = auth.uid()))
  with check (exists (select 1 from empresas e where e.id = bancos_transacciones.empresa_id and e.user_id = auth.uid()));
drop policy if exists "bancos_transacciones: admin lee todo" on bancos_transacciones;
create policy "bancos_transacciones: admin lee todo" on bancos_transacciones for select using (is_admin());
drop policy if exists "bancos_transacciones: admin elimina" on bancos_transacciones;
create policy "bancos_transacciones: admin elimina" on bancos_transacciones for delete using (is_admin());
