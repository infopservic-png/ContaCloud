"use client";

import { useState } from "react";
import SelectorActividad from "@/components/SelectorActividad";
import SelectorUbicacion from "@/components/SelectorUbicacion";
import { formatoMoneda } from "@/lib/contabilidad";

const inputCls = "w-full border border-paperLine rounded-sm px-2 py-1.5 text-sm bg-white";
// Los campos que exige el DTE llevan la etiqueta en rojo, como en los sistemas contables comerciales.
const reqCls = "block text-xs font-medium text-rust mb-1";
const optCls = "block text-xs font-medium text-inkSoft mb-1";

function Campo({ etiqueta, requerido, className = "", children }) {
  return (
    <div className={className}>
      <label className={requerido ? reqCls : optCls}>{etiqueta}</label>
      {children}
    </div>
  );
}

// Ficha de cliente o proveedor en dos pestañas: "Datos generales" y "Otros datos".
export default function FormEntidad({ tipo = "cliente", v, set, error, guardando, editando, saldo = 0, onSubmit, onCancel }) {
  const prov = tipo === "proveedor";
  const nombreTipo = prov ? "proveedor" : "cliente";
  const [pestana, setPestana] = useState("generales");
  const juridica = v.tipo_persona === "juridica";
  const campo = (nombre) => ({
    value: v[nombre] ?? "",
    onChange: (e) => set({ [nombre]: e.target.value }),
    className: inputCls,
  });

  const Pestana = ({ id, texto }) => (
    <button
      type="button"
      onClick={() => setPestana(id)}
      aria-pressed={pestana === id}
      className={
        "px-5 py-2 text-sm font-medium border border-paperLine border-b-0 rounded-t-sm " +
        (pestana === id ? "bg-white text-ink" : "bg-paperLine/30 text-inkSoft hover:text-ink")
      }
    >
      {texto}
    </button>
  );

  return (
    <form onSubmit={onSubmit} className="bg-[#F7F4EA] border border-paperLine rounded-sm p-4">
      <p className="text-sm font-medium mb-3">{editando ? `Editar ${nombreTipo}` : `Nuevo ${nombreTipo}`}</p>
      <div className="flex gap-1">
        <Pestana id="generales" texto="Datos generales" />
        <Pestana id="otros" texto="Otros datos" />
      </div>

      <div className="border border-paperLine bg-white p-4 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
        {pestana === "generales" ? (
          <>
            <Campo etiqueta={`Código del ${nombreTipo}`} requerido>
              <input {...campo("codigo")} />
            </Campo>
            <Campo etiqueta="Tipo de persona" requerido className="sm:col-span-2">
              <div className="flex gap-4 py-1.5 text-sm">
                {[["juridica", "Jurídica"], ["natural", "Natural"]].map(([val, txt]) => (
                  <label key={val} className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="tipo_persona"
                      checked={v.tipo_persona === val}
                      onChange={() =>
                        set({ tipo_persona: val, ...(val === "juridica" ? { tipo_documento: "nit" } : {}) })
                      }
                    />
                    {txt}
                  </label>
                ))}
              </div>
            </Campo>
            <div className="hidden sm:block" />

            <Campo etiqueta="Nombres" requerido className="sm:col-span-4">
              <input {...campo("nombre")} />
            </Campo>
            <Campo etiqueta="Nombre en Hacienda (el que lleva el DTE)" requerido className="sm:col-span-4">
              <input {...campo("nombre_hacienda")} placeholder="Si lo dejas vacío se usa el nombre" />
            </Campo>
            <Campo etiqueta="Nombre comercial" className="sm:col-span-4">
              <input {...campo("nombre_comercial")} />
            </Campo>

            <Campo etiqueta="Tipo de documento" requerido>
              <select
                value={v.tipo_documento}
                onChange={(e) => set({ tipo_documento: e.target.value })}
                className={inputCls}
              >
                <option value="nit">NIT</option>
                {!juridica && <option value="dui">DUI</option>}
              </select>
            </Campo>
            <Campo etiqueta={v.tipo_documento === "dui" ? "DUI (9 dígitos)" : "NIT para DTE (9 o 14 dígitos)"} requerido>
              <input {...campo("nit_dui")} />
            </Campo>
            <Campo etiqueta="Número de registro (NRC)" requerido>
              <input {...campo("nrc")} />
            </Campo>
            <div className="hidden sm:block" />

            <Campo etiqueta="Giro" requerido={prov} className="sm:col-span-4">
              <input {...campo("giro")} />
            </Campo>
            <SelectorActividad
              codigo={v.cod_actividad}
              descripcion={v.desc_actividad}
              onChange={(x) => set(x)}
              className="sm:col-span-4"
              requerido
            />
            <SelectorUbicacion
              departamento={v.cod_departamento}
              municipio={v.cod_municipio}
              distrito={v.cod_distrito}
              onChange={(x) => set(x)}
              requerido
            />
            <Campo etiqueta="Dirección complementaria (calle, colonia, número)" requerido className="sm:col-span-4">
              <input {...campo("direccion")} />
              <p className="text-xs text-inkSoft mt-1">En el documento se agrega el nombre del distrito a esta dirección.</p>
            </Campo>
            <Campo etiqueta="Correo electrónico" requerido className="sm:col-span-2">
              <input type="email" {...campo("correo")} />
            </Campo>
            <Campo etiqueta="Contactos" className="sm:col-span-2">
              <input {...campo("contactos")} />
            </Campo>
            <Campo etiqueta="Representante legal" className="sm:col-span-4">
              <input {...campo("representante_legal")} />
            </Campo>
          </>
        ) : (
          <>
            <Campo etiqueta="Teléfonos" className="sm:col-span-2">
              <input {...campo("telefono")} placeholder="2222-3333" />
            </Campo>
            <Campo etiqueta="Móvil" className="sm:col-span-2">
              <input {...campo("movil")} placeholder="7777-8888" />
            </Campo>

            <Campo etiqueta={prov ? "Modalidad de compra" : "Modalidad de facturación"} className="sm:col-span-2">
              <div className="flex gap-4 py-1.5 text-sm">
                {[["contado", "Contado"], ["credito", "Crédito"]].map(([val, txt]) => (
                  <label key={val} className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="modalidad_pago"
                      checked={v.modalidad_pago === val}
                      onChange={() => set({ modalidad_pago: val })}
                    />
                    {txt}
                  </label>
                ))}
              </div>
            </Campo>
            <Campo etiqueta="Días de crédito">
              <input
                type="number"
                min="0"
                max="365"
                step="1"
                disabled={v.modalidad_pago !== "credito"}
                {...campo("dias_credito")}
                className={inputCls + " disabled:opacity-60"}
              />
            </Campo>
            <div className="hidden sm:block" />

            <Campo etiqueta={prov ? "Límite de crédito (que te otorga)" : "Límite de crédito"}>
              <input type="number" min="0" step="0.01" {...campo("limite_credito")} />
            </Campo>
            <Campo etiqueta={prov ? "Saldo actual (por pagar)" : "Saldo actual (por cobrar)"}>
              <input value={formatoMoneda(saldo)} readOnly className={inputCls + " bg-paper/60 text-right"} />
            </Campo>
            <label className="flex items-center gap-2 text-sm sm:col-span-2 py-1.5">
              <input
                type="checkbox"
                checked={!!v.aplica_retencion}
                onChange={(e) => set({ aplica_retencion: e.target.checked })}
              />
              {prov ? "Se aplica retención al pagarle" : "Aplica retención al facturar"}
            </label>

            {prov && (
              <>
                <Campo etiqueta="Tipo de operación" className="sm:col-span-2">
                  <select value={v.tipo_operacion} onChange={(e) => set({ tipo_operacion: e.target.value })} className={inputCls}>
                    <option value="gravada">Gravada</option>
                    <option value="exenta">Exenta</option>
                    <option value="no_sujeta">No sujeta</option>
                  </select>
                </Campo>
                <Campo etiqueta="Clasificación" className="sm:col-span-2">
                  <select value={v.clasificacion} onChange={(e) => set({ clasificacion: e.target.value })} className={inputCls}>
                    <option value="gasto">Gasto</option>
                    <option value="costo">Costo</option>
                  </select>
                </Campo>
              </>
            )}
            <Campo etiqueta={`Tipo de ${nombreTipo}`} className="sm:col-span-4">
              <div className="flex flex-wrap gap-4 py-1.5 text-sm">
                {[["practica", "Práctica (datos de ejercicio)"], ["real", prov ? "Real (proveedor verdadero)" : "Real (cliente verdadero)"]].map(([val, txt]) => (
                  <label key={val} className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="ambiente"
                      checked={v.ambiente === val}
                      onChange={() => set({ ambiente: val })}
                    />
                    {txt}
                  </label>
                ))}
              </div>
            </Campo>
            <Campo etiqueta="Notas" className="sm:col-span-4">
              <textarea rows={3} {...campo("notas")} />
            </Campo>
          </>
        )}
      </div>

      <p className="text-xs text-rust mt-2">* Los campos con etiqueta en rojo son obligatorios para el DTE (Crédito Fiscal).</p>
      {error && <p className="text-sm text-rust mt-2">{error}</p>}
      <div className="flex gap-3 mt-3">
        <button
          type="submit"
          disabled={guardando}
          className="bg-brand text-onBrand px-4 py-2 rounded-sm text-sm font-medium hover:bg-brandDark disabled:opacity-60"
        >
          {guardando ? "Guardando…" : editando ? "Guardar cambios" : "Guardar"}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-inkSoft hover:text-ink underline underline-offset-2">
          Cancelar
        </button>
      </div>
    </form>
  );
}
