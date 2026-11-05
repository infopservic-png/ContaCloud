"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useEmpresa } from "@/lib/EmpresaContext";
import { formatoMoneda } from "@/lib/contabilidad";
import { etiquetaPartida } from "@/lib/partidas";
import { exportarAExcel } from "@/lib/exportarExcel";
import {
  r2, obtenerEmpleados, obtenerConfig, obtenerPlanillas, obtenerLineas, crearPlanilla, guardarLineas,
  calcularLinea, armarPartidaPlanilla, contabilizarPlanilla, textoPeriodo, rangoPeriodo, tipoRecalculo, obtenerAcumulados,
} from "@/lib/rrhh";

const hoy = () => new Date().toISOString().slice(0, 10);
const suma = (arr, k) => r2(arr.reduce((a, l) => a + Number(l[k] || 0), 0));

export default function PlanillasPage() {
  const { empresaId, empresa } = useEmpresa();
  const [empleados, setEmpleados] = useState([]);
  const [cfg, setCfg] = useState(null);
  const [planillas, setPlanillas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [mostrarNueva, setMostrarNueva] = useState(false);
  const [nueva, setNueva] = useState({ periodicidad: "mensual", mes: hoy().slice(0, 7), quincena: "1", fechaPago: "" });
  const [creando, setCreando] = useState(false);

  const [abierta, setAbierta] = useState(null); // planilla
  const [lineas, setLineas] = useState([]);
  const [acum, setAcum] = useState(new Map()); // renta acumulada del año por empleado (para el recálculo)
  const [sucio, setSucio] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  async function cargar() {
    setCargando(true);
    try {
      const [e, c, p] = await Promise.all([obtenerEmpleados(empresaId), obtenerConfig(empresaId), obtenerPlanillas(empresaId)]);
      setEmpleados(e);
      setCfg(c);
      setPlanillas(p);
      return p;
    } catch (err) {
      setError("No se pudo cargar (¿ya corriste la migración de Recursos humanos en Supabase?): " + (err.message || err));
      return [];
    } finally {
      setCargando(false);
    }
  }
  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  const rango = useMemo(() => rangoPeriodo(nueva.mes, nueva.periodicidad, nueva.quincena), [nueva]);
  const contabilizada = !!abierta?.transaccion_id;
  const recalculo = tipoRecalculo(abierta);
  const nombreEmp = (id) => empleados.find((e) => e.id === id)?.nombre || "—";

  async function abrir(p) {
    setError(null);
    setMensaje(null);
    try {
      setLineas(await obtenerLineas(p.id));
      setAcum(tipoRecalculo(p) ? await obtenerAcumulados(empresaId, p) : new Map());
      setAbierta(p);
      setSucio(false);
    } catch (e) {
      setError("No se pudo abrir la planilla: " + (e.message || e));
    }
  }

  async function crear(ev) {
    ev.preventDefault();
    setError(null);
    setCreando(true);
    try {
      const pl = await crearPlanilla({ empresaId, periodicidad: nueva.periodicidad, ini: rango.ini, fin: rango.fin, fechaPago: nueva.fechaPago || rango.fin, empleados, cfg });
      setMostrarNueva(false);
      const lista = await cargar();
      await abrir(lista.find((x) => x.id === pl.id) || pl);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setCreando(false);
    }
  }

  function cambiar(idx, campo, valor) {
    setLineas((ls) =>
      ls.map((l, i) => {
        if (i !== idx) return l;
        const emp = empleados.find((e) => e.id === l.empleado_id);
        const entrada = { sueldo: l.sueldo, comisiones: l.comisiones, otros_ingresos: l.otros_ingresos, otros_descuentos: l.otros_descuentos, [campo]: valor === "" ? 0 : Number(valor) };
        return { ...l, ...calcularLinea({ empleado: emp, cfg, periodicidad: abierta.periodicidad, fechaFin: abierta.periodo_fin, recalculo, acum: acum.get(l.empleado_id), ...entrada }) };
      })
    );
    setSucio(true);
  }
  async function recalcular() {
    setError(null);
    try {
      // Vuelve a leer lo acumulado del año por si se corrigió una planilla anterior.
      const ac = recalculo ? await obtenerAcumulados(empresaId, abierta) : new Map();
      setAcum(ac);
      setLineas((ls) =>
        ls.map((l) => {
          const emp = empleados.find((e) => e.id === l.empleado_id);
          return { ...l, ...calcularLinea({ empleado: emp, cfg, periodicidad: abierta.periodicidad, fechaFin: abierta.periodo_fin, recalculo, acum: ac.get(l.empleado_id), sueldo: l.sueldo, comisiones: l.comisiones, otros_ingresos: l.otros_ingresos, otros_descuentos: l.otros_descuentos }) };
        })
      );
      setSucio(true);
    } catch (e) {
      setError("No se pudo recalcular: " + (e.message || e));
    }
  }

  async function guardar() {
    setError(null);
    setTrabajando(true);
    try {
      await guardarLineas(lineas);
      setSucio(false);
      setMensaje("Cambios guardados.");
    } catch (e) {
      setError("No se pudo guardar: " + (e.message || e));
    } finally {
      setTrabajando(false);
    }
  }

  const partida = useMemo(() => (cfg && abierta ? armarPartidaPlanilla({ lineas, empleados, cfg }) : null), [lineas, empleados, cfg, abierta]);

  async function contabilizar() {
    setError(null);
    setMensaje(null);
    if (!confirm(`Se generará la partida de la planilla de ${textoPeriodo(abierta)} por ${formatoMoneda(partida.totalDebe)}. Después ya no podrás editarla (para reabrirla, elimina su partida en el Libro diario). ¿Continuar?`)) return;
    setTrabajando(true);
    try {
      await guardarLineas(lineas);
      const r = await contabilizarPlanilla({ empresaId, planilla: abierta, lineas, empleados, cfg });
      const lista = await cargar();
      setAbierta(lista.find((x) => x.id === abierta.id) || null);
      setSucio(false);
      setMensaje(`Planilla contabilizada: partida DIA-${String(r.numero).padStart(4, "0")} por ${formatoMoneda(r.total)}.`);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setTrabajando(false);
    }
  }

  async function eliminar() {
    if (!confirm("¿Eliminar esta planilla en borrador?")) return;
    const { error: err } = await supabase.from("planillas").delete().eq("id", abierta.id);
    if (err) return setError("No se pudo eliminar: " + err.message);
    setAbierta(null);
    cargar();
  }

  function exportar() {
    const filas = [[empresa?.nombre || ""], [`Planilla ${abierta.periodicidad} — ${textoPeriodo(abierta)}`], [],
      ["Empleado", "Sueldo", "Comisiones", "Otros ingresos", "Devengado", "ISSS", "AFP", "Renta", "Otros desc.", "Líquido", "ISSS patr.", "AFP patr.", "INSAFORP", "Prov. vacac.", "Prov. aguinaldo", "Prov. indem."]];
    for (const l of lineas) filas.push([nombreEmp(l.empleado_id), l.sueldo, l.comisiones, l.otros_ingresos, l.devengado, l.isss_emp, l.afp_emp, l.renta, l.otros_descuentos, l.liquido, l.isss_pat, l.afp_pat, l.insaforp, l.prov_vacaciones, l.prov_aguinaldo, l.prov_indemnizacion]);
    exportarAExcel("planilla", [{ nombre: "Planilla", filas }]);
  }

  if (cargando && !abierta) return <p className="text-inkSoft text-sm">Cargando planillas…</p>;

  const m = (n) => formatoMoneda(n);
  const inp = "border border-paperLine rounded-sm px-2 py-1 text-sm bg-white";
  const celdaIn = "w-24 border border-paperLine rounded-sm px-1.5 py-0.5 text-xs font-num text-right bg-white";

  // ---------------- Detalle de una planilla ----------------
  if (abierta) {
    const tot = (k) => suma(lineas, k);
    const patronal = r2(tot("isss_pat") + tot("afp_pat") + tot("insaforp"));
    const provis = r2(tot("prov_vacaciones") + tot("prov_aguinaldo") + tot("prov_indemnizacion"));
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 no-print">
          <button onClick={() => { setAbierta(null); cargar(); }} className="text-xs text-inkSoft hover:text-ink underline underline-offset-2">← Planillas</button>
          <div className="flex items-center gap-3">
            <button onClick={() => window.print()} className="text-xs text-inkSoft hover:text-ink underline underline-offset-2">Imprimir</button>
            <button onClick={exportar} className="text-xs text-ledgerDark hover:underline">Exportar a Excel</button>
          </div>
        </div>

        <div className="partida-imprimir bg-white border border-paperLine px-6 py-5 text-[12px] text-black">
          <div className="text-center mb-3">
            <p className="text-[11px] uppercase">{empresa?.nombre}</p>
            <p className="text-base font-bold">Planilla de sueldos {abierta.periodicidad}</p>
            <p className="text-sm">{textoPeriodo(abierta)} · pago: {abierta.fecha_pago.split("-").reverse().join("/")}</p>
            {recalculo && <p className="text-[11px] font-semibold">Incluye el recálculo de la retención de renta de {recalculo} ({recalculo === "junio" ? "acumulado enero–junio" : "acumulado del año"})</p>}
            <p className="text-[11px]">{contabilizada ? `Contabilizada — partida ${etiquetaPartida(abierta.transacciones?.tipo || "diario", abierta.transacciones?.numero_partida)}` : "Borrador"}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border border-black">
                  <th className="text-left px-1.5 py-0.5">Empleado</th>
                  <th className="text-right px-1.5 py-0.5">Sueldo</th>
                  <th className="text-right px-1.5 py-0.5">Comisiones</th>
                  <th className="text-right px-1.5 py-0.5">Otros ingr.</th>
                  <th className="text-right px-1.5 py-0.5">Devengado</th>
                  <th className="text-right px-1.5 py-0.5">ISSS</th>
                  <th className="text-right px-1.5 py-0.5">AFP</th>
                  <th className="text-right px-1.5 py-0.5">Renta</th>
                  <th className="text-right px-1.5 py-0.5">Otros desc.</th>
                  <th className="text-right px-1.5 py-0.5">Líquido</th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((l, i) => (
                  <tr key={l.id}>
                    <td className="px-1.5 py-[2px]">{nombreEmp(l.empleado_id)}</td>
                    {["sueldo", "comisiones", "otros_ingresos"].map((k) => (
                      <td key={k} className="px-1.5 py-[2px] text-right">
                        {contabilizada ? <span className="font-num tabular">{m(l[k])}</span> : <input type="number" step="0.01" min="0" className={celdaIn + " no-print"} value={l[k]} onChange={(e) => cambiar(i, k, e.target.value)} />}
                        {!contabilizada && <span className="hidden print:inline font-num tabular">{m(l[k])}</span>}
                      </td>
                    ))}
                    <td className="px-1.5 py-[2px] text-right font-num tabular">{m(l.devengado)}</td>
                    <td className="px-1.5 py-[2px] text-right font-num tabular">{m(l.isss_emp)}</td>
                    <td className="px-1.5 py-[2px] text-right font-num tabular">{m(l.afp_emp)}</td>
                    <td className="px-1.5 py-[2px] text-right font-num tabular">{m(l.renta)}</td>
                    <td className="px-1.5 py-[2px] text-right">
                      {contabilizada ? <span className="font-num tabular">{m(l.otros_descuentos)}</span> : <input type="number" step="0.01" min="0" className={celdaIn + " no-print"} value={l.otros_descuentos} onChange={(e) => cambiar(i, "otros_descuentos", e.target.value)} />}
                      {!contabilizada && <span className="hidden print:inline font-num tabular">{m(l.otros_descuentos)}</span>}
                    </td>
                    <td className="px-1.5 py-[2px] text-right font-num tabular font-semibold">{m(l.liquido)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="text-right font-bold px-1.5 pt-3">Totales:</td>
                  {["sueldo", "comisiones", "otros_ingresos", "devengado", "isss_emp", "afp_emp", "renta", "otros_descuentos", "liquido"].map((k) => (
                    <td key={k} className="px-1.5 pt-3 text-right font-num tabular font-semibold border-t border-black">{m(tot(k))}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-[11px]">
            Cuotas patronales (ISSS {m(tot("isss_pat"))} · AFP {m(tot("afp_pat"))} · INSAFORP {m(tot("insaforp"))}): <b>{m(patronal)}</b>
            &nbsp;&nbsp;|&nbsp;&nbsp; Provisiones (vacaciones {m(tot("prov_vacaciones"))} · aguinaldo {m(tot("prov_aguinaldo"))} · indemnización {m(tot("prov_indemnizacion"))}): <b>{m(provis)}</b>
          </p>
        </div>

        <div className="no-print space-y-2">
          {partida?.faltantes.length > 0 && !contabilizada && (
            <p className="text-sm text-rust">Para contabilizar falta configurar estas cuentas en <Link className="underline" href={`/empresa/${empresaId}/rrhh-config`}>Configuración</Link>: {partida.faltantes.join(", ")}.</p>
          )}
          {error && <p className="text-sm text-rust">{error}</p>}
          {mensaje && <p className="text-sm text-ledgerDark">{mensaje}</p>}
          {contabilizada ? (
            <p className="text-xs text-inkSoft">Esta planilla ya generó su partida. Para reabrirla, elimina la partida en el <Link className="underline" href={`/empresa/${empresaId}/transacciones`}>Libro diario</Link>.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button onClick={recalcular} className="sac-btn">Recalcular con la configuración</button>
              <button onClick={guardar} disabled={trabajando || !sucio} className="sac-btn">Guardar cambios</button>
              <button onClick={contabilizar} disabled={trabajando || partida?.faltantes.length > 0} className="sac-btn sac-btn-primario font-medium">{trabajando ? "Procesando…" : "Contabilizar planilla"}</button>
              <button onClick={eliminar} className="text-xs text-rust hover:underline px-2">Eliminar planilla</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------------- Lista de planillas ----------------
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">Planillas</h2>
        <button onClick={() => { setMostrarNueva((v) => !v); setError(null); }} className="sac-btn sac-btn-primario font-medium">{mostrarNueva ? "Cancelar" : "+ Nueva planilla"}</button>
      </div>

      {mostrarNueva && (
        <form onSubmit={crear} className="bg-[#F7F4EA] border border-paperLine rounded-sm p-4 space-y-3">
          <div className="flex flex-wrap items-end gap-4 text-xs text-inkSoft">
            <label><span className="block mb-1">Periodicidad</span>
              <select className={inp} value={nueva.periodicidad} onChange={(e) => setNueva({ ...nueva, periodicidad: e.target.value })}>
                <option value="mensual">Mensual</option><option value="quincenal">Quincenal</option>
              </select></label>
            <label><span className="block mb-1">Mes</span><input type="month" className={inp} value={nueva.mes} onChange={(e) => setNueva({ ...nueva, mes: e.target.value })} /></label>
            {nueva.periodicidad === "quincenal" && (
              <label><span className="block mb-1">Quincena</span>
                <select className={inp} value={nueva.quincena} onChange={(e) => setNueva({ ...nueva, quincena: e.target.value })}>
                  <option value="1">1.ª (1 al 15)</option><option value="2">2.ª (16 a fin de mes)</option>
                </select></label>
            )}
            <label><span className="block mb-1">Fecha de pago</span><input type="date" className={inp} value={nueva.fechaPago || rango.fin} onChange={(e) => setNueva({ ...nueva, fechaPago: e.target.value })} /></label>
          </div>
          <p className="text-xs text-inkSoft">Se incluirán los empleados activos con periodicidad {nueva.periodicidad}. Luego podrás capturar comisiones, otros ingresos y otros descuentos.</p>
          <button type="submit" disabled={creando} className="bg-brand text-onBrand px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-brandDark disabled:opacity-60">{creando ? "Creando…" : "Crear planilla"}</button>
        </form>
      )}

      {error && <p className="text-sm text-rust">{error}</p>}

      {planillas.length === 0 ? (
        <p className="text-inkSoft text-sm">Aún no hay planillas. Registra tus <Link className="underline" href={`/empresa/${empresaId}/empleados`}>empleados</Link>, revisa la <Link className="underline" href={`/empresa/${empresaId}/rrhh-config`}>configuración</Link> y crea la primera.</p>
      ) : (
        <div className="overflow-x-auto bg-white border border-paperLine">
          <table className="w-full text-xs">
            <thead><tr className="bg-[#F7F4EA] text-left"><th className="px-2 py-1.5">Período</th><th className="px-2 py-1.5">Tipo</th><th className="px-2 py-1.5 text-right">Empleados</th><th className="px-2 py-1.5 text-right">Devengado</th><th className="px-2 py-1.5 text-right">Líquido</th><th className="px-2 py-1.5">Estado</th><th /></tr></thead>
            <tbody>
              {planillas.map((p) => (
                <tr key={p.id} className="border-t border-paperLine">
                  <td className="px-2 py-1.5">{textoPeriodo(p)}</td>
                  <td className="px-2 py-1.5">{p.periodicidad}</td>
                  <td className="px-2 py-1.5 text-right">{p.planilla_lineas?.length || 0}</td>
                  <td className="px-2 py-1.5 text-right font-num tabular">{m(suma(p.planilla_lineas || [], "devengado"))}</td>
                  <td className="px-2 py-1.5 text-right font-num tabular">{m(suma(p.planilla_lineas || [], "liquido"))}</td>
                  <td className="px-2 py-1.5">{p.transaccion_id ? `Contabilizada · ${etiquetaPartida(p.transacciones?.tipo || "diario", p.transacciones?.numero_partida)}` : "Borrador"}</td>
                  <td className="px-2 py-1.5"><button onClick={() => abrir(p)} className="text-accentDark hover:underline">Abrir</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
