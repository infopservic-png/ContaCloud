"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

function formatearFecha(f) {
  if (!f) return null;
  const [y, m, d] = f.split("-");
  return `${d}/${m}/${y}`;
}

export default function EncabezadoReporte({ empresa, tituloReporte, onGuardado }) {
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [periodoInicio, setPeriodoInicio] = useState(empresa?.periodo_inicio || "");
  const [periodoFin, setPeriodoFin] = useState(empresa?.periodo_fin || "");
  const [moneda, setMoneda] = useState(empresa?.moneda || "USD");

  async function guardar() {
    setGuardando(true);
    const { error } = await supabase
      .from("empresas")
      .update({
        periodo_inicio: periodoInicio || null,
        periodo_fin: periodoFin || null,
        moneda: moneda || "USD",
      })
      .eq("id", empresa.id);
    setGuardando(false);
    if (!error) {
      setEditando(false);
      onGuardado && onGuardado({ periodo_inicio: periodoInicio, periodo_fin: periodoFin, moneda });
    }
  }

  const hayPeriodo = empresa?.periodo_inicio && empresa?.periodo_fin;

  return (
    <div className="text-center mb-6">
      <h2 className="font-display text-lg font-semibold">{empresa?.nombre}</h2>
      <p className="text-inkSoft text-sm">{tituloReporte}</p>

      {!editando ? (
        <div className="mt-1 flex items-center justify-center gap-2 text-xs text-inkSoft">
          <span>
            {hayPeriodo
              ? `Del ${formatearFecha(empresa.periodo_inicio)} al ${formatearFecha(empresa.periodo_fin)}`
              : "Periodo no definido"}
            {" — "}Cifras en {empresa?.moneda || "USD"}
          </span>
          <button
            onClick={() => setEditando(true)}
            className="text-brassDark hover:underline"
          >
            Editar
          </button>
        </div>
      ) : (
        <div className="mt-3 inline-flex flex-wrap items-end justify-center gap-3 bg-[#F7F4EA] border border-paperLine rounded-sm p-4">
          <div>
            <label className="block text-xs text-inkSoft mb-1 text-left">Del</label>
            <input
              type="date"
              value={periodoInicio}
              onChange={(e) => setPeriodoInicio(e.target.value)}
              className="border border-paperLine rounded-sm px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-inkSoft mb-1 text-left">Al</label>
            <input
              type="date"
              value={periodoFin}
              onChange={(e) => setPeriodoFin(e.target.value)}
              className="border border-paperLine rounded-sm px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-inkSoft mb-1 text-left">Moneda</label>
            <input
              type="text"
              value={moneda}
              onChange={(e) => setMoneda(e.target.value)}
              placeholder="USD"
              className="border border-paperLine rounded-sm px-2 py-1 text-sm w-24"
            />
          </div>
          <button
            onClick={guardar}
            disabled={guardando}
            className="bg-ink text-paper px-3 py-1.5 rounded-sm text-sm hover:bg-[#2C3A52] disabled:opacity-60"
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
          <button
            onClick={() => setEditando(false)}
            className="text-sm text-inkSoft hover:underline px-2"
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
