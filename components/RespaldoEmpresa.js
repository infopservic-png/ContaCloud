"use client";

import { useRef, useState } from "react";
import { exportarRespaldo, restaurarRespaldo, resumenRespaldo } from "@/lib/respaldo";

const btn = "bg-brand text-onBrand px-4 py-2 rounded-sm text-sm font-medium hover:bg-brandDark disabled:opacity-60";

export function DescargarRespaldo({ empresa }) {
  const [progreso, setProgreso] = useState(null);
  const [error, setError] = useState(null);
  const [hecho, setHecho] = useState(null);

  async function descargar() {
    setError(null);
    setHecho(null);
    try {
      const r = await exportarRespaldo(empresa.id, (n, total, tabla) => setProgreso(`Leyendo ${tabla || "…"} (${n}/${total})`));
      const blob = new Blob([JSON.stringify(r)], { type: "application/json" });
      const a = document.createElement("a");
      const fecha = new Date().toISOString().slice(0, 10);
      a.href = URL.createObjectURL(blob);
      a.download = `respaldo ${String(empresa.nombre).replace(/[^\w\-áéíóúñÁÉÍÓÚÑ ]+/g, "")} ${fecha}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      const s = resumenRespaldo(r);
      setHecho(`Copia descargada: ${s.cuentas} cuentas, ${s.partidas} partidas, ${s.ventas} ventas, ${s.compras} compras, ${s.productos} productos.`);
    } catch (e) {
      setError("No se pudo generar la copia: " + e.message);
    }
    setProgreso(null);
  }

  return (
    <div>
      <button type="button" onClick={descargar} disabled={!!progreso} className={btn}>{progreso || "Descargar copia de seguridad"}</button>
      {error && <p className="text-sm text-rust mt-2">{error}</p>}
      {hecho && <p className="text-sm text-ledger mt-2">{hecho}</p>}
    </div>
  );
}

// Restaura el archivo como una empresa NUEVA; nunca modifica las empresas existentes.
export function RestaurarRespaldo({ onHecho }) {
  const entrada = useRef(null);
  const [respaldo, setRespaldo] = useState(null);
  const [nombre, setNombre] = useState("");
  const [progreso, setProgreso] = useState(null);
  const [error, setError] = useState(null);
  const [hecho, setHecho] = useState(null);

  async function elegir(e) {
    setError(null);
    setHecho(null);
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const r = JSON.parse(await f.text());
      if (r?.app !== "contacloud" || !r.empresa) throw new Error("no es una copia de ContaCloud");
      setRespaldo(r);
      setNombre(`${r.empresa.nombre} (restaurada)`);
    } catch (err) {
      setRespaldo(null);
      setError("El archivo no se puede leer: " + err.message);
    }
  }

  async function restaurar() {
    setError(null);
    try {
      const nueva = await restaurarRespaldo(respaldo, { nombre: nombre.trim() }, (n, total, tabla) => setProgreso(`Restaurando ${tabla || "…"} (${n}/${total})`));
      setHecho(`Listo: se creó la empresa «${nueva.nombre}».`);
      setRespaldo(null);
      if (entrada.current) entrada.current.value = "";
      onHecho?.();
    } catch (e) {
      setError("No se pudo restaurar (no quedó nada a medias): " + e.message);
    }
    setProgreso(null);
  }

  const s = respaldo ? resumenRespaldo(respaldo) : null;
  return (
    <div className="space-y-3">
      <input ref={entrada} type="file" accept=".json,application/json" onChange={elegir} className="text-sm" />
      {s && (
        <div className="bg-[#F7F4EA] border border-paperLine rounded-sm p-3 text-sm space-y-2">
          <p>Copia de <strong>{s.nombre}</strong> del {s.exportado_en.slice(0, 10)}: {s.cuentas} cuentas, {s.partidas} partidas, {s.ventas} ventas, {s.compras} compras, {s.productos} productos.</p>
          <label className="block">
            <span className="block text-xs text-inkSoft mb-1">Nombre de la empresa nueva</span>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="border border-paperLine rounded-sm px-2 py-1.5 text-sm bg-white w-full sm:w-96" />
          </label>
          <button type="button" onClick={restaurar} disabled={!!progreso || !nombre.trim()} className={btn}>{progreso || "Restaurar como empresa nueva"}</button>
          <p className="text-xs text-inkSoft">Cuenta dentro del límite de empresas de tu licencia. Los usuarios invitados y la bitácora no se restauran.</p>
        </div>
      )}
      {error && <p className="text-sm text-rust">{error}</p>}
      {hecho && <p className="text-sm text-ledger">{hecho}</p>}
    </div>
  );
}
