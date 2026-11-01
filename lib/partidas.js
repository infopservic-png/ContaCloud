// Tipos de partida (como el sistema contable de referencia) y su numeración por tipo.
import { supabase } from "@/lib/supabaseClient";

export const TIPOS_PARTIDA = [
  { id: "diario", label: "Diario", prefijo: "D" },
  { id: "egreso", label: "Egreso", prefijo: "E" },
  { id: "ingreso", label: "Ingresos", prefijo: "I" },
  { id: "remesa", label: "Remesas", prefijo: "R" },
  { id: "transferencia", label: "Transferencias", prefijo: "T" },
];

export function tipoPartida(id) {
  return TIPOS_PARTIDA.find((t) => t.id === id) || TIPOS_PARTIDA[0];
}

// "12" para el Diario, "I-12" para Ingresos, etc.
export function etiquetaPartida(tipo, numero) {
  const t = tipoPartida(tipo);
  return t.id === "diario" || !tipo ? String(numero ?? "") : `${t.prefijo}-${numero ?? ""}`;
}

// Orden cronológico estable: fecha, luego tipo y número dentro del tipo.
export function compararPartidas(a, b) {
  const ordenTipo = (x) => TIPOS_PARTIDA.findIndex((t) => t.id === (x?.tipo || "diario"));
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
