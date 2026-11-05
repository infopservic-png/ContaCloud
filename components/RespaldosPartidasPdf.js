"use client";

import { useState } from "react";

// Descarga un PDF con las partidas de un rango de fechas; cada partida va
// seguida del PDF de los DTE (JSON) que la respaldan.
export default function RespaldosPartidasPdf({ partidas, empresa, empresaId }) {
  const hoy = new Date().toISOString().slice(0, 10);
  const [desde, setDesde] = useState(hoy.slice(0, 8) + "01");
  const [hasta, setHasta] = useState(hoy);
  const [generando, setGenerando] = useState(false);
  const [avance, setAvance] = useState("");
  const [mensaje, setMensaje] = useState(null);
  const [error, setError] = useState(null);

  async function generar() {
    setError(null);
    setMensaje(null);
    const rango = partidas.filter((p) => p.fecha >= desde && p.fecha <= hasta);
    if (rango.length === 0) {
      setError("No hay partidas en ese rango de fechas.");
      return;
    }
    setGenerando(true);
    setAvance("");
    try {
      const { generarPdfPartidasConRespaldos } = await import("@/lib/respaldosPdf");
      const r = await generarPdfPartidasConRespaldos({
        empresa,
        empresaId,
        partidas: rango,
        alAvanzar: (n, t) => setAvance(`${n} de ${t} partidas`),
      });
      const url = URL.createObjectURL(new Blob([r.bytes], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `partidas-con-respaldos_${desde}_${hasta}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMensaje(
        `PDF generado: ${r.partidas} partida(s) y ${r.respaldos} respaldo(s) DTE.` +
          (r.sinRespaldo > 0
            ? ` ${r.sinRespaldo} partida(s) del día no tienen JSON guardado (importa de nuevo esos archivos para completarlas).`
            : "")
      );
    } catch (e) {
      setError("No se pudo generar el PDF: " + (e.message || e));
    } finally {
      setGenerando(false);
      setAvance("");
    }
  }

  return (
    <section className="no-print mb-4 bg-[#F7F4EA] border border-paperLine rounded-sm p-3 text-xs">
      <p className="font-medium mb-2">Partidas con respaldos (PDF)</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-inkSoft">
          Desde
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="block border border-paperLine rounded-sm px-2 py-1 text-sm" />
        </label>
        <label className="text-inkSoft">
          Hasta
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="block border border-paperLine rounded-sm px-2 py-1 text-sm" />
        </label>
        <button
          onClick={generar}
          disabled={generando}
          className="bg-brand text-onBrand px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-brandDark disabled:opacity-60"
        >
          {generando ? `Generando… ${avance}` : "Descargar PDF"}
        </button>
      </div>
      <p className="text-inkSoft mt-2">Cada partida del rango sale seguida del PDF de los DTE que la respaldan.</p>
      {mensaje && <p className="text-ledgerDark mt-2">{mensaje}</p>}
      {error && <p className="text-rust mt-2">{error}</p>}
    </section>
  );
}
