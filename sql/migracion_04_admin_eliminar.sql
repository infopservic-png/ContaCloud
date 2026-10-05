-- Migración: permite al administrador ELIMINAR empresas de cualquier usuario
-- (antes solo podía leerlas). Pega esto en Supabase > SQL Editor > New query > Run.

create policy "empresas: admin elimina" on empresas
  for delete using (is_admin());

create policy "cuentas: admin elimina" on cuentas
  for delete using (is_admin());

create policy "transacciones: admin elimina" on transacciones
  for delete using (is_admin());

create policy "movimientos: admin elimina" on movimientos
  for delete using (is_admin());
