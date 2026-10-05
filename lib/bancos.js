import { supabase } from "@/lib/supabaseClient";

export async function obtenerCuentasBancarias(empresaId) {
  const { data, error } = await supabase
    .from("cuentas_bancarias")
    .select("*, cuenta_contable:cuenta_contable_id ( codigo, nombre )")
    .eq("empresa_id", empresaId)
    .order("nombre");
  if (error) throw error;
  return data || [];
}

// Movimientos "según libros": todo lo que ya se contabilizó en la cuenta
// contable ligada a esta cuenta bancaria, venga de donde venga (partidas,
// kardex, cuentas por cobrar/pagar).
export async function obtenerMovimientosLibros(cuentaContableId) {
  const { data, error } = await supabase
    .from("movimientos")
    .select("id, debe, haber, conciliado, transacciones ( fecha, descripcion, numero_partida )")
    .eq("cuenta_id", cuentaContableId);
  if (error) throw error;
  return (data || []).sort(
    (a, b) => (a.transacciones?.numero_partida ?? 0) - (b.transacciones?.numero_partida ?? 0)
  );
}

export async function obtenerMovimientosBanco(cuentaBancariaId) {
  const { data, error } = await supabase
    .from("movimientos_banco_estado")
    .select("*")
    .eq("cuenta_bancaria_id", cuentaBancariaId)
    .order("fecha");
  if (error) throw error;
  return data || [];
}
