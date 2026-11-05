"use client";

import { useState } from "react";
import Link from "next/link";
import { TIPOS_PARTIDA } from "@/lib/partidas";
import { reclasificarPartidasDiarias } from "@/lib/contabilizar";

// Cambia el tipo de las partidas diarias que ya se contabilizaron (ej. ventas → Ingresos, compras → Diario).
export default function ReclasificarPartidas({ empresaId }) {
  const [tipoVentas, setTipoVentas] = useState("ingreso");
  const [tipoCompras, setTipoCompras] = useState("diario");
  const [trabajando, setTrabajando] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  const [error, setError] = useState(null);
  const sel = "w-full border border-paperLine rounded-sm px-2 py-1 text-sm bg-white";

  async function ejecutar() {
    setError(null);
    setMensaje(null);
    setTrabajando(true);
    try {
      const tipos = { venta: tipoVentas, compra: tipoCompras };
      const plan = await reclasificarPartidasDiarias({ empresaId, tipos, aplicar: false });
      if (plan.length === 0) {
        setMensaje("No hay partidas diarias por reclasificar: ya están en los tipos elegidos.");
        return;
      }
      const nV = plan.filter((p) => p.clase === "venta").length;
      const nC = plan.length - nV;
      if (!confirm(`Se cambiarán ${plan.length} partida(s): ${nV} de ventas y ${nC} de compras. Recibirán números nuevos al final de su tipo (luego puedes usar «Renumerar por fecha» en el Libro diario). ¿Continuar?`)) return;
      await reclasificarPartidasDiarias({ empresaId, tipos, aplicar: true });
      setMensaje(`Listo: ${plan.length} partida(s) reclasificadas (${nV} ventas, ${nC} compras).`);
    } catch (e) {
      setError("No se pudo reclasificar: " + (e.message || e));
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <section className="border border-paperLine bg-[#F7F4EA] rounded-sm p-4 mt-6 space-y-3">
      <p className="text-sm font-medium">Reclasificar partidas ya contabilizadas</p>
      <p className="text-xs text-inkSoft">Cambia el tipo de las partidas diarias creadas desde esta pantalla, por si las contabilizaste con un tipo distinto al que querías.</p>
      <div className="grid sm:grid-cols-2 gap-4 text-sm">
        <div>
          <label className="block text-xs text-inkSoft mb-1">Partidas de ventas pasan a</label>
          <select value={tipoVentas} onChange={(e) => setTipoVentas(e.target.value)} className={sel}>
            {TIPOS_PARTIDA.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-inkSoft mb-1">Partidas de compras pasan a</label>
          <select value={tipoCompras} onChange={(e) => setTipoCompras(e.target.value)} className={sel}>
            {TIPOS_PARTIDA.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
      </div>
      <button onClick={ejecutar} disabled={trabajando} className="sac-btn sac-btn-primario font-medium">
        {trabajando ? "Reclasificando…" : "Reclasificar"}
      </button>
      {mensaje && <p className="text-sm text-ledgerDark">{mensaje} <Link className="underline" href={`/empresa/${empresaId}/transacciones`}>Ver Libro diario</Link></p>}
      {error && <p className="text-sm text-rust">{error}</p>}
    </section>
  );
}
