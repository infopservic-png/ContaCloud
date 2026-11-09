-- Migración 36: períodos contables (ejercicios), cierre y apertura.
-- Cada empresa tiene uno o más períodos (normalmente 1 de enero al 31 de diciembre). Al cerrar un período:
--   * se generan las partidas de cierre (resultado → Pérdidas y ganancias → Utilidades acumuladas),
--   * se genera la partida de apertura del período siguiente con los saldos,
--   * el período queda bloqueado: no se pueden crear, editar ni eliminar partidas con fechas dentro de él.
-- Es idempotente: se puede correr más de una vez.

create table if not exists public.periodos_contables (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nombre text not null,
  fecha_inicio date not null,
  fecha_fin date not null,
  estado text not null default 'abierto' check (estado in ('abierto', 'cerrado')),
  cuenta_pyg_id uuid references public.cuentas(id) on delete set null,
  cuenta_acumuladas_id uuid references public.cuentas(id) on delete set null,
  cuenta_perdidas_id uuid references public.cuentas(id) on delete set null,
  cierre_transaccion_ids uuid[] not null default '{}',
  apertura_transaccion_id uuid,
  resultado numeric(14,2),
  cerrado_el timestamptz,
  cerrado_por text,
  created_at timestamptz not null default now(),
  check (fecha_fin >= fecha_inicio),
  unique (empresa_id, fecha_inicio)
);
create index if not exists periodos_contables_empresa_idx on public.periodos_contables (empresa_id, fecha_inicio);

alter table public.periodos_contables enable row level security;
drop policy if exists "periodos: ver" on public.periodos_contables;
create policy "periodos: ver" on public.periodos_contables for select using (public.puede_empresa(empresa_id, 'ver'));
drop policy if exists "periodos: crear" on public.periodos_contables;
create policy "periodos: crear" on public.periodos_contables for insert with check (public.puede_empresa(empresa_id, 'completo'));
drop policy if exists "periodos: modificar" on public.periodos_contables;
create policy "periodos: modificar" on public.periodos_contables for update
  using (public.puede_empresa(empresa_id, 'completo')) with check (public.puede_empresa(empresa_id, 'completo'));
drop policy if exists "periodos: eliminar" on public.periodos_contables;
create policy "periodos: eliminar" on public.periodos_contables for delete using (public.puede_empresa(empresa_id, 'completo'));
drop policy if exists "periodos: admin lee todo" on public.periodos_contables;
create policy "periodos: admin lee todo" on public.periodos_contables for select using (is_admin());

alter table public.periodos_contables add column if not exists cuenta_perdidas_id uuid references public.cuentas(id) on delete set null;

-- Nuevos tipos de partida generados por el cierre
alter table public.transacciones drop constraint if exists transacciones_tipo_check;
alter table public.transacciones add constraint transacciones_tipo_check
  check (tipo in ('diario', 'egreso', 'ingreso', 'remesa', 'transferencia', 'cierre', 'apertura'));

-- Bloqueo: nada se puede crear, modificar ni eliminar con fecha dentro de un período cerrado
create or replace function public.periodo_cerrado(eid uuid, f date)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select p.nombre from public.periodos_contables p
  where p.empresa_id = eid and p.estado = 'cerrado' and f between p.fecha_inicio and p.fecha_fin
  limit 1;
$$;

create or replace function public.bloquear_periodo_transacciones() returns trigger
language plpgsql security definer set search_path = public as $$
declare nombre text;
begin
  -- Si se está eliminando la empresa completa, no hay nada que proteger
  if tg_op = 'DELETE' and not exists (select 1 from public.empresas e where e.id = old.empresa_id) then
    return old;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    nombre := public.periodo_cerrado(old.empresa_id, old.fecha);
    if nombre is not null then
      raise exception 'El período contable % está cerrado: no se puede modificar ni eliminar esta partida. Reabre el período si necesitas corregirla.', nombre using errcode = 'P0001';
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    nombre := public.periodo_cerrado(new.empresa_id, new.fecha);
    if nombre is not null then
      raise exception 'El período contable % está cerrado: no se pueden registrar partidas con esa fecha.', nombre using errcode = 'P0001';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.bloquear_periodo_movimientos() returns trigger
language plpgsql security definer set search_path = public as $$
declare t record; nombre text; tid uuid;
begin
  for tid in select x from unnest(array[case when tg_op <> 'INSERT' then old.transaccion_id end, case when tg_op <> 'DELETE' then new.transaccion_id end]) x where x is not null
  loop
    select empresa_id, fecha into t from public.transacciones where id = tid;
    if found then
      nombre := public.periodo_cerrado(t.empresa_id, t.fecha);
      if nombre is not null then
        raise exception 'El período contable % está cerrado: no se pueden modificar sus movimientos. Reabre el período si necesitas corregirlo.', nombre using errcode = 'P0001';
      end if;
    end if;
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists bloqueo_periodo_transacciones on public.transacciones;
create trigger bloqueo_periodo_transacciones before insert or update or delete on public.transacciones
  for each row execute function public.bloquear_periodo_transacciones();
drop trigger if exists bloqueo_periodo_movimientos on public.movimientos;
create trigger bloqueo_periodo_movimientos before insert or update or delete on public.movimientos
  for each row execute function public.bloquear_periodo_movimientos();

-- Los cambios de períodos quedan en la bitácora
drop trigger if exists bitacora_periodos_contables on public.periodos_contables;
create trigger bitacora_periodos_contables after insert or update or delete on public.periodos_contables
  for each row execute function public.registrar_bitacora();

