"use client";

import { useState } from "react";
import { useEmpresa } from "@/lib/EmpresaContext";
import FormatoFacturaDte from "@/components/FormatoFacturaDte";
import TransmisionHacienda from "@/components/TransmisionHacienda";
import CorreoCompras from "@/components/CorreoCompras";

const CAMPOS = [
  { key: "firma_elaborado", label: "Elaborado por", ayuda: "Quien prepara las partidas (por ejemplo, el contador o auxiliar)." },
  { key: "firma_revisado", label: "Revisado por", ayuda: "Quien revisa las partidas." },
  { key: "firma_autorizado", label: "Autorizado por", ayuda: "Quien autoriza (gerente, representante legal)." },
];
const inputCls = "w-full border border-paperLine rounded-sm px-2 py-1.5 text-sm bg-white";

export default function ConfiguracionPage() {
  const { empresa, actualizarEmpresa } = useEmpresa();
  const [valores, setValores] = useState(() => Object.fromEntries(CAMPOS.map((c) => [c.key, empresa?.[c.key] || ""])));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [nombre, setNombre] = useState(empresa?.nombre || "");
  const [guardandoNombre, setGuardandoNombre] = useState(false);
  const [errorNombre, setErrorNombre] = useState(null);
  const [avisoNombre, setAvisoNombre] = useState(null);

  async function guardarNombre(e) {
    e.preventDefault();
    setErrorNombre(null);
    setAvisoNombre(null);
    const limpio = nombre.replace(/\s+/g, " ").trim();
    if (!limpio) return setErrorNombre("Escribe el nombre de la empresa.");
    if (limpio === empresa?.nombre) return setAvisoNombre("El nombre no cambió.");
    setGuardandoNombre(true);
    const { error } = await actualizarEmpresa({ nombre: limpio });
    setGuardandoNombre(false);
    if (error) setErrorNombre(error.message);
    else { setNombre(limpio); setAvisoNombre("Guardado. El nuevo nombre se usará en reportes, partidas impresas y en los documentos nuevos."); }
  }

  async function guardar(e) {
    e.preventDefault();
    setError(null);
    setAviso(null);
    setGuardando(true);
    const cambios = Object.fromEntries(CAMPOS.map((c) => [c.key, valores[c.key].trim() || null]));
    const { error } = await actualizarEmpresa(cambios);
    setGuardando(false);
    if (error) setError(/firma_/i.test(error.message) ? "Falta ejecutar la migración 37 (firmas de partidas) en Supabase." : error.message);
    else setAviso("Guardado. Los nombres aparecerán en todas las partidas impresas.");
  }

  return (
    <div className="max-w-xl">
      <h2 className="font-display text-lg font-semibold mb-1">Nombre de la empresa</h2>
      <p className="text-xs text-inkSoft mb-4">
        Es el nombre que se ve en la lista de empresas, en los reportes y en los documentos nuevos. Los documentos ya emitidos conservan el nombre con el que se generaron.
        Si cambia el nombre legal, recuerda que debe coincidir con el registrado en Hacienda.
      </p>
      <form onSubmit={guardarNombre} className="space-y-3 bg-[#F7F4EA] border border-paperLine rounded-sm p-5 mb-10">
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputCls} placeholder="Nombre de la empresa" />
        {errorNombre && <p className="text-sm text-rust">{errorNombre}</p>}
        {avisoNombre && <p className="text-sm text-ledger">{avisoNombre}</p>}
        <button type="submit" disabled={guardandoNombre} className="bg-brand text-onBrand px-4 py-2 rounded-sm text-sm font-medium hover:bg-brandDark disabled:opacity-60">
          {guardandoNombre ? "Guardando…" : "Guardar nombre"}
        </button>
      </form>

      <h2 className="font-display text-lg font-semibold mb-1">Configuración de las partidas</h2>
      <p className="text-xs text-inkSoft mb-4">
        Define quién aparece bajo cada línea de firma al imprimir las partidas (Libro Diario y PDF con respaldos).
        Al digitar una partida, «Elaborado por» y «Revisado por» se llenan solos con estos nombres, y puedes cambiarlos en una partida específica.
      </p>
      <form onSubmit={guardar} className="space-y-4 bg-[#F7F4EA] border border-paperLine rounded-sm p-5">
        {CAMPOS.map((c) => (
          <label key={c.key} className="block">
            <span className="block text-xs font-medium text-inkSoft mb-1">{c.label}</span>
            <input value={valores[c.key]} onChange={(e) => setValores({ ...valores, [c.key]: e.target.value })} className={inputCls} placeholder="Nombre completo" />
            <span className="block text-[11px] text-inkSoft mt-0.5">{c.ayuda}</span>
          </label>
        ))}
        {error && <p className="text-sm text-rust">{error}</p>}
        {aviso && <p className="text-sm text-ledger">{aviso}</p>}
        <button type="submit" disabled={guardando} className="bg-brand text-onBrand px-4 py-2 rounded-sm text-sm font-medium hover:bg-brandDark disabled:opacity-60">
          {guardando ? "Guardando…" : "Guardar"}
        </button>
      </form>
      <TransmisionHacienda />
      <CorreoCompras />
      <FormatoFacturaDte />
    </div>
  );
}
