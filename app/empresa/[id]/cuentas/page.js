"use client";

import { useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useEmpresa } from "@/lib/EmpresaContext";
import { CATALOGO_COMPLETO } from "@/lib/catalogoCuentas";
import { exportarAExcel } from "@/lib/exportarExcel";
import * as XLSX from "xlsx";

const CLASES = ["Activo", "Pasivo", "Capital", "Ingreso", "Costo", "Gasto"];

export default function CuentasPage() {
  const { cuentas, empresaId, recargarCuentas } = useEmpresa();
  const [editandoId, setEditandoId] = useState(null);
  const [borrador, setBorrador] = useState({});
  const [nueva, setNueva] = useState({
    codigo: "",
    nombre: "",
    clase: "Activo",
    tipo_saldo: "deudor",
  });
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [mensajeImport, setMensajeImport] = useState(null);
  const [importandoArchivo, setImportandoArchivo] = useState(false);
  const [mensajeArchivo, setMensajeArchivo] = useState(null);
  const inputArchivoRef = useRef(null);

  const faltantes = CATALOGO_COMPLETO.filter(
    (c) => !cuentas.some((existente) => existente.codigo === c.codigo)
  );

  function exportarCatalogo() {
    const filas = [
      ["Código", "Nombre", "Clase", "Saldo normal"],
      ...cuentas.map((c) => [c.codigo, c.nombre, c.clase, c.tipo_saldo]),
    ];
    exportarAExcel("catalogo-de-cuentas", [{ nombre: "Catálogo de Cuentas", filas }]);
  }

  function normalizarClase(valor) {
    const v = String(valor || "").trim().toLowerCase();
    return CLASES.find((cl) => cl.toLowerCase() === v) || null;
  }

  function normalizarSaldo(valor) {
    const v = String(valor || "").trim().toLowerCase();
    if (v.startsWith("deudor")) return "deudor";
    if (v.startsWith("acreedor")) return "acreedor";
    return null;
  }

  async function importarDesdeArchivo(e) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setMensajeArchivo(null);
    setImportandoArchivo(true);

    try {
      const buffer = await archivo.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const hoja = wb.Sheets[wb.SheetNames[0]];
      const filas = XLSX.utils.sheet_to_json(hoja, { header: 1 });

      const nuevas = [];
      const invalidas = [];
      for (let i = 1; i < filas.length; i++) {
        const [codigoRaw, nombreRaw, claseRaw, saldoRaw] = filas[i] || [];
        const codigo = String(codigoRaw || "").trim();
        const nombre = String(nombreRaw || "").trim();
        if (!codigo || !nombre) continue;
        if (cuentas.some((c) => c.codigo === codigo)) continue;
        if (nuevas.some((c) => c.codigo === codigo)) continue;

        const clase = normalizarClase(claseRaw);
        const tipo_saldo = normalizarSaldo(saldoRaw);
        if (!clase || !tipo_saldo) {
          invalidas.push(codigo || `fila ${i + 1}`);
          continue;
        }
        nuevas.push({ empresa_id: empresaId, codigo, nombre, clase, tipo_saldo });
      }

      if (nuevas.length > 0) {
        const { error: err } = await supabase.from("cuentas").insert(nuevas);
        if (err) {
          setMensajeArchivo("No se pudo importar: " + err.message);
          setImportandoArchivo(false);
          if (inputArchivoRef.current) inputArchivoRef.current.value = "";
          return;
        }
      }

      let mensaje = `Se agregaron ${nuevas.length} cuentas nuevas desde el archivo.`;
      if (invalidas.length > 0) {
        mensaje += ` Se omitieron ${invalidas.length} filas con clase o saldo normal no reconocidos (${invalidas
          .slice(0, 5)
          .join(", ")}${invalidas.length > 5 ? "…" : ""}).`;
      }
      setMensajeArchivo(mensaje);
      recargarCuentas();
    } catch (err) {
      setMensajeArchivo("No se pudo leer el archivo: " + err.message);
    } finally {
      setImportandoArchivo(false);
      if (inputArchivoRef.current) inputArchivoRef.current.value = "";
    }
  }

  async function importarFaltantes() {
    if (faltantes.length === 0) return;
    setImportando(true);
    setMensajeImport(null);
    const { error: err } = await supabase.from("cuentas").insert(
      faltantes.map((c) => ({
        empresa_id: empresaId,
        codigo: c.codigo,
        nombre: c.nombre,
        clase: c.clase,
        tipo_saldo: c.tipo_saldo,
      }))
    );
    setImportando(false);
    if (err) {
      setMensajeImport("No se pudo importar: " + err.message);
      return;
    }
    setMensajeImport(`Se agregaron ${faltantes.length} cuentas nuevas.`);
    recargarCuentas();
  }

  function empezarEdicion(cuenta) {
    setEditandoId(cuenta.id);
    setBorrador({ ...cuenta });
    setError(null);
  }

  async function guardarEdicion() {
    setGuardando(true);
    setError(null);
    const { error: err } = await supabase
      .from("cuentas")
      .update({
        codigo: borrador.codigo,
        nombre: borrador.nombre,
        clase: borrador.clase,
        tipo_saldo: borrador.tipo_saldo,
      })
      .eq("id", editandoId);
    setGuardando(false);
    if (err) {
      setError("No se pudo guardar: " + err.message);
      return;
    }
    setEditandoId(null);
    recargarCuentas();
  }

  async function eliminarCuenta(id) {
    if (!confirm("¿Eliminar esta cuenta? Solo se puede si no tiene movimientos registrados.")) {
      return;
    }
    const { error: err } = await supabase.from("cuentas").delete().eq("id", id);
    if (err) {
      alert(
        "No se pudo eliminar (probablemente ya tiene movimientos registrados en el diario)."
      );
      return;
    }
    recargarCuentas();
  }

  async function agregarCuenta(e) {
    e.preventDefault();
    setError(null);
    if (!nueva.codigo.trim() || !nueva.nombre.trim()) {
      setError("Código y nombre son obligatorios.");
      return;
    }
    setGuardando(true);
    const { error: err } = await supabase.from("cuentas").insert({
      empresa_id: empresaId,
      codigo: nueva.codigo.trim(),
      nombre: nueva.nombre.trim(),
      clase: nueva.clase,
      tipo_saldo: nueva.tipo_saldo,
    });
    setGuardando(false);
    if (err) {
      setError(
        err.message.includes("duplicate")
          ? "Ya existe una cuenta con ese código."
          : "No se pudo crear: " + err.message
      );
      return;
    }
    setNueva({ codigo: "", nombre: "", clase: "Activo", tipo_saldo: "deudor" });
    recargarCuentas();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="font-display text-lg font-semibold">Catálogo de Cuentas</h2>
        <div className="flex items-center gap-3 no-print">
          {cuentas.length > 0 && (
            <button
              onClick={exportarCatalogo}
              className="text-xs text-ledgerDark hover:underline"
            >
              Exportar a Excel
            </button>
          )}
          <label className="text-xs text-brassDark hover:underline cursor-pointer">
            {importandoArchivo ? "Importando…" : "Importar desde Excel"}
            <input
              ref={inputArchivoRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={importarDesdeArchivo}
              disabled={importandoArchivo}
              className="hidden"
            />
          </label>
          {faltantes.length > 0 && (
            <button
              onClick={importarFaltantes}
              disabled={importando}
              className="bg-brassDark text-paper px-3 py-1.5 rounded-sm text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {importando
                ? "Importando…"
                : `Importar ${faltantes.length} cuentas del catálogo`}
            </button>
          )}
        </div>
      </div>
      {(mensajeImport || mensajeArchivo) && (
        <p
          className={`text-xs mb-4 -mt-2 no-print ${
            (mensajeImport || mensajeArchivo).startsWith("No se pudo")
              ? "text-rust"
              : "text-ledger"
          }`}
        >
          {mensajeImport || mensajeArchivo}
        </p>
      )}

      <div className="bg-[#F7F4EA] border border-paperLine rounded-sm overflow-hidden mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-ink text-paper text-left">
              <th className="px-3 py-2 font-medium">Código</th>
              <th className="px-3 py-2 font-medium">Nombre</th>
              <th className="px-3 py-2 font-medium">Clase</th>
              <th className="px-3 py-2 font-medium">Saldo normal</th>
              <th className="px-3 py-2 font-medium no-print"></th>
            </tr>
          </thead>
          <tbody>
            {cuentas.map((c) => (
              <tr key={c.id} className="border-t border-paperLine">
                {editandoId === c.id ? (
                  <>
                    <td className="px-3 py-1.5">
                      <input
                        value={borrador.codigo}
                        onChange={(e) =>
                          setBorrador({ ...borrador, codigo: e.target.value })
                        }
                        className="w-20 border border-paperLine rounded-sm px-2 py-1 font-num"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        value={borrador.nombre}
                        onChange={(e) =>
                          setBorrador({ ...borrador, nombre: e.target.value })
                        }
                        className="w-full border border-paperLine rounded-sm px-2 py-1"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <select
                        value={borrador.clase}
                        onChange={(e) =>
                          setBorrador({ ...borrador, clase: e.target.value })
                        }
                        className="border border-paperLine rounded-sm px-2 py-1"
                      >
                        {CLASES.map((cl) => (
                          <option key={cl} value={cl}>
                            {cl}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <select
                        value={borrador.tipo_saldo}
                        onChange={(e) =>
                          setBorrador({ ...borrador, tipo_saldo: e.target.value })
                        }
                        className="border border-paperLine rounded-sm px-2 py-1"
                      >
                        <option value="deudor">Deudor</option>
                        <option value="acreedor">Acreedor</option>
                      </select>
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap no-print">
                      <button
                        onClick={guardarEdicion}
                        disabled={guardando}
                        className="text-ledger text-xs font-medium mr-3 hover:underline"
                      >
                        Guardar
                      </button>
                      <button
                        onClick={() => setEditandoId(null)}
                        className="text-inkSoft text-xs hover:underline"
                      >
                        Cancelar
                      </button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-1.5 font-num">{c.codigo}</td>
                    <td className="px-3 py-1.5">{c.nombre}</td>
                    <td className="px-3 py-1.5">{c.clase}</td>
                    <td className="px-3 py-1.5 capitalize">{c.tipo_saldo}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap no-print">
                      <button
                        onClick={() => empezarEdicion(c)}
                        className="text-brassDark text-xs font-medium mr-3 hover:underline"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => eliminarCuenta(c.id)}
                        className="text-rust text-xs hover:underline"
                      >
                        Eliminar
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {cuentas.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-inkSoft text-sm">
                  No hay cuentas todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <section className="bg-[#F7F4EA] border border-paperLine rounded-sm p-6 no-print">
        <h3 className="font-display text-base font-semibold mb-4">Agregar cuenta</h3>
        <form onSubmit={agregarCuenta} className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-inkSoft mb-1">Código</label>
            <input
              value={nueva.codigo}
              onChange={(e) => setNueva({ ...nueva, codigo: e.target.value })}
              className="w-full border border-paperLine rounded-sm px-2 py-1.5 text-sm font-num"
              placeholder="1103"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-inkSoft mb-1">Nombre</label>
            <input
              value={nueva.nombre}
              onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })}
              className="w-full border border-paperLine rounded-sm px-2 py-1.5 text-sm"
              placeholder="Nombre de la cuenta"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-inkSoft mb-1">Clase</label>
            <select
              value={nueva.clase}
              onChange={(e) => setNueva({ ...nueva, clase: e.target.value })}
              className="w-full border border-paperLine rounded-sm px-2 py-1.5 text-sm"
            >
              {CLASES.map((cl) => (
                <option key={cl} value={cl}>
                  {cl}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-inkSoft mb-1">Saldo normal</label>
            <select
              value={nueva.tipo_saldo}
              onChange={(e) => setNueva({ ...nueva, tipo_saldo: e.target.value })}
              className="w-full border border-paperLine rounded-sm px-2 py-1.5 text-sm"
            >
              <option value="deudor">Deudor</option>
              <option value="acreedor">Acreedor</option>
            </select>
          </div>
          <div className="col-span-2 sm:col-span-5">
            {error && <p className="text-sm text-rust mb-2">{error}</p>}
            <button
              type="submit"
              disabled={guardando}
              className="bg-ink text-paper px-4 py-2 rounded-sm text-sm font-medium hover:bg-[#2C3A52] transition-colors disabled:opacity-60"
            >
              {guardando ? "Guardando…" : "Agregar cuenta"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
