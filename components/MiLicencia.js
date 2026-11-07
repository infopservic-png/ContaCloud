"use client";

import { useEffect, useState } from "react";
import { obtenerLicenciaActual, PLANES } from "@/lib/licencia";

// Bloque «Mi licencia» para la página de perfil
export default function MiLicencia() {
  const [estado, setEstado] = useState(null);
  useEffect(() => {
    obtenerLicenciaActual().then(setEstado).catch(() => setEstado({ error: true }));
  }, []);

  const fila = "flex justify-between py-1.5 border-b border-paperLine/60 text-sm";
  let contenido;
  if (!estado) contenido = <p className="text-sm text-inkSoft">Cargando…</p>;
  else if (estado.error) contenido = <p className="text-sm text-rust">No se pudo consultar la licencia (¿corriste la migración 32?).</p>;
  else if (estado.admin) contenido = <p className="text-sm">Cuenta de administrador: sin vencimiento.</p>;
  else if (!estado.licencia) contenido = <p className="text-sm text-rust">Esta cuenta no tiene licencia. Contacta al administrador para activarla.</p>;
  else {
    const { licencia, vigente, dias } = estado;
    const plan = PLANES.find((p) => p.valor === licencia.plan)?.etiqueta || licencia.plan;
    const situacion = licencia.estado === "suspendida" ? "Suspendida (solo lectura)" : vigente ? "Activa" : "Vencida (solo lectura)";
    contenido = (
      <div>
        <div className={fila}><span className="text-inkSoft">Plan</span><span className="font-medium">{plan}</span></div>
        <div className={fila}><span className="text-inkSoft">Estado</span><span className={"font-medium " + (vigente ? "" : "text-rust")}>{situacion}</span></div>
        <div className={fila}><span className="text-inkSoft">Vence el</span><span className="font-num">{licencia.vence_el}</span></div>
        <div className={fila}><span className="text-inkSoft">Días restantes</span><span className="font-num">{vigente ? dias : 0}</span></div>
        <div className={fila}><span className="text-inkSoft">Empresas permitidas</span><span className="font-num">{licencia.max_empresas}</span></div>
      </div>
    );
  }
  return (
    <section className="bg-[#F7F4EA] border border-paperLine rounded-sm p-6">
      <h2 className="font-display text-base font-semibold mb-3">Mi licencia</h2>
      {contenido}
      {estado && !estado.admin && estado.licencia && (
        <p className="text-xs text-inkSoft mt-3">Para renovar o cambiar de plan, contacta al administrador.</p>
      )}
    </section>
  );
}
