"use client";

import { useState, useRef, useEffect, useMemo } from "react";

// Combobox con búsqueda para elegir una cuenta entre catálogos grandes.
// Muestra hasta 50 resultados que coincidan con el código o el nombre.
export default function CuentaCombobox({ cuentas, value, onChange, placeholder }) {
  const cuentaSeleccionada = cuentas.find((c) => c.id === value) || null;

  const [texto, setTexto] = useState(
    cuentaSeleccionada ? `${cuentaSeleccionada.codigo} — ${cuentaSeleccionada.nombre}` : ""
  );
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef(null);

  useEffect(() => {
    const actual = cuentas.find((c) => c.id === value);
    setTexto(actual ? `${actual.codigo} — ${actual.nombre}` : "");
  }, [value, cuentas]);

  useEffect(() => {
    function alHacerClicFuera(e) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target)) {
        setAbierto(false);
      }
    }
    document.addEventListener("mousedown", alHacerClicFuera);
    return () => document.removeEventListener("mousedown", alHacerClicFuera);
  }, []);

  const resultados = useMemo(() => {
    const q = texto.trim().toLowerCase();
    if (!q) return cuentas.slice(0, 50);
    return cuentas
      .filter(
        (c) =>
          c.codigo.toLowerCase().includes(q) || c.nombre.toLowerCase().includes(q)
      )
      .slice(0, 50);
  }, [texto, cuentas]);

  function elegir(cuenta) {
    onChange(cuenta.id);
    setTexto(`${cuenta.codigo} — ${cuenta.nombre}`);
    setAbierto(false);
  }

  return (
    <div className="relative" ref={contenedorRef}>
      <input
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
          if (value) onChange("");
        }}
        onFocus={() => setAbierto(true)}
        placeholder={placeholder || "Buscar cuenta por código o nombre…"}
        className="w-full border border-paperLine rounded-sm px-2 py-1 text-sm"
      />
      {abierto && resultados.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full max-h-56 overflow-auto bg-paper border border-paperLine rounded-sm shadow-lg text-sm">
          {resultados.map((c) => (
            <li
              key={c.id}
              onMouseDown={(e) => {
                e.preventDefault();
                elegir(c);
              }}
              className="px-2 py-1.5 hover:bg-brass/20 cursor-pointer"
            >
              <span className="font-num">{c.codigo}</span> — {c.nombre}
            </li>
          ))}
        </ul>
      )}
      {abierto && texto && resultados.length === 0 && (
        <div className="absolute z-20 mt-1 w-full bg-paper border border-paperLine rounded-sm shadow-lg text-sm px-2 py-1.5 text-inkSoft">
          Sin resultados
        </div>
      )}
    </div>
  );
}
