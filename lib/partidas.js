// Tipos de partida (como el sistema contable de referencia) y su numeración por tipo.
import { supabase } from "@/lib/supabaseClient";

export const TIPOS_PARTIDA = [
  { id: "diario", label: "Diario", prefijo: "D", sigla: "DIA" },
  { id: "egreso", label: "Egreso", prefijo: "E", sigla: "EGR" },
  { id: "ingreso", label: "Ingresos", prefijo: "I", sigla: "ING" },
  { id: "remesa", label: "Remesas", prefijo: "R", sigla: "REM" },
  { id: "transferencia", label: "Transferencias", prefijo: "T", sigla: "TRA" },
];

// Partidas que genera el sistema al cerrar un período (no se crean a mano)
export const TIPOS_SISTEMA = [
  { id: "apertura", label: "Apertura", prefijo: "A", sigla: "APE" },
  { id: "cierre", label: "Cierre", prefijo: "C", sigla: "CIE" },
];
// Orden de presentación: la apertura primero y el cierre al final
export const TODOS_TIPOS = [TIPOS_SISTEMA[0], ...TIPOS_PARTIDA, TIPOS_SISTEMA[1]];

export function tipoPartida(id) {
  return TODOS_TIPOS.find((t) => t.id === id) || TIPOS_PARTIDA[0];
}

// "12" para el Diario, "I-12" para Ingresos, etc.
export function etiquetaPartida(tipo, numero) {
  const t = tipoPartida(tipo);
  return t.id === "diario" || !tipo ? String(numero ?? "") : `${t.prefijo}-${numero ?? ""}`;
}

// Orden cronológico estable: fecha, luego tipo y número dentro del tipo.
export function compararPartidas(a, b) {
  const ordenTipo = (x) => TODOS_TIPOS.findIndex((t) => t.id === (x?.tipo || "diario"));
  return (
    String(a?.fecha ?? "").localeCompare(String(b?.fecha ?? "")) ||
    ordenTipo(a) - ordenTipo(b) ||
    (a?.numero_partida ?? 0) - (b?.numero_partida ?? 0)
  );
}

// Siguiente número libre dentro de un tipo de partida.
export async function siguienteNumeroPartida(empresaId, tipo = "diario") {
  const { data } = await supabase
    .from("transacciones")
    .select("numero_partida")
    .eq("empresa_id", empresaId)
    .eq("tipo", tipo)
    .order("numero_partida", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.numero_partida || 0) + 1;
}

// "DIA-0024", "ING-0007": número de partida como lo muestra el reporte de partida contable.
export function numeroReportePartida(tipo, numero) {
  return `${tipoPartida(tipo).sigla}-${String(numero ?? 0).padStart(4, "0")}`;
}

// Agrupa las líneas de una partida por cuenta de mayor (4 primeros dígitos del código),
// respetando el orden de aparición: primero lo que va al Debe y luego lo del Haber.
export function agruparPorMayor(movimientos, nombreMayor) {
  const orden = [...movimientos].sort((a, b) => (Number(b.debe) > 0) - (Number(a.debe) > 0));
  const grupos = new Map();
  for (const m of orden) {
    const codigo = String(m.cuentas?.codigo || "");
    const cod4 = codigo.slice(0, 4);
    if (!grupos.has(cod4)) {
      grupos.set(cod4, { codigo: cod4, nombre: nombreMayor?.(cod4) || m.cuentas?.nombre || cod4, debe: 0, haber: 0, subcuentas: [] });
    }
    const g = grupos.get(cod4);
    g.debe += Number(m.debe) || 0;
    g.haber += Number(m.haber) || 0;
    g.subcuentas.push({
      codigo,
      nombre: m.cuentas?.nombre || "",
      monto: (Number(m.debe) || 0) + (Number(m.haber) || 0),
      detalle: Array.isArray(m.detalle) ? m.detalle : [],
    });
  }
  return [...grupos.values()];
}
