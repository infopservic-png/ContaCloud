"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useEmpresa } from "@/lib/EmpresaContext";
import CuentaCombobox from "@/lib/CuentaCombobox";
import { formatoMoneda } from "@/lib/contabilidad";
import { crearPeriodo, cerrarPeriodo, reabrirPeriodo, vistaPreviaCierre, sugerirCuentas, datosPeriodoSiguiente, fechaDMA } from "@/lib/periodos";

const inputCls = "border border-paperLine rounded-sm px-2 py-1.5 text-sm bg-white";
const labelCls = "block text-xs font-medium text-inkSoft mb-1";

export default function PeriodosPage() {
  const { empresa, empresaId, cuentas, periodos, periodo: activo, seleccionarPeriodo, recargarPeriodos } = useEmpresa();
  const [puedeAdministrar, setPuedeAdministrar] = useState(false);
  const [usuario, setUsuario] = useState("");
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [trabajando, setTrabajando] = useState(false);

  // Nuevo período
  const ultimo = periodos[periodos.length - 1];
  const sugerido = ultimo ? datosPeriodoSiguiente(ultimo) : { nombre: String(new Date().getFullYear()), inicio: `${new Date().getFullYear()}-01-01`, fin: `${new Date().getFullYear()}-12-31` };
  const [nuevo, setNuevo] = useState(sugerido);

  // Cierre
  const [cerrando, setCerrando] = useState(null);
  const [sel, setSel] = useState({ pygId: "", acumId: "", perdidasId: "" });
  const [vista, setVista] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data?.session?.user;
      setUsuario(u?.email || "");
      supabase.from("empresa_miembros").select("rol").eq("empresa_id", empresaId).eq("email", (u?.email || "").toLowerCase()).maybeSingle().then(({ data: m }) => {
        setPuedeAdministrar(u?.id === empresa?.user_id || m?.rol === "completo");
      });
    });
  }, [empresaId, empresa?.user_id]);

  useEffect(() => { setNuevo(sugerido); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [periodos.length]);

  const cuentasCapital = useMemo(() => cuentas.filter((c) => c.clase === "Capital"), [cuentas]);

  function empezarCierre(p) {
    setError(null);
    setAviso(null);
    setCerrando(p);
    setSel(() => {
      const s = sugerirCuentas(cuentas);
      return { pygId: s.pyg, acumId: s.acumuladas, perdidasId: s.perdidas };
    });
    setVista(null);
  }

  useEffect(() => {
    if (!cerrando) return;
    let activoEf = true;
    vistaPreviaCierre(empresaId, cerrando, sel).then((v) => { if (activoEf) setVista(v); }).catch((e) => activoEf && setVista({ error: e.message }));
    return () => { activoEf = false; };
  }, [cerrando, sel.pygId, sel.acumId, sel.perdidasId, empresaId]);

  const anterioresAbiertos = cerrando ? periodos.filter((p) => p.estado === "abierto" && p.fecha_fin < cerrando.fecha_inicio) : [];

  async function confirmarCierre() {
    setTrabajando(true);
    setError(null);
    const r = await cerrarPeriodo({ empresaId, periodo: cerrando, periodos, cuentasSel: sel, usuario });
    setTrabajando(false);
    if (r.error) return setError(r.error);
    setAviso(`Período ${cerrando.nombre} cerrado. ${r.resultado >= 0 ? "Utilidad" : "Pérdida"} del período: ${formatoMoneda(Math.abs(r.resultado))}. Los saldos pasaron al período ${r.siguiente.nombre}.`);
    setCerrando(null);
    const lista = await recargarPeriodos(r.siguiente.id);
    seleccionarPeriodo(r.siguiente.id);
    return lista;
  }

  async function reabrir(p) {
    if (!confirm(`¿Reabrir el período ${p.nombre}? Se eliminan sus partidas de cierre y la partida de apertura del período siguiente.`)) return;
    setTrabajando(true);
    setError(null);
    const r = await reabrirPeriodo({ periodo: p, periodos });
    setTrabajando(false);
    if (r.error) setError(r.error);
    else setAviso(`Período ${p.nombre} reabierto.`);
    await recargarPeriodos(p.id);
  }

  async function abrirNuevo(e) {
    e.preventDefault();
    setError(null);
    if (!nuevo.nombre.trim() || !nuevo.inicio || !nuevo.fin) return setError("Completa el nombre y las fechas.");
    if (nuevo.fin < nuevo.inicio) return setError("La fecha final no puede ser anterior a la inicial.");
    const solapa = periodos.find((p) => nuevo.inicio <= p.fecha_fin && nuevo.fin >= p.fecha_inicio);
    if (solapa) return setError(`Las fechas se cruzan con el período ${solapa.nombre}.`);
    const r = await crearPeriodo(empresaId, { nombre: nuevo.nombre.trim(), inicio: nuevo.inicio, fin: nuevo.fin });
    if (r.error) return setError(r.error);
    await recargarPeriodos(r.periodo.id);
    seleccionarPeriodo(r.periodo.id);
    setAviso(`Período ${r.periodo.nombre} abierto.`);
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="font-display text-lg font-semibold mb-1">Períodos contables y cierre</h2>
        <p className="text-xs text-inkSoft">
          Cada período (normalmente del 1 de enero al 31 de diciembre) tiene sus propios reportes. Al cerrarlo se genera la partida de cierre, los saldos pasan al período siguiente
          con una partida de apertura, y el período queda bloqueado.
        </p>
      </div>
      {error && <p className="text-sm text-rust">{error}</p>}
      {aviso && <p className="text-sm text-ledger">{aviso}</p>}

      <div className="overflow-x-auto bg-white border border-paperLine rounded-sm">
        <table className="w-full text-sm">
          <thead className="bg-brand text-onBrand text-xs">
            <tr>
              <th className="px-2 py-1 text-left font-normal">Período</th>
              <th className="px-2 py-1 text-left font-normal">Desde</th>
              <th className="px-2 py-1 text-left font-normal">Hasta</th>
              <th className="px-2 py-1 text-left font-normal">Estado</th>
              <th className="px-2 py-1 text-right font-normal">Resultado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {periodos.length === 0 && <tr><td colSpan={6} className="px-2 py-3 text-inkSoft">Sin períodos. Si acabas de actualizar, falta ejecutar la migración 36 en Supabase.</td></tr>}
            {periodos.map((p) => (
              <tr key={p.id} className={"border-t border-paperLine " + (activo?.id === p.id ? "bg-accent/10" : "")}>
                <td className="px-2 py-1 font-medium">{p.nombre}{activo?.id === p.id && <span className="ml-2 text-[10px] text-inkSoft">(en uso)</span>}</td>
                <td className="px-2 py-1 text-xs">{fechaDMA(p.fecha_inicio)}</td>
                <td className="px-2 py-1 text-xs">{fechaDMA(p.fecha_fin)}</td>
                <td className={"px-2 py-1 text-xs " + (p.estado === "cerrado" ? "text-rust" : "text-ledger")}>{p.estado === "cerrado" ? "Cerrado" : "Abierto"}</td>
                <td className="px-2 py-1 text-right font-num text-xs">{p.resultado == null ? "—" : `${Number(p.resultado) >= 0 ? "Utilidad" : "Pérdida"} ${formatoMoneda(Math.abs(p.resultado))}`}</td>
                <td className="px-2 py-1 text-right whitespace-nowrap">
                  {activo?.id !== p.id && <button type="button" onClick={() => seleccionarPeriodo(p.id)} className="text-xs text-accentDark hover:underline mr-3">Trabajar con este</button>}
                  {puedeAdministrar && p.estado === "abierto" && <button type="button" onClick={() => empezarCierre(p)} disabled={trabajando} className="text-xs text-accentDark hover:underline">Cerrar período</button>}
                  {puedeAdministrar && p.estado === "cerrado" && <button type="button" onClick={() => reabrir(p)} disabled={trabajando} className="text-xs text-rust hover:underline">Reabrir</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {cerrando && (
        <section className="bg-[#F7F4EA] border border-paperLine rounded-sm p-4 space-y-3">
          <h3 className="font-display text-base font-semibold">Cerrar el período {cerrando.nombre}</h3>
          <p className="text-xs text-inkSoft">
            Se generan dos partidas de cierre fechadas el {fechaDMA(cerrando.fecha_fin)} (ingresos, costos y gastos → Pérdidas y ganancias → Utilidades acumuladas) y la partida de apertura del período siguiente con los saldos.
            Confirma las cuentas que se usarán:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><label className={labelCls}>Pérdidas y ganancias (resultado del ejercicio)</label><CuentaCombobox cuentas={cuentasCapital.length ? cuentasCapital : cuentas} value={sel.pygId} onChange={(id) => setSel({ ...sel, pygId: id })} /></div>
            <div><label className={labelCls}>Utilidades acumuladas</label><CuentaCombobox cuentas={cuentasCapital.length ? cuentasCapital : cuentas} value={sel.acumId} onChange={(id) => setSel({ ...sel, acumId: id })} /></div>
            <div><label className={labelCls}>Pérdidas acumuladas (opcional)</label><CuentaCombobox cuentas={cuentasCapital.length ? cuentasCapital : cuentas} value={sel.perdidasId} onChange={(id) => setSel({ ...sel, perdidasId: id })} /><p className="text-[10px] text-inkSoft mt-0.5">Si queda vacía, una pérdida se traslada a Utilidades acumuladas.</p></div>
          </div>
          {anterioresAbiertos.length > 0 && (
            <p className="text-sm text-rust">Atención: el período {anterioresAbiertos.map((p) => p.nombre).join(", ")} sigue abierto. Conviene cerrarlo primero para que sus saldos pasen a este período.</p>
          )}
          {vista?.error && <p className="text-sm text-inkSoft">{vista.error}</p>}
          {vista && !vista.error && (
            <div className="text-sm bg-white border border-paperLine rounded-sm p-3 space-y-1">
              <p><strong>{vista.resultado >= 0 ? "Utilidad" : "Pérdida"} del período: {formatoMoneda(Math.abs(vista.resultado))}</strong></p>
              <p className="text-xs text-inkSoft">
                Cierre: {vista.cierre1.length} cuentas de resultado · Apertura del siguiente período: {vista.apertura.length} cuentas con saldo.
              </p>
            </div>
          )}
          <div className="flex gap-3">
            <button type="button" onClick={confirmarCierre} disabled={trabajando || !vista || !!vista.error} className="bg-brand text-onBrand px-4 py-2 rounded-sm text-sm font-medium hover:bg-brandDark disabled:opacity-60">
              {trabajando ? "Cerrando…" : "Cerrar período y trasladar saldos"}
            </button>
            <button type="button" onClick={() => setCerrando(null)} disabled={trabajando} className="text-sm text-inkSoft hover:underline">Cancelar</button>
          </div>
        </section>
      )}

      {puedeAdministrar && (
        <form onSubmit={abrirNuevo} className="bg-[#F7F4EA] border border-paperLine rounded-sm p-4 flex flex-wrap items-end gap-3">
          <div className="w-full text-sm font-medium">Abrir otro período</div>
          <label><span className={labelCls}>Nombre</span><input value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} className={inputCls + " w-48"} /></label>
          <label><span className={labelCls}>Desde</span><input type="date" value={nuevo.inicio} onChange={(e) => setNuevo({ ...nuevo, inicio: e.target.value })} className={inputCls} /></label>
          <label><span className={labelCls}>Hasta</span><input type="date" value={nuevo.fin} onChange={(e) => setNuevo({ ...nuevo, fin: e.target.value })} className={inputCls} /></label>
          <button type="submit" className="bg-brand text-onBrand px-4 py-1.5 rounded-sm text-sm font-medium hover:bg-brandDark">Abrir período</button>
        </form>
      )}
    </div>
  );
}