-- Eliminar una empresa: borra sus datos en el orden correcto (varias relaciones son RESTRICT y fallaban al eliminar
-- empresas con partidas), sin que el bloqueo de períodos cerrados lo impida y sin llenar la bitácora de borrados.
create or replace function public.limpiar_empresa_antes_de_borrar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.borrando_empresa', '1', true);
  delete from public.periodos_contables where empresa_id = old.id;
  delete from public.planilla_lineas where empresa_id = old.id;
  delete from public.planillas where empresa_id = old.id;
  delete from public.empleados where empresa_id = old.id;
  delete from public.rrhh_config where empresa_id = old.id;
  delete from public.depreciaciones where empresa_id = old.id;
  delete from public.activos_fijos where empresa_id = old.id;
  delete from public.documentos_dte where empresa_id = old.id;
  delete from public.bancos_transacciones where empresa_id = old.id;
  delete from public.movimientos_banco_estado where cuenta_bancaria_id in (select id from public.cuentas_bancarias where empresa_id = old.id);
  delete from public.cuentas_bancarias where empresa_id = old.id;
  delete from public.abonos_cxp where factura_id in (select id from public.facturas_cxp where empresa_id = old.id);
  delete from public.facturas_cxp where empresa_id = old.id;
  delete from public.abonos_cxc where factura_id in (select id from public.facturas_cxc where empresa_id = old.id);
  delete from public.facturas_cxc where empresa_id = old.id;
  delete from public.kardex_movimientos where producto_id in (select id from public.productos where empresa_id = old.id);
  delete from public.devolucion_lineas where devolucion_id in (select id from public.devoluciones where empresa_id = old.id);
  delete from public.devoluciones where empresa_id = old.id;
  delete from public.compra_lineas where compra_id in (select id from public.compras where empresa_id = old.id);
  delete from public.venta_lineas where venta_id in (select id from public.ventas where empresa_id = old.id);
  delete from public.compras where empresa_id = old.id;
  delete from public.ventas where empresa_id = old.id;
  delete from public.proveedores where empresa_id = old.id;
  delete from public.clientes where empresa_id = old.id;
  delete from public.productos where empresa_id = old.id;
  delete from public.movimientos where transaccion_id in (select id from public.transacciones where empresa_id = old.id);
  delete from public.transacciones where empresa_id = old.id;
  return old;
end;
$$;
drop trigger if exists limpiar_antes_de_borrar_empresa on public.empresas;
create trigger limpiar_antes_de_borrar_empresa before delete on public.empresas
  for each row execute function public.limpiar_empresa_antes_de_borrar();

-- La bitácora no registra los borrados masivos de una empresa que se elimina
create or replace function public.registrar_bitacora() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  fila jsonb;
  anterior jsonb;
  acc text;
  emp text;
  resumen text;
  cambiadas text;
begin
  if coalesce(current_setting('app.borrando_empresa', true), '') = '1' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  begin
    if tg_op = 'DELETE' then
      fila := to_jsonb(old); acc := 'eliminar';
    elsif tg_op = 'INSERT' then
      fila := to_jsonb(new); acc := 'crear';
    else
      fila := to_jsonb(new); anterior := to_jsonb(old); acc := 'editar';
      select string_agg(k, ', ' order by k) into cambiadas
      from jsonb_object_keys(fila) k
      where k not in ('updated_at', 'created_at') and (fila -> k) is distinct from (anterior -> k);
      if cambiadas is null then return new; end if; -- sin cambios reales
    end if;

    emp := coalesce(fila ->> 'empresa_id', case when tg_table_name = 'empresas' then fila ->> 'id' end);
    resumen := concat_ws(' · ',
      case when fila ->> 'numero_partida' is not null then 'Partida ' || (fila ->> 'numero_partida') end,
      fila ->> 'numero_documento', fila ->> 'numero_control', fila ->> 'codigo',
      fila ->> 'nombre', fila ->> 'email', fila ->> 'rol', fila ->> 'descripcion', fila ->> 'fecha',
      case when fila ->> 'total' is not null then 'Total ' || (fila ->> 'total') end
    );

    insert into public.bitacora (empresa_id, user_id, email, tabla, accion, registro_id, resumen, cambios)
    values (emp::uuid, auth.uid(), nullif(auth.jwt() ->> 'email', ''), tg_table_name, acc, fila ->> 'id', left(resumen, 300), cambiadas);
  exception when others then
    null; -- la bitácora nunca debe impedir la operación
  end;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- Períodos iniciales: uno por cada año en que la empresa ya tiene partidas (todos abiertos),
-- y el año actual para las empresas sin partidas.
insert into public.periodos_contables (empresa_id, nombre, fecha_inicio, fecha_fin)
select distinct t.empresa_id, extract(year from t.fecha)::int::text,
       make_date(extract(year from t.fecha)::int, 1, 1), make_date(extract(year from t.fecha)::int, 12, 31)
from public.transacciones t
on conflict (empresa_id, fecha_inicio) do nothing;
insert into public.periodos_contables (empresa_id, nombre, fecha_inicio, fecha_fin)
select e.id, extract(year from current_date)::int::text,
       make_date(extract(year from current_date)::int, 1, 1), make_date(extract(year from current_date)::int, 12, 31)
from public.empresas e
where not exists (select 1 from public.periodos_contables p where p.empresa_id = e.id)
on conflict (empresa_id, fecha_inicio) do nothing;

select public.aplicar_politicas_licencia();
