"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useEmpresa } from "@/lib/EmpresaContext";
import { formatoMoneda } from "@/lib/contabilidad";
import { exportarAExcel } from "@/lib/exportarExcel";
import { obtenerEmpleados, obtenerConfig, calcularPrestaciones, r2 } from "@/lib/rrhh";

const hoy = () => new Date().toISOString().slice(0, 10);
const fechaCorta = (f) => {
  const [a, m, d] = String(f || "").split("-");
  return a ? `${d}/${m}/${a}` : "";
};
// DUI: 8 dígitos + guion + dígito verificador
const formatoDui = (v) => {
  const d = String(v).replace(/\D/g, "").slice(0, 9);
  return d.length > 8 ? `${d.slice(0, 8)}-${d.slice(8)}` : d;
};
const formatoTel = (v) => {
  const d = String(v).replace(/\D/g, "").slice(0, 8);
  return d.length > 4 ? `${d.slice(0, 4)}-${d.slice(4)}` : d;
};

const vacio = () => ({
  codigo: "", nombre: "", dui: "", nit: "", numero_isss: "", numero_afp: "", telefono: "", correo: "", direccion: "", cargo: "",
  fecha_ingreso: hoy(), sueldo: "", periodicidad: "mensual", aplica_isss: true, aplica_afp: true, estado: "activo", fecha_retiro: "",
});

