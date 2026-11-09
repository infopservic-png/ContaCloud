-- Migración 34: bitácora de acciones (quién creó, editó o eliminó, y cuándo).
-- Se llena sola con triggers en la base de datos, así que registra todo sin importar desde dónde se haga el cambio.
-- Es idempotente: se puede correr más de una vez.

create table if not exists public.bitacora (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  empresa_id uuid,
  user_id uuid,
  email text,
  tabla text not null,
  accion text not null check (accion in ('crear', 'editar', 'eliminar')),
  registro_id text,
  resumen text,
  cambios text
);
create index if not exists bitacora_empresa_fecha_idx on public.bitacora (empresa_id, created_at desc);

alter table public.bitacora enable row level security;
drop policy if exists "bitacora: dueño de la empresa lee" on public.bitacora;
create policy "bitacora: dueño de la empresa lee" on public.bitacora
  for select using (exists (select 1 from public.empresas e where e.id = bitacora.empresa_id and e.user_id = auth.uid()));
drop policy if exists "bitacora: admin lee todo" on public.bitacora;
create policy "bitacora: admin lee todo" on public.bitacora for select using (is_admin());
-- Sin políticas de insert/update/delete: nadie puede alterar la bitácora desde la aplicación.
revoke insert, update, delete on public.bitacora from anon, authenticated;

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

do $$
declare t text;
begin
  foreach t in array array['transacciones', 'ventas', 'compras', 'devoluciones', 'documentos_dte', 'cuentas', 'clientes', 'proveedores', 'productos', 'empresas']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists bitacora_%1$s on public.%1$s', t);
      execute format('create trigger bitacora_%1$s after insert or update or delete on public.%1$s for each row execute function public.registrar_bitacora()', t);
    end if;
  end loop;
end $$;
