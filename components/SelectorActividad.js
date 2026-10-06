"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buscarActividades, actividadPorCodigo } from "@/lib/catalogos";

// Buscador de actividad económica (catálogo CAT-019 del Ministerio de Hacienda).
// Se escribe un código o palabras del nombre; al elegir se llenan el código y la descripción oficial.
export default function SelectorActividad({
  codigo,
  descripcion,
  onChange,
  etiqueta = "Actividad económica",
  requerido = false,
  className = "",
}) {
  const textoDe = (c, d) => (c ? `${c} — ${d || actividadPorCodigo(c)?.descripcion || ""}` : "");
  const [texto, setTexto] = useState(textoDe(codigo, descripcion));
  const [abierto, setAbierto] = useState(false);
  const [buscando, setBuscando] = useState(false); // true mientras la persona escribe
  const ref = useRef(null);

  useEffect(() => {
    if (!buscando) setTexto(textoDe(codigo, descripcion));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigo, descripcion]);

  useEffect(() => {
    function fuera(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setAbierto(false);
        setBuscando(false);
        setTexto(textoDe(codigo, descripcion)); // si no eligió nada, vuelve a lo guardado
      }
    }
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigo, descripcion]);

  const resultados = useMemo(
    () => (abierto ? buscarActividades(buscando ? texto : "", 40) : []),
    [abierto, buscando, texto]
  );
  const desconocida = Boolean(codigo) && !actividadPorCodigo(codigo);

  function elegir(a) {
    setBuscando(false);
    setAbierto(false);
    setTexto(textoDe(a.codigo, a.descripcion));
    onChange({ cod_actividad: a.codigo, desc_actividad: a.descripcion });
  }

  return (
    <div className={`relative ${className}`} ref={ref}>
      <label className="block text-xs font-medium text-inkSoft mb-1">
        {etiqueta}
        {requerido ? " *" : ""}
      </label>
      <input
        value={texto}
        onChange={(e) => {
          setBuscando(true);
          setAbierto(true);
          setTexto(e.target.value);
          if (codigo) onChange({ cod_actividad: "", desc_actividad: "" });
        }}
        onFocus={(e) => {
          setAbierto(true);
          if (e.target.select) e.target.select();
        }}
        placeholder="Busca por código o por nombre…"
        className="w-full border border-paperLine rounded-sm px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
      />
      {abierto && resultados.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full max-h-56 overflow-auto bg-paper border border-paperLine rounded-sm shadow-lg text-sm">
          {resultados.map((a) => (
            <li
              key={a.codigo}
              onMouseDown={(e) => {
                e.preventDefault();
                elegir(a);
              }}
              className="px-2 py-1.5 hover:bg-accent/20 cursor-pointer"
            >
              <span className="font-num">{a.codigo}</span> — {a.descripcion}
            </li>
          ))}
        </ul>
      )}
      {abierto && buscando && texto.trim() && resultados.length === 0 && (
        <div className="absolute z-20 mt-1 w-full bg-paper border border-paperLine rounded-sm shadow-lg text-sm px-2 py-1.5 text-inkSoft">
          Sin resultados en el catálogo
        </div>
      )}
      {desconocida && (
        <p className="text-xs text-rust mt-1">
          El código {codigo} no está en el catálogo vigente. Elige otra actividad de la lista.
        </p>
      )}
    </div>
  );
}