export default function EmpleadosPage() {
  const { empresaId, empresa } = useEmpresa();
  const [empleados, setEmpleados] = useState([]);
  const [cfg, setCfg] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState(vacio());
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [verPrest, setVerPrest] = useState(null);
  const [fechaPrest, setFechaPrest] = useState(hoy());

  async function cargar() {
    setCargando(true);
    try {
      const [e, c] = await Promise.all([obtenerEmpleados(empresaId), obtenerConfig(empresaId)]);
      setEmpleados(e);
      setCfg(c);
    } catch (e) {
      setError("No se pudo cargar (¿ya corriste la migración de Recursos humanos en Supabase?): " + (e.message || e));
    } finally {
      setCargando(false);
    }
  }
  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  function nuevo() {
    setEditandoId(null);
    setForm(vacio());
    setError(null);
    setMostrarForm(true);
  }
  function editar(e) {
    setEditandoId(e.id);
    const f = vacio();
    for (const k of Object.keys(f)) if (e[k] !== null && e[k] !== undefined) f[k] = e[k];
    setForm(f);
    setError(null);
    setMostrarForm(true);
  }
  function cancelar() {
    setMostrarForm(false);
    setEditandoId(null);
    setError(null);
  }

  async function guardar(ev) {
    ev.preventDefault();
    setError(null);
    if (!form.nombre.trim()) return setError("El nombre es obligatorio.");
    if (!form.fecha_ingreso) return setError("La fecha de ingreso es obligatoria.");
    if (!(Number(form.sueldo) > 0)) return setError("Indica el sueldo mensual.");
    if (form.dui && !/^\d{8}-\d$/.test(form.dui)) return setError("El DUI debe tener el formato 00000000-0.");
    if (form.correo && !/^\S+@\S+\.\S+$/.test(form.correo)) return setError("El correo no parece válido.");
    setGuardando(true);
    const t = (v) => (String(v ?? "").trim() || null);
    const datos = {
      codigo: t(form.codigo) || `EMP-${String(empleados.length + 1).padStart(3, "0")}`,
      nombre: form.nombre.trim(),
      dui: t(form.dui), nit: t(form.nit), numero_isss: t(form.numero_isss), numero_afp: t(form.numero_afp),
      telefono: t(form.telefono), correo: t(form.correo), direccion: t(form.direccion), cargo: t(form.cargo),
      fecha_ingreso: form.fecha_ingreso,
      sueldo: r2(form.sueldo),
      periodicidad: form.periodicidad,
      aplica_isss: !!form.aplica_isss, aplica_afp: !!form.aplica_afp,
      estado: form.estado,
      fecha_retiro: form.estado === "retirado" ? form.fecha_retiro || hoy() : null,
    };
    const { error: err } = editandoId
      ? await supabase.from("empleados").update(datos).eq("id", editandoId)
      : await supabase.from("empleados").insert({ empresa_id: empresaId, ...datos });
    setGuardando(false);
    if (err) return setError("No se pudo guardar: " + err.message);
    cancelar();
    cargar();
  }

  async function eliminar(e) {
    if (!confirm(`¿Eliminar a «${e.nombre}»?`)) return;
    const { error: err } = await supabase.from("empleados").delete().eq("id", e.id);
    if (err) return alert("No se pudo eliminar (si ya aparece en planillas, márcalo como «retirado»): " + err.message);
    cargar();
  }

  function exportar() {
    const filas = [[empresa?.nombre || ""], ["Expediente de empleados"], [], ["Código", "Nombre", "DUI", "Teléfono", "Correo", "Cargo", "Ingreso", "Sueldo mensual", "Periodicidad", "Estado"]];
    for (const e of empleados) filas.push([e.codigo, e.nombre, e.dui, e.telefono, e.correo, e.cargo, fechaCorta(e.fecha_ingreso), Number(e.sueldo), e.periodicidad, e.estado]);
    exportarAExcel("empleados", [{ nombre: "Empleados", filas }]);
  }

  if (cargando) return <p className="text-inkSoft text-sm">Cargando empleados…</p>;

  const inp = "w-full border border-paperLine rounded-sm px-2 py-1 text-sm bg-white";
  const lbl = "block text-xs font-medium text-inkSoft mb-1";
  const m = (n) => formatoMoneda(n);
  const prest = verPrest && cfg ? calcularPrestaciones(verPrest, cfg, fechaPrest) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <h2 className="font-display text-lg font-semibold">Empleados</h2>
        <div className="flex items-center gap-3">
          <button onClick={nuevo} className="sac-btn sac-btn-primario font-medium">+ Nuevo empleado</button>
          {empleados.length > 0 && <button onClick={exportar} className="text-xs text-ledgerDark hover:underline">Exportar a Excel</button>}
        </div>
      </div>

      {error && !mostrarForm && <p className="text-sm text-rust">{error}</p>}

      {mostrarForm && (
        <form onSubmit={guardar} className="no-print bg-[#F7F4EA] border border-paperLine rounded-sm p-4 space-y-4">
          <p className="text-xs font-semibold text-inkSoft uppercase tracking-wide">{editandoId ? "Editar empleado" : "Nuevo empleado"}</p>
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2"><label className={lbl}>Nombre completo</label><input className={inp} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></div>
            <div><label className={lbl}>Código (opcional)</label><input className={inp} value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} placeholder="EMP-001" /></div>
            <div><label className={lbl}>DUI</label><input className={inp + " font-num"} value={form.dui} onChange={(e) => setForm({ ...form, dui: formatoDui(e.target.value) })} placeholder="00000000-0" /></div>
            <div><label className={lbl}>Teléfono</label><input className={inp + " font-num"} value={form.telefono} onChange={(e) => setForm({ ...form, telefono: formatoTel(e.target.value) })} placeholder="0000-0000" /></div>
            <div><label className={lbl}>Correo</label><input type="email" className={inp} value={form.correo} onChange={(e) => setForm({ ...form, correo: e.target.value })} /></div>
            <div><label className={lbl}>NIT (opcional)</label><input className={inp + " font-num"} value={form.nit} onChange={(e) => setForm({ ...form, nit: e.target.value })} /></div>
            <div><label className={lbl}>N.° de afiliación ISSS (opcional)</label><input className={inp + " font-num"} value={form.numero_isss} onChange={(e) => setForm({ ...form, numero_isss: e.target.value })} /></div>
            <div><label className={lbl}>N.° de afiliación AFP / NUP (opcional)</label><input className={inp + " font-num"} value={form.numero_afp} onChange={(e) => setForm({ ...form, numero_afp: e.target.value })} /></div>
            <div className="sm:col-span-2"><label className={lbl}>Dirección (opcional)</label><input className={inp} value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} /></div>
            <div><label className={lbl}>Cargo</label><input className={inp} value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} /></div>
            <div><label className={lbl}>Fecha de ingreso</label><input type="date" className={inp} value={form.fecha_ingreso} onChange={(e) => setForm({ ...form, fecha_ingreso: e.target.value })} /></div>
            <div><label className={lbl}>Sueldo mensual ($)</label><input type="number" step="0.01" min="0" className={inp + " font-num"} value={form.sueldo} onChange={(e) => setForm({ ...form, sueldo: e.target.value })} /></div>
            <div>
              <label className={lbl}>Periodicidad de pago</label>
              <select className={inp} value={form.periodicidad} onChange={(e) => setForm({ ...form, periodicidad: e.target.value })}>
                <option value="mensual">Mensual</option>
                <option value="quincenal">Quincenal</option>
              </select>
            </div>
            <div>
              <label className={lbl}>Estado</label>
              <select className={inp} value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>
                <option value="activo">Activo</option>
                <option value="retirado">Retirado</option>
              </select>
            </div>
            {form.estado === "retirado" && <div><label className={lbl}>Fecha de retiro</label><input type="date" className={inp} value={form.fecha_retiro} onChange={(e) => setForm({ ...form, fecha_retiro: e.target.value })} /></div>}
          </div>
          <div className="flex flex-wrap gap-5 text-xs text-inkSoft">
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.aplica_isss} onChange={(e) => setForm({ ...form, aplica_isss: e.target.checked })} /> Cotiza ISSS</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.aplica_afp} onChange={(e) => setForm({ ...form, aplica_afp: e.target.checked })} /> Cotiza AFP</label>
          </div>
          <p className="text-xs text-inkSoft">Las comisiones, otros ingresos y otros descuentos se capturan en cada planilla; vacaciones, aguinaldo e indemnización se calculan automáticamente.</p>
          {error && <p className="text-xs text-rust">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={guardando} className="bg-brand text-onBrand px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-brandDark disabled:opacity-60">{guardando ? "Guardando…" : editandoId ? "Guardar cambios" : "Guardar empleado"}</button>
            <button type="button" onClick={cancelar} className="px-3 py-1.5 rounded-sm text-xs font-medium text-inkSoft hover:underline">Cancelar</button>
          </div>
        </form>
      )}

      {empleados.length === 0 ? (
        <p className="text-inkSoft text-sm">Aún no hay empleados registrados.</p>
      ) : (
        <div className="overflow-x-auto bg-white border border-paperLine">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#F7F4EA] text-left">
                <th className="px-2 py-1.5">Código</th><th className="px-2 py-1.5">Nombre</th><th className="px-2 py-1.5">DUI</th><th className="px-2 py-1.5">Teléfono</th>
                <th className="px-2 py-1.5">Ingreso</th><th className="px-2 py-1.5 text-right">Sueldo</th><th className="px-2 py-1.5">Pago</th><th className="px-2 py-1.5">Estado</th><th />
              </tr>
            </thead>
            <tbody>
              {empleados.map((e) => (
                <tr key={e.id} className="border-t border-paperLine">
                  <td className="px-2 py-1.5">{e.codigo}</td>
                  <td className="px-2 py-1.5">{e.nombre}{e.cargo ? <span className="block text-[10px] text-inkSoft">{e.cargo}</span> : null}</td>
                  <td className="px-2 py-1.5 font-num">{e.dui}</td>
                  <td className="px-2 py-1.5 font-num">{e.telefono}</td>
                  <td className="px-2 py-1.5">{fechaCorta(e.fecha_ingreso)}</td>
                  <td className="px-2 py-1.5 text-right font-num tabular">{m(e.sueldo)}</td>
                  <td className="px-2 py-1.5">{e.periodicidad}</td>
                  <td className="px-2 py-1.5">{e.estado}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap no-print">
                    <button onClick={() => { setVerPrest(verPrest?.id === e.id ? null : e); setFechaPrest(hoy()); }} className="text-ledgerDark hover:underline mr-2">Prestaciones</button>
                    <button onClick={() => editar(e)} className="text-accentDark hover:underline mr-2">Editar</button>
                    <button onClick={() => eliminar(e)} className="text-rust hover:underline">Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {prest && (
        <section className="no-print border border-paperLine bg-[#F7F4EA] rounded-sm p-4 space-y-3">
          <div className="flex flex-wrap items-end gap-4">
            <p className="text-sm font-medium">Prestaciones estimadas — {verPrest.nombre}</p>
            <label className="text-xs text-inkSoft">
              <span className="block mb-1">Calculadas al</span>
              <input type="date" value={fechaPrest} onChange={(e) => setFechaPrest(e.target.value)} className="border border-paperLine rounded-sm px-2 py-1 bg-white text-ink text-sm" />
            </label>
          </div>
          <table className="text-sm">
            <tbody>
              <tr><td className="pr-6 py-0.5 text-inkSoft">Antigüedad</td><td>{prest.anios.toFixed(2)} años</td></tr>
              <tr><td className="pr-6 py-0.5 text-inkSoft">Vacaciones proporcionales (desde su último aniversario, con recargo)</td><td className="font-num tabular">{m(prest.vacaciones)}</td></tr>
              <tr><td className="pr-6 py-0.5 text-inkSoft">Aguinaldo proporcional del año ({prest.diasAgui} días, {prest.diasTrab} días trabajados)</td><td className="font-num tabular">{m(prest.aguinaldo)}</td></tr>
              <tr><td className="pr-6 py-0.5 text-inkSoft">Indemnización (1 mes por año, base máx. {m(prest.topeMensual)})</td><td className="font-num tabular">{m(prest.indemnizacion)}</td></tr>
            </tbody>
          </table>
          <p className="text-xs text-inkSoft">Valores estimados con los parámetros de <Link className="underline" href={`/empresa/${empresaId}/rrhh-config`}>Configuración</Link>; no descuentan vacaciones ya gozadas ni pagos previos.</p>
        </section>
      )}
    </div>
  );
}
