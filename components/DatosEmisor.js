"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const CAMPOS = [
  { key: "nit", label: "NIT" },
  { key: "nrc", label: "NRC" },
  { key: "nombre_comercial", label: "Nombre comercial" },
  { key: "giro", label: "Giro / Actividad económica" },
  { key: "direccion", label: "Dirección" },
  { key: "departamento", label: "Departamento" },
  { key: "municipio", label: "Municipio" },
  { key: "telefono_emisor", label: "Teléfono" },
  { key: "correo_emisor", label: "Correo" },
  { key: "cod_establecimiento", label: "Código de establecimiento" },
  { key: "cod_punto_venta", label: "Código de punto de venta" },
];

export default function DatosEmisor({ empresa, onGuardado }) {
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [valores, setValores] = useState(() => {
    const v = {};
    CAMPOS.forEach((c) => (v[c.key] = empresa?.[c.key] || ""));
    return v;
  });

  const faltanDatos = !empresa?.nit || !empresa?.nrc;

  async function guardar() {
    setGuardando(true);
    const { error } = await supabase
      .from("empresas")
      .update(valores)
      .eq("id", empresa.id);
    setGuardando(false);
    if (!error) {
      setEditando(false);
      onGuardado && onGuardado(valores);
    }
  }

  if (!editando) {
    return (
      <div className="bg-[#F7F4EA] border border-paperLine rounded-sm p-4 mb-6 flex items-center justify-between">
        <div className="text-sm">
          <span className="font-medium">Datos fiscales del emisor: </span>
          {faltanDatos ? (
            <span className="text-rust">
              Faltan datos (NIT / NRC) — complétalos antes de emitir documentos.
            </span>
          ) : (
            <span className="text-inkSoft">
              NIT {empresa.nit} — NRC {empresa.nrc} — {empresa.nombre_comercial || empresa.nombre}
            </span>
          )}
        </div>
        <button
          onClick={() => setEditando(true)}
          className="text-xs text-brassDark hover:underline"
        >
          Editar
        </button>
      </div>
    );
  }

  return (
    <div className="bg-[#F7F4EA] border border-paperLine rounded-sm p-6 mb-6">
      <h3 className="font-display text-base font-semibold mb-4">
        Datos fiscales del emisor
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {CAMPOS.map((c) => (
          <div key={c.key}>
            <label className="block text-xs text-inkSoft mb-1">{c.label}</label>
            <input
              value={valores[c.key]}
              onChange={(e) =>
                setValores({ ...valores, [c.key]: e.target.value })
              }
              className="w-full border border-paperLine rounded-sm px-2 py-1.5 text-sm"
            />
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-3">
        <button
          onClick={guardar}
          disabled={guardando}
          className="bg-ink text-paper px-4 py-2 rounded-sm text-sm hover:bg-[#2C3A52] disabled:opacity-60"
        >
          {guardando ? "Guardando…" : "Guardar datos"}
        </button>
        <button
          onClick={() => setEditando(false)}
          className="text-sm text-inkSoft hover:underline"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
