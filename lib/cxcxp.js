import { supabase } from "@/lib/supabaseClient";

// Configuración según el módulo (cobrar = Cuentas por Cobrar, pagar = Cuentas por Pagar).
// Ambos módulos funcionan igual, solo cambian las tablas y la dirección contable.
export function configCxCxP(tipo) {
  if (tipo === "cobrar") {
    return {
      tipo,
      tablaEntidad: "clientes",
      tablaFacturas: "facturas_cxc",
      tablaAbonos: "abonos_cxc",
      campoEntidadId: "cliente_id",
      campoCuentaControl: "cuenta_cxc_id",
      labelEntidad: "Cliente",
      labelEntidadPlural: "Clientes",
      labelModulo: "Cuentas por Cobrar",
      labelCuentaControl: "Cuenta de Cuentas por Cobrar",
      labelCuentaContraFactura: "Cuenta de Ingreso (Ventas)",
      labelCuentaContraAbono: "¿Dónde se recibió el pago?",
    };
  }
  return {
    tipo,
    tablaEntidad: "proveedores",
    tablaFacturas: "facturas_cxp",
    tablaAbonos: "abonos_cxp",
    campoEntidadId: "proveedor_id",
    campoCuentaControl: "cuenta_cxp_id",
    labelEntidad: "Proveedor",
    labelEntidadPlural: "Proveedores",
    labelModulo: "Cuentas por Pagar",
    labelCuentaControl: "Cuenta de Cuentas por Pagar",
    labelCuentaContraFactura: "Cuenta de Gasto o Compra",
    labelCuentaContraAbono: "¿Con qué se pagó?",
  };
}

export async function obtenerEntidades(cfg, empresaId) {
  const { data, error } = await supabase
    .from(cfg.tablaEntidad)
    .select("*")
    .eq("empresa_id", empresaId)
    .order("nombre");
  if (error) throw error;
  return data || [];
}

export async function obtenerFacturas(cfg, empresaId) {
  const { data, error } = await supabase
    .from(cfg.tablaFacturas)
    .select(`*, entidad:${cfg.campoEntidadId} ( nombre )`)
    .eq("empresa_id", empresaId)
    .order("fecha", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function obtenerAbonos(cfg, facturaId) {
  const { data, error } = await supabase
    .from(cfg.tablaAbonos)
    .select("*")
    .eq("factura_id", facturaId)
    .order("fecha");
  if (error) throw error;
  return data || [];
}

export function estadoFactura(factura) {
  const hoy = new Date().toISOString().slice(0, 10);
  if (Number(factura.saldo_pendiente) <= 0.005) return "pagada";
  if (factura.fecha_vencimiento && factura.fecha_vencimiento < hoy) return "vencida";
  if (Number(factura.saldo_pendiente) < Number(factura.monto)) return "parcial";
  return "pendiente";
}
