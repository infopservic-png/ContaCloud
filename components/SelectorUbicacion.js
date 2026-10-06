"use client";

import {
  DEPARTAMENTOS,
  COD_OTRO,
  municipiosDe,
  distritosDe,
} from "@/lib/catalogos";

const selCls = "w-full border border-paperLine rounded-sm px-2 py-1.5 text-sm disabled:opacity-60";
const labCls = "block text-xs font-medium text-inkSoft mb-1";

// Departamento → Municipio → Distrito (catálogos CAT-012, CAT-013 y CAT-008 del Ministerio de Hacienda).
// Cada lista se filtra con la anterior, así los tres códigos siempre corresponden entre sí.
// Devuelve tres campos de formulario (úsalo dentro de una rejilla).
export default function SelectorUbicacion({ departamento, municipio, distrito, onChange, requerido = false }) {
  const dep = departamento || "";
  const mun = municipio || "";
  const dis = distrito || "";
  const otro = dep === COD_OTRO;
  const municipios = dep && !otro ? municipiosDe(dep) : [];
  // En alfabético: el orden del catálogo oficial es por abreviatura y es difícil de recorrer
  const distritos = dep && mun && !otro
    ? [...distritosDe(dep, mun)].sort((a, b) => a.n.localeCompare(b.n, "es"))
    : [];
  const marca = requerido ? " *" : "";

  const emitir = (d, m, di) => onChange({ cod_departamento: d, cod_municipio: m, cod_distrito: di });

  function cambiarDepartamento(v) {
    if (v === COD_OTRO) emitir(COD_OTRO, COD_OTRO, COD_OTRO); // extranjeros
    else emitir(v, "", "");
  }
  function cambiarMunicipio(v) {
    const ds = v ? distritosDe(dep, v) : [];
    emitir(dep, v, ds.length === 1 ? ds[0].c : ""); // si solo hay un distrito, se elige solo
  }

  return (
    <>
      <div>
        <label className={labCls}>Departamento{marca}</label>
        <select value={dep} onChange={(e) => cambiarDepartamento(e.target.value)} className={selCls}>
          <option value="">Selecciona…</option>
          {DEPARTAMENTOS.map((d) => (
            <option key={d.c} value={d.c}>{d.n}</option>
          ))}
          <option value={COD_OTRO}>Otro (extranjero)</option>
        </select>
      </div>
      <div>
        <label className={labCls}>Municipio{marca}</label>
        <select
          value={otro ? COD_OTRO : mun}
          onChange={(e) => cambiarMunicipio(e.target.value)}
          disabled={!dep || otro}
          className={selCls}
        >
          {otro ? (
            <option value={COD_OTRO}>Otro (extranjero)</option>
          ) : (
            <>
              <option value="">{dep ? "Selecciona…" : "Elige primero el departamento"}</option>
              {municipios.map((m) => (
                <option key={m.c} value={m.c}>{m.n}</option>
              ))}
            </>
          )}
        </select>
      </div>
      <div>
        <label className={labCls}>Distrito{marca}</label>
        <select
          value={otro ? COD_OTRO : dis}
          onChange={(e) => emitir(dep, mun, e.target.value)}
          disabled={!mun || otro}
          className={selCls}
        >
          {otro ? (
            <option value={COD_OTRO}>Otro (extranjero)</option>
          ) : (
            <>
              <option value="">{mun ? "Selecciona…" : "Elige primero el municipio"}</option>
              {distritos.map((d) => (
                <option key={d.c} value={d.c}>{d.n}</option>
              ))}
            </>
          )}
        </select>
      </div>
    </>
  );
}
