"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useEmpresa } from "@/lib/EmpresaContext";
import { obtenerPartidas, formatoMoneda } from "@/lib/contabilidad";
import CuentaCombobox from "@/lib/CuentaCombobox";
import { exportarAExcel } from "@/lib/exportarExcel";

function lineaVacia() {
  return { cuenta_id: "", debe: "", haber: "" };
}

function formularioVacio() {
  return {
    fecha: new Date().toISOString().slice(0, 10),
    descripcion: "",
    elaborado_por: "",
    revisado_por: "",
    lineas: [lineaVacia(), lineaVacia()],
  };
}

export default function TransaccionesPage() {
  const { cuentas, empresaId } = useEmpresa();

  const [form, setForm] = useState(formularioVacio());
  const [editandoId, setEditandoId] = useState(null);
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const [partidas, setPartidas] = useState([]);
  const [cargandoPartidas, setCargandoPartidas] = useState(true);

  async function cargarPartidas() {
    setCargandoPartidas(true);
    try {
      const data = await obtenerPartidas(empresaId);
      setPartidas(data);
    } finally {
      setCargandoPartidas(false);
    }
  }

  useEffect(() => {
    cargarPartidas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  const totalDebe = useMemo(
    () => form.lineas.reduce((a, l) => a + (Number(l.debe) || 0), 0),
    [form.lineas]
  );
  const totalHaber = useMemo(
    () => form.lineas.reduce((a, l) => a + (Number(l.haber) || 0), 0),
    [form.lineas]
  );
  const cuadra = totalDebe === totalHaber && totalDebe > 0;

  function exportarDiario() {
    const filas = [["Partida N.°", "Fecha", "Cuenta", "Debe", "Haber", "Elaborado por", "Revisado por"]];
    for (const p of partidas) {
      p.movimientos.forEach((m, i) => {
        filas.push([
          i === 0 ? p.numero_partida : "",
          i === 0 ? p.fecha : "",
          `${m.cuentas.codigo} — ${m.cuentas.nombre}`,
          m.debe > 0 ? m.debe : "",
          m.haber > 0 ? m.haber : "",
          i === 0 ? p.elaborado_por || "" : "",
          i === 0 ? p.revisado_por || "" : "",
        ]);
      });
      filas.push([]);
    }
    exportarAExcel("libro-diario", [{ nombre: "Libro Diario", filas }]);
  }

  function actualizarCampo(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  function actualizarLinea(idx, campo, valor) {
    setForm((f) => {
      const copia = [...f.lineas];
      copia[idx] = { ...copia[idx], [campo]: valor };
      if (campo === "debe" && valor) copia[idx].haber = "";
      if (campo === "haber" && valor) copia[idx].debe = "";
      return { ...f, lineas: copia };
    });
  }

  function agregarLinea() {
    setForm((f) => ({ ...f, lineas: [...f.lineas, lineaVacia()] }));
  }

  function quitarLinea(idx) {
    if (form.lineas.length <= 2) return;
    setForm((f) => ({ ...f, lineas: f.lineas.filter((_, i) => i !== idx) }));
  }

  function empezarEdicion(p) {
    setEditandoId(p.id);
    setForm({
      fecha: p.fecha,
      descripcion: p.descripcion,
      elaborado_por: p.elaborado_por || "",
      revisado_por: p.revisado_por || "",
      lineas: p.movimientos.map((m) => ({
        cuenta_id: m.cuenta_id || cuentas.find((c) => c.codigo === m.cuentas?.codigo)?.id || "",
        debe: m.debe > 0 ? String(m.debe) : "",
        haber: m.haber > 0 ? String(m.haber) : "",
      })),
    });
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelarEdicion() {
    setEditandoId(null);
    setForm(formularioVacio());
    setError(null);
  }

  async function eliminarPartida(id) {
    if (!confirm("¿Eliminar esta partida? Esta acción no se puede deshacer.")) return;
    const { error: err } = await supabase.from("transacciones").delete().eq("id", id);
    if (err) {
      alert("No se pudo eliminar: " + err.message);
      return;
    }
    if (editandoId === id) cancelarEdicion();
    cargarPartidas();
  }

  async function guardarPartida(e) {
    e.preventDefault();
    setError(null);

    const lineasValidas = form.lineas.filter(
      (l) => l.cuenta_id && (Number(l.debe) > 0 || Number(l.haber) > 0)
    );

    if (lineasValidas.length < 2) {
      setError("Agrega al menos dos líneas con cuenta y monto.");
      return;
    }
    if (!cuadra) {
      setError("La suma del Debe debe ser igual a la suma del Haber (y mayor que cero).");
      return;
    }
    if (!form.descripcion.trim()) {
      setError("Escribe una descripción (glosa) de la partida.");
      return;
    }

    setGuardando(true);

    if (editandoId) {
      // Modo edición: actualiza el encabezado y reemplaza las líneas.
      const { error: errTx } = await supabase
        .from("transacciones")
        .update({
          fecha: form.fecha,
          descripcion: form.descripcion.trim(),
          elaborado_por: form.elaborado_por.trim() || null,
          revisado_por: form.revisado_por.trim() || null,
        })
        .eq("id", editandoId);

      if (errTx) {
        setError("No se pudo actualizar: " + errTx.message);
        setGuardando(false);
        return;
      }

      const { error: errDel } = await supabase
        .from("movimientos")
        .delete()
        .eq("transaccion_id", editandoId);

      if (errDel) {
        setError("No se pudieron actualizar las líneas: " + errDel.message);
        setGuardando(false);
        return;
      }

      const movimientos = lineasValidas.map((l) => ({
        transaccion_id: editandoId,
        cuenta_id: l.cuenta_id,
        debe: Number(l.debe) || 0,
        haber: Number(l.haber) || 0,
      }));

      const { error: errMov } = await supabase.from("movimientos").insert(movimientos);

      if (errMov) {
        setError("Se actualizó la partida, pero fallaron las líneas: " + errMov.message);
        setGuardando(false);
        return;
      }

      cancelarEdicion();
      setGuardando(false);
      cargarPartidas();
      return;
    }

    // Modo creación
    const siguienteNumero =
      partidas.length > 0 ? Math.max(...partidas.map((p) => p.numero_partida)) + 1 : 1;

    const { data: transaccion, error: errTx } = await supabase
      .from("transacciones")
      .insert({
        empresa_id: empresaId,
        fecha: form.fecha,
        descripcion: form.descripcion.trim(),
        numero_partida: siguienteNumero,
        elaborado_por: form.elaborado_por.trim() || null,
        revisado_por: form.revisado_por.trim() || null,
      })
      .select()
      .single();

    if (errTx) {
      setError("No se pudo registrar la partida: " + errTx.message);
      setGuardando(false);
      return;
    }

    const movimientos = lineasValidas.map((l) => ({
      transaccion_id: transaccion.id,
      cuenta_id: l.cuenta_id,
      debe: Number(l.debe) || 0,
      haber: Number(l.haber) || 0,
    }));

    const { error: errMov } = await supabase.from("movimientos").insert(movimientos);

    if (errMov) {
      setError("Partida creada, pero fallaron las líneas: " + errMov.message);
      setGuardando(false);
      return;
    }

    setForm(formularioVacio());
    setGuardando(false);
    cargarPartidas();
  }

  return (
    <div>
      <h2 className="font-display text-lg font-semibold mb-4">
        {editandoId ? "Editar Partida" : "Registrar Partida"}
      </h2>

      <section className="bg-[#F7F4EA] border border-paperLine rounded-sm p-6 mb-10 no-print">
        <form onSubmit={guardarPartida} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-inkSoft mb-1">Fecha</label>
              <input
                type="date"
                value={form.fecha}
                onChange={(e) => actualizarCampo("fecha", e.target.value)}
                className="w-full border border-paperLine rounded-sm px-2 py-1.5 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-inkSoft mb-1">
                Descripción / Glosa
              </label>
              <input
                value={form.descripcion}
                onChange={(e) => actualizarCampo("descripcion", e.target.value)}
                placeholder="Ej. Compra de mobiliario al contado"
                className="w-full border border-paperLine rounded-sm px-2 py-1.5 text-sm"
              />
            </div>
          </div>

          <div className="border border-paperLine rounded-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-ink text-paper text-left">
                  <th className="px-3 py-2 font-medium">Cuenta</th>
                  <th className="px-3 py-2 font-medium w-32">Debe</th>
                  <th className="px-3 py-2 font-medium w-32">Haber</th>
                  <th className="px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {form.lineas.map((l, idx) => (
                  <tr key={idx} className="border-t border-paperLine">
                    <td className="px-3 py-1.5">
                      <CuentaCombobox
                        cuentas={cuentas}
                        value={l.cuenta_id}
                        onChange={(id) => actualizarLinea(idx, "cuenta_id", id)}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={l.debe}
                        onChange={(e) => actualizarLinea(idx, "debe", e.target.value)}
                        className="w-full border border-paperLine rounded-sm px-2 py-1 text-sm font-num text-right"
                        placeholder="0.00"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={l.haber}
                        onChange={(e) => actualizarLinea(idx, "haber", e.target.value)}
                        className="w-full border border-paperLine rounded-sm px-2 py-1 text-sm font-num text-right"
                        placeholder="0.00"
                      />
                    </td>
                    <td className="px-1 py-1.5 text-center">
                      {form.lineas.length > 2 && (
                        <button
                          type="button"
                          onClick={() => quitarLinea(idx)}
                          className="text-rust text-xs"
                          title="Quitar línea"
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-paperLine font-medium">
                  <td className="px-3 py-2 text-right text-xs text-inkSoft">Totales</td>
                  <td className="px-3 py-2 font-num text-right tabular">
                    {formatoMoneda(totalDebe)}
                  </td>
                  <td className="px-3 py-2 font-num text-right tabular">
                    {formatoMoneda(totalHaber)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={agregarLinea}
              className="text-sm text-brassDark hover:underline"
            >
              + Agregar línea
            </button>
            <span className={`text-xs ${cuadra ? "text-ledger" : "text-rust"}`}>
              {cuadra
                ? "✓ La partida cuadra"
                : `Diferencia: ${formatoMoneda(Math.abs(totalDebe - totalHaber))}`}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-inkSoft mb-1">
                Elaborado por
              </label>
              <input
                value={form.elaborado_por}
                onChange={(e) => actualizarCampo("elaborado_por", e.target.value)}
                placeholder="Nombre de quien elabora"
                className="w-full border border-paperLine rounded-sm px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-inkSoft mb-1">
                Revisado por
              </label>
              <input
                value={form.revisado_por}
                onChange={(e) => actualizarCampo("revisado_por", e.target.value)}
                placeholder="Nombre de quien revisa"
                className="w-full border border-paperLine rounded-sm px-2 py-1.5 text-sm"
              />
            </div>
          </div>

          {error && <p className="text-sm text-rust">{error}</p>}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={guardando || cuentas.length === 0}
              className="bg-ink text-paper px-4 py-2 rounded-sm text-sm font-medium hover:bg-[#2C3A52] transition-colors disabled:opacity-60"
            >
              {guardando
                ? "Guardando…"
                : editandoId
                ? "Guardar cambios"
                : "Registrar partida"}
            </button>
            {editandoId && (
              <button
                type="button"
                onClick={cancelarEdicion}
                className="text-sm text-inkSoft hover:text-ink underline underline-offset-2"
              >
                Cancelar edición
              </button>
            )}
          </div>
          {cuentas.length === 0 && (
            <p className="text-xs text-inkSoft">
              Primero agrega cuentas en la pestaña "Cuentas".
            </p>
          )}
        </form>
      </section>

      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-lg font-semibold">
          Reporte de Partidas (Libro Diario)
        </h2>
        <button
          onClick={() => window.print()}
          className="text-xs text-inkSoft hover:text-ink underline underline-offset-2 no-print"
        >
          Imprimir
        </button>
      </div>

      {partidas.length > 0 && (
        <button
          onClick={exportarDiario}
          className="text-xs text-ledgerDark hover:underline no-print mb-4 inline-block"
        >
          Exportar a Excel
        </button>
      )}

      {cargandoPartidas ? (
        <p className="text-inkSoft text-sm">Cargando partidas…</p>
      ) : partidas.length === 0 ? (
        <p className="text-inkSoft text-sm">Todavía no hay partidas registradas.</p>
      ) : (
        <div className="space-y-4">
          {partidas.map((p) => {
            const subDebe = p.movimientos.reduce((a, m) => a + Number(m.debe), 0);
            const subHaber = p.movimientos.reduce((a, m) => a + Number(m.haber), 0);
            return (
              <div
                key={p.id}
                className="partida-imprimir bg-[#F7F4EA] border border-paperLine rounded-sm overflow-hidden"
              >
                <div className="flex items-center justify-between px-4 py-2 bg-paperLine/30 text-xs">
                  <span className="font-medium">
                    Partida N.° {p.numero_partida} — {p.fecha}
                  </span>
                  <span className="text-inkSoft italic">{p.descripcion}</span>
                  <span className="flex items-center gap-3 no-print">
                    <button
                      onClick={() => empezarEdicion(p)}
                      className="text-brassDark font-medium hover:underline"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => eliminarPartida(p.id)}
                      className="text-rust hover:underline"
                    >
                      Eliminar
                    </button>
                  </span>
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {p.movimientos.map((m) => (
                      <tr key={m.id} className="border-t border-paperLine">
                        <td className="px-4 py-1.5">
                          {m.debe > 0 ? "" : "     "}
                          {m.cuentas.codigo} — {m.cuentas.nombre}
                        </td>
                        <td className="px-3 py-1.5 w-28 font-num text-right tabular">
                          {m.debe > 0 ? formatoMoneda(m.debe) : ""}
                        </td>
                        <td className="px-3 py-1.5 w-28 font-num text-right tabular">
                          {m.haber > 0 ? formatoMoneda(m.haber) : ""}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t border-paperLine text-xs text-inkSoft">
                      <td className="px-4 py-1 text-right">Subtotal</td>
                      <td className="px-3 py-1 font-num text-right tabular">
                        {formatoMoneda(subDebe)}
                      </td>
                      <td className="px-3 py-1 font-num text-right tabular">
                        {formatoMoneda(subHaber)}
                      </td>
                    </tr>
                    {(p.elaborado_por || p.revisado_por) && (
                      <tr className="border-t border-paperLine text-xs text-inkSoft">
                        <td colSpan={3} className="px-4 py-1.5">
                          {p.elaborado_por && <span>Elaborado por: {p.elaborado_por}</span>}
                          {p.elaborado_por && p.revisado_por && <span> &nbsp;•&nbsp; </span>}
                          {p.revisado_por && <span>Revisado por: {p.revisado_por}</span>}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
