"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useEmpresa } from "@/lib/EmpresaContext";
import { formatoMoneda } from "@/lib/contabilidad";
import { etiquetaPartida } from "@/lib/partidas";
import CuentaCombobox from "@/lib/CuentaCombobox";
import { exportarAExcel } from "@/lib/exportarExcel";
import {
  r2,
  nombreMes,
  baseDepreciable,
  depreciacionMensual,
  obtenerActivos,
  obtenerDepreciaciones,
  planDepreciacion,
  depreciarMes,
  resumenBaja,
  darDeBajaActivo,
} from "@/lib/activosFijos";

const hoy = () => new Date().toISOString().slice(0, 10);
const fechaCorta = (f) => {
  const [a, m, d] = String(f || "").split("-");
  return a ? `${d}/${m}/${a}` : "";
};

function formVacio() {
  return {
    codigo: "",
    nombre: "",
    categoria: "",
    fecha_adquisicion: hoy(),
    fecha_inicio_dep: hoy(),
    costo: "",
    valor_residual: "0",
    vida_anios: "",
    tasa: "",
    cuenta_activo_id: "",
    cuenta_gasto_id: "",
    cuenta_dep_acum_id: "",
  };
}

export default function ActivosFijosPage() {
  const { empresaId, empresa, cuentas } = useEmpresa();
  const [activos, setActivos] = useState([]);
  const [deps, setDeps] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState(formVacio());
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);

  // Baja / venta de un activo
  const [bajaActivo, setBajaActivo] = useState(null);
  const [baja, setBaja] = useState(null);
  const [errorBaja, setErrorBaja] = useState(null);
  const [dandoBaja, setDandoBaja] = useState(false);

  const [mes, setMes] = useState(hoy().slice(0, 7));
  const [trabajando, setTrabajando] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  const [errorDep, setErrorDep] = useState(null);

  async function cargar() {
    setCargando(true);
    try {
      const [a, d] = await Promise.all([obtenerActivos(empresaId), obtenerDepreciaciones(empresaId)]);
      setActivos(a);
      setDeps(d);
    } catch (e) {
      setError("No se pudo cargar (¿ya corriste la migración de Activo fijo en Supabase?): " + (e.message || e));
    } finally {
      setCargando(false);
    }
  }
  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  const acumPorActivo = useMemo(() => {
    const m = new Map();
    for (const d of deps) m.set(d.activo_id, r2((m.get(d.activo_id) || 0) + Number(d.monto)));
    return m;
  }, [deps]);

  const plan = useMemo(() => planDepreciacion(activos, deps, mes), [activos, deps, mes]);
  const totalPlan = r2(plan.lineas.reduce((a, l) => a + l.monto, 0));

  // Meses ya contabilizados (una partida por mes).
  const historial = useMemo(() => {
    const m = new Map();
    for (const d of deps) {
      const k = String(d.periodo).slice(0, 7);
      const x = m.get(k) || { ym: k, total: 0, activos: 0, tx: d.transacciones, txId: d.transaccion_id };
      x.total = r2(x.total + Number(d.monto));
      x.activos += 1;
      m.set(k, x);
    }
    return [...m.values()].sort((a, b) => b.ym.localeCompare(a.ym));
  }, [deps]);

  const nombreCuenta = (id) => {
    const c = cuentas.find((x) => x.id === id);
    return c ? `${c.codigo} — ${c.nombre}` : "";
  };

  // Vida útil (años) y tasa anual (%) están ligadas: al cambiar una se recalcula la otra.
  function cambiarVida(v) {
    const n = Number(v);
    setForm((f) => ({ ...f, vida_anios: v, tasa: n > 0 ? String(r2(100 / n)) : "" }));
  }
  function cambiarTasa(v) {
    const n = Number(v);
    setForm((f) => ({ ...f, tasa: v, vida_anios: n > 0 ? String(Math.round((100 / n) * 100) / 100) : "" }));
  }

  function nuevo() {
    setEditandoId(null);
    setForm(formVacio());
    setError(null);
    setMostrarForm(true);
  }
  function editar(a) {
    setEditandoId(a.id);
    setForm({
      codigo: a.codigo || "",
      nombre: a.nombre || "",
      categoria: a.categoria || "",
      fecha_adquisicion: a.fecha_adquisicion,
      fecha_inicio_dep: a.fecha_inicio_dep,
      costo: String(a.costo),
      valor_residual: String(a.valor_residual ?? 0),
      vida_anios: String(Math.round((a.vida_util_meses / 12) * 100) / 100),
      tasa: String(a.tasa_anual || r2(1200 / a.vida_util_meses)),
      cuenta_activo_id: a.cuenta_activo_id || "",
      cuenta_gasto_id: a.cuenta_gasto_id || "",
      cuenta_dep_acum_id: a.cuenta_dep_acum_id || "",
    });
    setError(null);
    setMostrarForm(true);
  }
  function abrirBaja(a) {
    setBajaActivo(a);
    setBaja({
      tipo: "venta",
      fecha: hoy(),
      precio: "",
      iva: "no_sujeto", // al estar totalmente depreciado normalmente no se grava
      cuentaCobroId: "",
      cuentaIvaId: empresa?.cuenta_iva_debito_cf_id || empresa?.cuenta_iva_debito_ccf_id || "",
      cuentaResultadoId: "",
      cuentaActivoId: a.cuenta_activo_id || "",
    });
    setErrorBaja(null);
    setMostrarForm(false);
  }
  function cerrarBaja() {
    setBajaActivo(null);
    setBaja(null);
    setErrorBaja(null);
  }
  async function confirmarBaja(e) {
    e.preventDefault();
    setErrorBaja(null);
    const r = resumenBaja(bajaActivo, deps, { fecha: baja.fecha, tipo: baja.tipo, precio: baja.precio, conIva: baja.iva === "gravado" });
    const txt = baja.tipo === "venta" ? "la venta" : "la baja";
    if (!confirm(`Se generará UNA partida con ${txt} de «${bajaActivo.nombre}»` + (r.depPendiente > 0 ? `, incluyendo ${formatoMoneda(r.depPendiente)} de depreciación pendiente` : "") + ". ¿Continuar?")) return;
    setDandoBaja(true);
    try {
      const res = await darDeBajaActivo({
        empresaId,
        activo: bajaActivo,
        depreciaciones: deps,
        datos: { fecha: baja.fecha, tipo: baja.tipo, precio: baja.precio, conIva: baja.iva === "gravado", cuentaCobroId: baja.cuentaCobroId, cuentaIvaId: baja.cuentaIvaId, cuentaResultadoId: baja.cuentaResultadoId, cuentaActivoId: baja.cuentaActivoId },
      });
      setMensaje(`${baja.tipo === "venta" ? "Venta" : "Baja"} de «${bajaActivo.nombre}» contabilizada (partida DIA-${String(res.numero).padStart(4, "0")}).`);
      cerrarBaja();
      await cargar();
    } catch (err) {
      setErrorBaja("No se pudo registrar: " + (err.message || err));
    } finally {
      setDandoBaja(false);
    }
  }

  function cancelar() {
    setMostrarForm(false);
    setEditandoId(null);
    setError(null);
  }

  async function guardar(e) {
    e.preventDefault();
    setError(null);
    const costo = Number(form.costo);
    const residual = Number(form.valor_residual || 0);
    const meses = Math.round(Number(form.vida_anios) * 12);
    if (!form.nombre.trim()) return setError("El nombre del activo es obligatorio.");
    if (!(costo > 0)) return setError("El costo debe ser mayor que cero.");
    if (residual < 0 || residual >= costo) return setError("El valor residual debe ser menor que el costo.");
    if (!(meses > 0)) return setError("Indica la vida útil (años) o la tasa de depreciación.");
    if (!form.cuenta_gasto_id || !form.cuenta_dep_acum_id) return setError("Elige la cuenta de gasto por depreciación y la de depreciación acumulada.");

    setGuardando(true);
    let codigo = form.codigo.trim();
    if (!codigo) {
      const n = activos.length + 1;
      codigo = `AF-${String(n).padStart(3, "0")}`;
    }
    const datos = {
      codigo,
      nombre: form.nombre.trim(),
      categoria: form.categoria.trim() || null,
      fecha_adquisicion: form.fecha_adquisicion,
      fecha_inicio_dep: form.fecha_inicio_dep || form.fecha_adquisicion,
      costo: r2(costo),
      valor_residual: r2(residual),
      vida_util_meses: meses,
      tasa_anual: r2(1200 / meses),
      cuenta_activo_id: form.cuenta_activo_id || null,
      cuenta_gasto_id: form.cuenta_gasto_id,
      cuenta_dep_acum_id: form.cuenta_dep_acum_id,
    };
    const { error: err } = editandoId
      ? await supabase.from("activos_fijos").update(datos).eq("id", editandoId)
      : await supabase.from("activos_fijos").insert({ empresa_id: empresaId, ...datos });
    setGuardando(false);
    if (err) return setError("No se pudo guardar: " + err.message);
    cancelar();
    cargar();
  }

  async function eliminar(a) {
    if (acumPorActivo.get(a.id)) {
      alert("Este activo ya tiene depreciaciones contabilizadas. Elimina primero esas partidas en el Libro diario.");
      return;
    }
    if (!confirm(`¿Eliminar el activo «${a.nombre}»?`)) return;
    const { error: err } = await supabase.from("activos_fijos").delete().eq("id", a.id);
    if (err) return alert("No se pudo eliminar: " + err.message);
    cargar();
  }

  async function depreciar() {
    setErrorDep(null);
    setMensaje(null);
    if (!confirm(`Se generará UNA partida con la depreciación de ${plan.lineas.length} activo(s) de ${nombreMes(mes)} por ${formatoMoneda(totalPlan)}. ¿Continuar?`)) return;
    setTrabajando(true);
    try {
      const r = await depreciarMes({ empresaId, activos, depreciaciones: deps, ym: mes });
      setMensaje(`Depreciación de ${nombreMes(mes)} contabilizada: ${r.activos} activo(s) por ${formatoMoneda(r.total)} (partida DIA-${String(r.numero).padStart(4, "0")}).`);
      await cargar();
    } catch (e) {
      setErrorDep("No se pudo depreciar: " + (e.message || e));
    } finally {
      setTrabajando(false);
    }
  }

  function exportar() {
    const filas = [
      [empresa?.nombre || ""],
      ["Propiedad, planta y equipo — cuadro de depreciación (línea recta)"],
      [],
      ["Código", "Activo", "Adquisición", "Costo", "Valor residual", "Vida útil (años)", "Tasa anual %", "Dep. mensual", "Dep. acumulada", "Valor en libros"],
    ];
    for (const a of activos) {
      const ac = acumPorActivo.get(a.id) || 0;
      filas.push([a.codigo, a.nombre, fechaCorta(a.fecha_adquisicion), Number(a.costo), Number(a.valor_residual), a.vida_util_meses / 12, Number(a.tasa_anual), depreciacionMensual(a), ac, r2(Number(a.costo) - ac)]);
    }
    exportarAExcel("activo-fijo", [{ nombre: "Activo fijo", filas }]);
  }

  if (cargando) return <p className="text-inkSoft text-sm">Cargando activo fijo…</p>;

  const m = (n) => formatoMoneda(n);
  const inp = "w-full border border-paperLine rounded-sm px-2 py-1 text-sm bg-white";
  const lbl = "block text-xs font-medium text-inkSoft mb-1";
  const vigentes = activos.filter((x) => x.estado !== "baja");
  const totCosto = vigentes.reduce((a, x) => a + Number(x.costo), 0);
  const totAcum = vigentes.reduce((a, x) => a + (acumPorActivo.get(x.id) || 0), 0);
  const resBaja = bajaActivo && baja ? resumenBaja(bajaActivo, deps, { fecha: baja.fecha, tipo: baja.tipo, precio: baja.precio, conIva: baja.iva === "gravado" }) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <h2 className="font-display text-lg font-semibold">Propiedad, planta y equipo (Activo fijo)</h2>
        <div className="flex items-center gap-3">
          <button onClick={nuevo} className="sac-btn sac-btn-primario font-medium">+ Nuevo activo</button>
          <button onClick={() => window.print()} className="text-xs text-inkSoft hover:text-ink underline underline-offset-2">Imprimir</button>
          {activos.length > 0 && <button onClick={exportar} className="text-xs text-ledgerDark hover:underline">Exportar a Excel</button>}
        </div>
      </div>

      {error && !mostrarForm && <p className="text-sm text-rust">{error}</p>}

      {mostrarForm && (
        <form onSubmit={guardar} className="no-print bg-[#F7F4EA] border border-paperLine rounded-sm p-4 space-y-4">
          <p className="text-xs font-semibold text-inkSoft uppercase tracking-wide">{editandoId ? "Editar activo" : "Nuevo activo"}</p>
          <div className="grid sm:grid-cols-3 gap-3">
            <div><label className={lbl}>Código (opcional)</label><input className={inp} value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} placeholder="AF-001" /></div>
            <div className="sm:col-span-2"><label className={lbl}>Nombre del activo</label><input className={inp} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej. Computadora portátil" /></div>
            <div><label className={lbl}>Categoría (opcional)</label><input className={inp} value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} placeholder="Equipo de cómputo" /></div>
            <div><label className={lbl}>Fecha de adquisición</label><input type="date" className={inp} value={form.fecha_adquisicion} onChange={(e) => setForm({ ...form, fecha_adquisicion: e.target.value, fecha_inicio_dep: form.fecha_inicio_dep === form.fecha_adquisicion ? e.target.value : form.fecha_inicio_dep })} /></div>
            <div><label className={lbl}>Inicia a depreciar</label><input type="date" className={inp} value={form.fecha_inicio_dep} onChange={(e) => setForm({ ...form, fecha_inicio_dep: e.target.value })} /></div>
            <div><label className={lbl}>Costo de adquisición</label><input type="number" step="0.01" min="0" className={inp + " font-num"} value={form.costo} onChange={(e) => setForm({ ...form, costo: e.target.value })} /></div>
            <div><label className={lbl}>Valor residual</label><input type="number" step="0.01" min="0" className={inp + " font-num"} value={form.valor_residual} onChange={(e) => setForm({ ...form, valor_residual: e.target.value })} /></div>
            <div><label className={lbl}>Vida útil (años)</label><input type="number" step="0.01" min="0" className={inp + " font-num"} value={form.vida_anios} onChange={(e) => cambiarVida(e.target.value)} /></div>
            <div><label className={lbl}>Tasa de depreciación anual (%)</label><input type="number" step="0.01" min="0" className={inp + " font-num"} value={form.tasa} onChange={(e) => cambiarTasa(e.target.value)} /></div>
          </div>
          <p className="text-xs text-inkSoft">Línea recta: (costo − valor residual) ÷ meses de vida útil. Vida útil y tasa se calculan una a partir de la otra.</p>
          <div className="grid sm:grid-cols-3 gap-3">
            <div><label className={lbl}>Cuenta del activo (catálogo)</label><CuentaCombobox cuentas={cuentas} value={form.cuenta_activo_id} onChange={(id) => setForm({ ...form, cuenta_activo_id: id })} /></div>
            <div><label className={lbl}>Gasto por depreciación</label><CuentaCombobox cuentas={cuentas} value={form.cuenta_gasto_id} onChange={(id) => setForm({ ...form, cuenta_gasto_id: id })} /></div>
            <div><label className={lbl}>Depreciación acumulada</label><CuentaCombobox cuentas={cuentas} value={form.cuenta_dep_acum_id} onChange={(id) => setForm({ ...form, cuenta_dep_acum_id: id })} /></div>
          </div>
          {error && <p className="text-xs text-rust">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={guardando} className="bg-brand text-onBrand px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-brandDark disabled:opacity-60">{guardando ? "Guardando…" : editandoId ? "Guardar cambios" : "Guardar activo"}</button>
            <button type="button" onClick={cancelar} className="px-3 py-1.5 rounded-sm text-xs font-medium text-inkSoft hover:underline">Cancelar</button>
          </div>
        </form>
      )}

      {bajaActivo && baja && (
        <form onSubmit={confirmarBaja} className="no-print bg-[#F7F4EA] border border-paperLine rounded-sm p-4 space-y-4">
          <p className="text-xs font-semibold text-inkSoft uppercase tracking-wide">Dar de baja / vender — {bajaActivo.codigo} {bajaActivo.nombre}</p>
          <div className="grid sm:grid-cols-4 gap-3">
            <div>
              <label className={lbl}>Operación</label>
              <select className={inp} value={baja.tipo} onChange={(e) => setBaja({ ...baja, tipo: e.target.value })}>
                <option value="venta">Venta</option>
                <option value="baja">Baja sin venta (desecho / pérdida)</option>
              </select>
            </div>
            <div><label className={lbl}>Fecha</label><input type="date" className={inp} value={baja.fecha} onChange={(e) => setBaja({ ...baja, fecha: e.target.value })} /></div>
            {baja.tipo === "venta" && (
              <>
                <div><label className={lbl}>Precio de venta (sin IVA)</label><input type="number" step="0.01" min="0" className={inp + " font-num"} value={baja.precio} onChange={(e) => setBaja({ ...baja, precio: e.target.value })} /></div>
                <div>
                  <label className={lbl}>IVA</label>
                  <select className={inp} value={baja.iva} onChange={(e) => setBaja({ ...baja, iva: e.target.value })}>
                    <option value="no_sujeto">No sujeto</option>
                    <option value="gravado">Gravado 13%</option>
                  </select>
                </div>
              </>
            )}
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {baja.tipo === "venta" && <div><label className={lbl}>Cuenta donde se recibe el cobro</label><CuentaCombobox cuentas={cuentas} value={baja.cuentaCobroId} onChange={(id) => setBaja({ ...baja, cuentaCobroId: id })} /></div>}
            {baja.tipo === "venta" && baja.iva === "gravado" && <div><label className={lbl}>IVA débito fiscal</label><CuentaCombobox cuentas={cuentas} value={baja.cuentaIvaId} onChange={(id) => setBaja({ ...baja, cuentaIvaId: id })} /></div>}
            <div><label className={lbl}>Cuenta del activo (se acredita)</label><CuentaCombobox cuentas={cuentas} value={baja.cuentaActivoId} onChange={(id) => setBaja({ ...baja, cuentaActivoId: id })} /></div>
            <div><label className={lbl}>Ganancia / pérdida en {baja.tipo === "venta" ? "venta" : "baja"} de activo</label><CuentaCombobox cuentas={cuentas} value={baja.cuentaResultadoId} onChange={(id) => setBaja({ ...baja, cuentaResultadoId: id })} /></div>
          </div>
          {resBaja && (
            <table className="text-xs bg-white border border-paperLine">
              <tbody>
                <tr><td className="px-2 py-1">Costo del activo</td><td className="px-2 py-1 text-right font-num tabular">{m(bajaActivo.costo)}</td></tr>
                <tr><td className="px-2 py-1">Depreciación acumulada{resBaja.depPendiente > 0 ? ` (incluye ${m(resBaja.depPendiente)} pendiente, ${resBaja.pendientes.length} mes(es))` : ""}</td><td className="px-2 py-1 text-right font-num tabular">{m(resBaja.acumTotal)}</td></tr>
                <tr className="border-t border-paperLine font-semibold"><td className="px-2 py-1">Valor en libros</td><td className="px-2 py-1 text-right font-num tabular">{m(resBaja.valorLibros)}</td></tr>
                {baja.tipo === "venta" && <tr><td className="px-2 py-1">Precio de venta{resBaja.iva > 0 ? ` + IVA ${m(resBaja.iva)}` : " (IVA no sujeto)"}</td><td className="px-2 py-1 text-right font-num tabular">{m(resBaja.cobro)}</td></tr>}
                <tr className="font-semibold"><td className="px-2 py-1">{resBaja.resultado >= 0 ? "Ganancia" : "Pérdida"}</td><td className="px-2 py-1 text-right font-num tabular">{m(Math.abs(resBaja.resultado))}</td></tr>
              </tbody>
            </table>
          )}
          {errorBaja && <p className="text-xs text-rust">{errorBaja}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={dandoBaja} className="bg-brand text-onBrand px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-brandDark disabled:opacity-60">{dandoBaja ? "Contabilizando…" : "Contabilizar"}</button>
            <button type="button" onClick={cerrarBaja} className="px-3 py-1.5 rounded-sm text-xs font-medium text-inkSoft hover:underline">Cancelar</button>
          </div>
        </form>
      )}

      <section className="partida-imprimir bg-white border border-paperLine px-6 py-5 text-[12px] text-black">
        <div className="text-center mb-3">
          <p className="text-[11px] uppercase">{empresa?.nombre}</p>
          <p className="text-base font-bold">Cuadro de propiedad, planta y equipo</p>
        </div>
        {activos.length === 0 ? (
          <p className="text-inkSoft text-sm">Aún no hay activos registrados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border border-black">
                  <th className="text-left px-2 py-0.5">Código</th>
                  <th className="text-left px-2 py-0.5">Activo</th>
                  <th className="text-left px-2 py-0.5">Adquisición</th>
                  <th className="text-right px-2 py-0.5">Costo</th>
                  <th className="text-right px-2 py-0.5">Vida / tasa</th>
                  <th className="text-right px-2 py-0.5">Dep. mensual</th>
                  <th className="text-right px-2 py-0.5">Dep. acumulada</th>
                  <th className="text-right px-2 py-0.5">Valor en libros</th>
                  <th className="no-print" />
                </tr>
              </thead>
              <tbody>
                {activos.map((a) => {
                  const ac = acumPorActivo.get(a.id) || 0;
                  const dadoDeBaja = a.estado === "baja";
                  return (
                    <tr key={a.id} className={dadoDeBaja ? "text-inkSoft" : ""}>
                      <td className="px-2 py-[2px] align-top">{a.codigo}</td>
                      <td className="px-2 py-[2px] align-top">{a.nombre}{a.categoria ? <span className="block text-[10px] text-inkSoft">{a.categoria}</span> : null}{dadoDeBaja ? <span className="block text-[10px] text-rust">{a.tipo_baja === "venta" ? "Vendido" : "Dado de baja"} el {fechaCorta(a.fecha_baja)}{a.tipo_baja === "venta" && a.precio_venta != null ? ` por ${m(a.precio_venta)}` : ""}</span> : null}</td>
                      <td className="px-2 py-[2px] align-top">{fechaCorta(a.fecha_adquisicion)}</td>
                      <td className="px-2 py-[2px] text-right font-num tabular align-top">{m(a.costo)}</td>
                      <td className="px-2 py-[2px] text-right align-top">{a.vida_util_meses / 12} años · {Number(a.tasa_anual)}%</td>
                      <td className="px-2 py-[2px] text-right font-num tabular align-top">{m(depreciacionMensual(a))}</td>
                      <td className="px-2 py-[2px] text-right font-num tabular align-top">{m(ac)}</td>
                      <td className="px-2 py-[2px] text-right font-num tabular align-top">{dadoDeBaja ? "—" : m(Number(a.costo) - ac)}</td>
                      <td className="no-print px-2 py-[2px] whitespace-nowrap align-top text-xs">
                        {dadoDeBaja ? (
                          <span className="text-inkSoft">Para revertir, elimina su partida en el Libro diario</span>
                        ) : (
                          <>
                            <button onClick={() => editar(a)} className="text-accentDark hover:underline mr-2">Editar</button>
                            <button onClick={() => abrirBaja(a)} className="text-accentDark hover:underline mr-2">Baja / vender</button>
                            <button onClick={() => eliminar(a)} className="text-rust hover:underline">Eliminar</button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  <td colSpan={3} className="text-right font-bold px-2 pt-3">Totales:</td>
                  <td className="px-2 pt-3 text-right font-num tabular font-semibold border-t border-black">{m(totCosto)}</td>
                  <td colSpan={2} />
                  <td className="px-2 pt-3 text-right font-num tabular font-semibold border-t border-black">{m(totAcum)}</td>
                  <td className="px-2 pt-3 text-right font-num tabular font-semibold border-t border-black">{m(totCosto - totAcum)}</td>
                  <td className="no-print" />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="no-print border border-paperLine bg-[#F7F4EA] rounded-sm p-4 space-y-3">
        <p className="text-sm font-medium">Depreciar mes</p>
        <div className="flex flex-wrap items-end gap-4 text-xs text-inkSoft">
          <label>
            <span className="block mb-1">Mes a depreciar</span>
            <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="border border-paperLine rounded-sm px-2 py-1 bg-white text-ink text-sm" />
          </label>
        </div>
        {plan.lineas.length > 0 ? (
          <>
            <table className="w-full text-xs bg-white border border-paperLine">
              <thead><tr className="bg-[#F7F4EA]"><th className="text-left px-2 py-1">Activo</th><th className="text-left px-2 py-1">Gasto / Dep. acumulada</th><th className="text-right px-2 py-1">Monto</th></tr></thead>
              <tbody>
                {plan.lineas.map((l) => (
                  <tr key={l.activo.id} className="border-t border-paperLine">
                    <td className="px-2 py-1">{l.activo.codigo} — {l.activo.nombre}</td>
                    <td className="px-2 py-1 text-inkSoft">{nombreCuenta(l.activo.cuenta_gasto_id)} / {nombreCuenta(l.activo.cuenta_dep_acum_id)}</td>
                    <td className="px-2 py-1 text-right font-num tabular">{m(l.monto)}</td>
                  </tr>
                ))}
                <tr className="border-t border-paperLine font-semibold"><td colSpan={2} className="px-2 py-1 text-right">Total</td><td className="px-2 py-1 text-right font-num tabular">{m(totalPlan)}</td></tr>
              </tbody>
            </table>
            <button onClick={depreciar} disabled={trabajando} className="sac-btn sac-btn-primario font-medium">{trabajando ? "Contabilizando…" : `Depreciar ${nombreMes(mes)}`}</button>
          </>
        ) : (
          <p className="text-xs text-inkSoft">No hay activos por depreciar en {nombreMes(mes)}.</p>
        )}
        {plan.omitidos.length > 0 && (
          <ul className="text-xs text-inkSoft list-disc ml-5">
            {plan.omitidos.map((o) => <li key={o.activo.id}>{o.activo.codigo} — {o.activo.nombre}: {o.motivo}</li>)}
          </ul>
        )}
        {mensaje && <p className="text-sm text-ledgerDark">{mensaje}</p>}
        {errorDep && <p className="text-sm text-rust">{errorDep}</p>}
      </section>

      {historial.length > 0 && (
        <section className="no-print border border-paperLine bg-white rounded-sm p-4">
          <p className="text-sm font-medium mb-2">Meses ya contabilizados</p>
          <ul className="text-sm space-y-1">
            {historial.map((h) => (
              <li key={h.ym}>
                {nombreMes(h.ym)} — {h.activos} activo(s) por {m(h.total)}
                {h.tx ? ` · partida ${etiquetaPartida(h.tx.tipo, h.tx.numero_partida)}` : ""}
              </li>
            ))}
          </ul>
          <p className="text-xs text-inkSoft mt-3">Para revertir un mes, elimina su partida en el <Link className="underline" href={`/empresa/${empresaId}/transacciones`}>Libro diario</Link>: el mes queda pendiente otra vez.</p>
        </section>
      )}
    </div>
  );
}
