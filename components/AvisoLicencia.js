"use client";

import { useEffect, useState } from "react";
import { obtenerLicenciaActual } from "@/lib/licencia";

// Franja que avisa del estado de la licencia: prueba, por vencer, vencida o suspendida.
export default function AvisoLicencia() {
  const [estado, setEstado] = useState(null);
  useEffect(() => {
    obtenerLicenciaActual().then(setEstado).catch(() => {});
  }, []);
  if (!estado || estado.admin) return null;
  const { licencia, vigente, dias } = estado;

  let texto = null;
  let rojo = false;
  if (!licencia) {
    texto = "Tu cuenta no tiene licencia. Puedes consultar tus datos, pero no registrar nada. Contacta al administrador para activarla.";
    rojo = true;
  } else if (licencia.estado === "suspendida") {
    texto = "Tu licencia está suspendida: tus datos están en modo solo lectura. Contacta al administrador.";
    rojo = true;
  } else if (!vigente) {
    texto = "Tu licencia venció: puedes ver y exportar tus datos, pero no registrar ni modificar nada hasta renovarla.";
    rojo = true;
  } else if (licencia.plan === "prueba") {
    texto = `Prueba gratuita: te quedan ${dias} ${dias === 1 ? "día" : "días"} (vence el ${licencia.vence_el}).`;
    rojo = dias <= 3;
  } else if (dias <= 15) {
    texto = `Tu licencia vence en ${dias} ${dias === 1 ? "día" : "días"} (${licencia.vence_el}). Renuévala para no perder la edición.`;
  }
  if (!texto) return null;
  return (
    <div className={"no-print mb-4 border rounded-sm px-4 py-2 text-sm " + (rojo ? "bg-rust/10 border-rust/40 text-rust" : "bg-accent/10 border-accent/40")}>
      {texto}
    </div>
  );
}
