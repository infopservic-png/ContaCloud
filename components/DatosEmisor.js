"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import SelectorActividad from "@/components/SelectorActividad";
import SelectorUbicacion from "@/components/SelectorUbicacion";
import {
  soloDigitos,
  normalizarNrc,
  validarNumeroDocumento,
  validarNrc,
  validarActividad,
  validarCodigoMH,
  normalizarCodigoMH,
  faltantesEmisor,
} from "@/lib/datosFiscales";
import { validarUbicacion, actividadPorCodigo } from "@/lib/catalogos";

const CAMPOS_TEXTO = [
  "nit", "nrc", "nombre_comercial", "direccion", "telefono_emisor", "correo_emisor",
  "cod_establecimiento", "cod_punto_venta",
  "cod_actividad", "desc_actividad", "cod_departamento", "cod_municipio", "cod_distrito",
];

const inputCls = "w-full border border-paperLine rounded-sm px-2 py-1.5 text-sm";
const labelCls = "block text-xs text-inkSoft mb-1";

export default function DatosEmisor({ empresa, onGuardado }) {
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [valores, setValores] = useState(() => {
    const v = {};
    CAMPOS_TEXTO.forEach((k) => (v[k] = empresa?.[k] || ""));
    return v;
  });
  const cambiar = (cambios) => setValores((v) => ({ ...v, ...cambios }));

  const faltanDatos = !empresa?.nit || !empresa?.nrc;
  const faltantes = faltantesEmisor(empresa || {});

  async function guardar() {
    setError(null);
    const limpio = {
      nit: soloDigitos(valores.nit),
      nrc: normalizarNrc(valores.nrc),
      nombre_comercial: valores.nombre_comercial.trim(),
      direccion: valores.direccion.trim(),
      telefono_emisor: valores.telefono_emisor.trim(),
      correo_emisor: valores.correo_emisor.trim(),
      cod_establecimiento: normalizarCodigoMH(valores.cod_establecimiento),
      cod_punto_venta: normalizarCodigoMH(valores.cod_punto_venta),
      cod_actividad: valores.cod_actividad.replace(/\s+/g, ""),
      cod_departamento: valores.cod_departamento,
      cod_municipio: valores.cod_municipio,
      cod_distrito: valores.cod_distrito,
    };
    // La descripción debe corresponder al código: se toma la del catálogo
    limpio.desc_actividad = actividadPorCodigo(limpio.cod_actividad)?.descripcion || valores.desc_actividad.trim();

    const problema =
      validarNumeroDocumento("nit", limpio.nit) ||
      validarNrc(limpio.nrc) ||
      validarActividad(limpio.cod_actividad, limpio.desc_actividad) ||
      validarUbicacion(limpio.cod_departamento, limpio.cod_municipio, limpio.cod_distrito) ||
      (!limpio.cod_establecimiento && "Indica el código de establecimiento que asignó Hacienda (por ejemplo M001).") ||
      (!limpio.cod_punto_venta && "Indica el código de punto de venta que asignó Hacienda (por ejemplo P001).") ||
      validarCodigoMH(limpio.cod_establecimiento, "establecimiento") ||
      validarCodigoMH(limpio.cod_punto_venta, "punto de venta");
    if (problema) {
      setError(problema);
      return;
    }

    setGuardando(true);
    const { error: errDb } = await supabase.from("empresas").update(limpio).eq("id", empresa.id);
    setGuardando(false);
    if (errDb) {
      setError("No se pudo guardar: " + errDb.message);
      return;
    }
    setValores((v) => ({ ...v, ...limpio }));
    setEditando(false);
    onGuardado && onGuardado(limpio);
  }

  if (!editando) {
    return (
      <div className="bg-[#F7F4EA] border border-paperLine rounded-sm p-4 mb-6 flex items-start justify-between gap-4">
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
          {!faltanDatos && (
            <p className={`text-xs mt-1 ${faltantes.length ? "text-accentDark" : "text-ledgerDark"}`}>
              {faltantes.length
                ? `Para transmitir a Hacienda falta: ${faltantes.join(", ")}.`
                : "Datos completos para transmitir."}
            </p>
          )}
        </div>
        <button
          onClick={() => setEditando(true)}
          className="text-xs text-accentDark hover:underline whitespace-nowrap"
        >
          Editar
        </button>
      </div>
    );
  }

  return (
    <div className="bg-[#F7F4EA] border border-paperLine rounded-sm p-6 mb-6">
      <h3 className="font-display text-base font-semibold mb-4">Datos fiscales del emisor</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className={labelCls}>NIT (sin guiones)</label>
          <input value={valores.nit} onChange={(e) => cambiar({ nit: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>NRC (sin guion)</label>
          <input value={valores.nrc} onChange={(e) => cambiar({ nrc: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Nombre comercial (opcional)</label>
          <input value={valores.nombre_comercial} onChange={(e) => cambiar({ nombre_comercial: e.target.value })} className={inputCls} />
        </div>
        <SelectorActividad
          codigo={valores.cod_actividad}
          descripcion={valores.desc_actividad}
          onChange={cambiar}
          requerido
          className="sm:col-span-3"
        />
        <SelectorUbicacion
          departamento={valores.cod_departamento}
          municipio={valores.cod_municipio}
          distrito={valores.cod_distrito}
          onChange={cambiar}
          requerido
        />
        <div className="sm:col-span-3">
          <label className={labelCls}>Dirección complementaria (calle, colonia, número) *</label>
          <input value={valores.direccion} onChange={(e) => cambiar({ direccion: e.target.value })} className={inputCls} />
          <p className="text-xs text-inkSoft mt-1">En el documento se agrega el nombre del distrito a esta dirección.</p>
        </div>
        <div>
          <label className={labelCls}>Teléfono *</label>
          <input value={valores.telefono_emisor} onChange={(e) => cambiar({ telefono_emisor: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Correo *</label>
          <input value={valores.correo_emisor} onChange={(e) => cambiar({ correo_emisor: e.target.value })} className={inputCls} />
        </div>
        <div className="hidden sm:block" />
        <div>
          <label className={labelCls}>Código de establecimiento (Hacienda)</label>
          <input
            value={valores.cod_establecimiento}
            onChange={(e) => cambiar({ cod_establecimiento: e.target.value })}
            placeholder="M001"
            className={`${inputCls} font-num uppercase`}
          />
        </div>
        <div>
          <label className={labelCls}>Código de punto de venta (Hacienda)</label>
          <input
            value={valores.cod_punto_venta}
            onChange={(e) => cambiar({ cod_punto_venta: e.target.value })}
            placeholder="P001"
            className={`${inputCls} font-num uppercase`}
          />
        </div>
        <p className="text-xs text-inkSoft sm:col-span-3">
          Los códigos de establecimiento y de punto de venta los asigna Hacienda y forman parte del Número de
          Control. Consúltalos en el Sitio de Emisores DTE, en Consultas, Consultar Establecimientos.
        </p>
      </div>
      {error && <p className="text-sm text-rust mt-3">{error}</p>}
      <div className="mt-4 flex gap-3">
        <button
          onClick={guardar}
          disabled={guardando}
          className="bg-brand text-onBrand px-4 py-2 rounded-sm text-sm hover:bg-brandDark disabled:opacity-60"
        >
          {guardando ? "Guardando…" : "Guardar datos"}
        </button>
        <button onClick={() => { setEditando(false); setError(null); }} className="text-sm text-inkSoft hover:underline">
          Cancelar
        </button>
      </div>
    </div>
  );
}
