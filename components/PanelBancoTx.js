"use client";

import { useEffect, useMemo, useState } from "react";
import { useEmpresa } from "@/lib/EmpresaContext";
import { obtenerCuentasBancarias } from "@/lib/bancos";
import { TIPOS_BANCO, obtenerTransaccionesBanco, registrarTransaccionBanco, anularCheque, eliminarTransaccionBanco } from "@/lib/bancosTx";
import { etiquetaPartida } from "@/lib/partidas";
import { formatoMoneda } from "@/lib/contabilidad";
import CuentaCombobox from "@/lib/CuentaCombobox";
import { exportarAExcel } from "@/lib/exportarExcel";

const hoy = () => new Date().toISOString().slice(0, 10);
const fmtFecha = (f) => {
  const [a, m, d] = String(f || "").split("-");
  return a ? `${d}/${m}/${a}` : "";
};
const vacio = (tipo) => ({ tipo, fecha: hoy(), numero: "", beneficiario: "", concepto: "", monto: "", cuentaContrariaId: "" });
const inputCls = "w-full border border-paperLine rounded-sm px-2 py-1.5 text-sm bg-white";
const labelCls = "block text-xs font-medium text-inkSoft mb-1";

// Panel compartido por «Cheques» (tipos = ["cheque"]) y «Transacciones bancarias» (resto de tipos).
export default function PanelBancoTx({ tipos, titulo, descripcion }) {
  const { empresa, empresaId, cuentas } = useEmpresa();
  const esCheques = tipos.length === 1 && tipos[0] === "cheque";
  const [bancos, setBancos] = useState([]);
  const [cuentaBancariaId, setCuentaBancariaId] = useState("");
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [form, setForm] = useState(vacio(tipos[0]));
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  async function cargarBancos() {
    const data = await obtenerCuentasBancarias(empresaId);
    setBancos(data);
    if (!cuentaBancariaId && data.length) setCuentaBancariaId(data[0].id);
    return data;
  }
  async function cargarFilas() {
    setCargando(true);
    try {
      setFilas(await obtenerTransaccionesBanco(empresaId, { tipos, desde, hasta }));
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }
  useEffect(() => {
    cargarBancos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);
  useEffect(() => {
    cargarFilas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, desde, hasta]);

  const banco = bancos.find((b) => b.id === cuentaBancariaId) || null;
  const cfg = TIPOS_BANCO[form.tipo];
  const total = useMemo(() => filas.filter((f) => f.estado !== "anulado").reduce((s, f) => s + Number(f.monto), 0), [filas]);
  const set = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));

  async function guardar(e) {
    e.preventDefault();
    setError(null);
    setAviso(null);
    if (!banco) return setError("Primero registra una cuenta bancaria en el módulo Bancos.");
    setGuardando(true);
    const res = await registrarTransaccionBanco({ empresaId, cuentaBancaria: banco, ...form });
    setGuardando(false);
    if (res.error) return setError(res.error);
    setAviso(`${TIPOS_BANCO[form.tipo].label}${res.numero ? ` N° ${res.numero}` : ""} registrado. Partida ${etiquetaPartida(res.tipoPartida, res.numeroPartida)} generada.`);
    setForm(vacio(form.tipo));
    await Promise.all([cargarBancos(), cargarFilas()]);
  }

  async function anular(f) {
    if (!confirm(`¿Anular el cheque N° ${f.numero}? Se elimina su partida y el número queda como anulado.`)) return;
    const r = await anularCheque(f);
    if (r.error) alert(r.error);
    cargarFilas();
  }
  async function eliminar(f) {
    if (!confirm("¿Eliminar este registro junto con su partida? No se puede deshacer.")) return;
    const r = await eliminarTransaccionBanco(f);
    if (r.error) alert(r.error);
    await Promise.all([cargarBancos(), cargarFilas()]);
  }

  function exportar() {
    const out = [[empresa?.nombre || ""], [titulo], [], ["Fecha", "Tipo", "N.°", "Cuenta bancaria", "Beneficiario / Referencia", "Concepto", "Monto", "Estado", "Partida"]];
    for (const f of filas) {
      out.push([fmtFecha(f.fecha), TIPOS_BANCO[f.tipo]?.label, f.numero || "", f.cuenta_bancaria?.nombre || "", f.beneficiario || "", f.concepto || "", Number(f.monto), f.estado, f.partida ? etiquetaPartida(f.partida.tipo, f.partida.numero_partida) : ""]);
    }
    exportarAExcel(esCheques ? "reporte-cheques" : "transacciones-bancarias", [{ nombre: titulo, filas: out }]);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <div>
          <h2 className="font-display text-lg font-semibold">{titulo}</h2>
          <p className="text-xs text-inkSoft">{descripcion}</p>
        </div>
        <div className="flex gap-3 text-xs">
          <button onClick={() => window.print()} className="text-inkSoft hover:text-ink underline underline-offset-2">Imprimir</button>
          {filas.length > 0 && <button onClick={exportar} className="text-ledgerDark hover:underline">Exportar a Excel</button>}
        </div>
      </div>

      {bancos.length === 0 && !cargando ? (
        <p className="text-sm text-inkSoft">Aún no hay cuentas bancarias. Regístralas primero en el módulo <b>Bancos</b>.</p>
      ) : (
        <form onSubmit={guardar} className="no-print border border-paperLine bg-[#F7F4EA] rounded-sm p-4 space-y-3">
          <p className="text-sm font-medium">{esCheques ? "Emitir cheque" : "Nueva transacción bancaria"}</p>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <label>
              <span className={labelCls}>Cuenta bancaria</span>
              <select value={cuentaBancariaId} onChange={(e) => setCuentaBancariaId(e.target.value)} className={inputCls}>
                {bancos.map((b) => (
                  <option key={b.id} value={b.id}>{[b.banco, b.nombre].filter(Boolean).join(" — ")}</option>
                ))}
              </select>
            </label>
            {!esCheques && (
              <label>
                <span className={labelCls}>Tipo</span>
                <select value={form.tipo} onChange={(e) => set("tipo", e.target.value)} className={inputCls}>
                  {tipos.map((t) => <option key={t} value={t}>{TIPOS_BANCO[t].label}</option>)}
                </select>
              </label>
            )}
            <label>
              <span className={labelCls}>Fecha</span>
              <input type="date" value={form.fecha} onChange={(e) => set("fecha", e.target.value)} className={inputCls} />
            </label>
            <label>
              <span className={labelCls}>{esCheques ? "N.° de cheque" : "N.° / referencia"}</span>
              <input value={form.numero} onChange={(e) => set("numero", e.target.value)} placeholder={esCheques && banco ? `Siguiente: ${banco.siguiente_cheque}` : "Opcional"} className={inputCls} />
            </label>
            <label className="sm:col-span-2">
              <span className={labelCls}>{form.tipo === "deposito" ? "Depositante" : "Beneficiario / a nombre de"}</span>
              <input value={form.beneficiario} onChange={(e) => set("beneficiario", e.target.value)} className={inputCls} />
            </label>
            <label>
              <span className={labelCls}>Monto</span>
              <input type="number" step="0.01" min="0" value={form.monto} onChange={(e) => set("monto", e.target.value)} className={inputCls} />
            </label>
            <div className="sm:col-span-4">
              <span className={labelCls}>{cfg.contraria}</span>
              <CuentaCombobox cuentas={cuentas} value={form.cuentaContrariaId} onChange={(id) => set("cuentaContrariaId", id)} placeholder="Buscar cuenta…" />
            </div>
            <label className="sm:col-span-4">
              <span className={labelCls}>Concepto</span>
              <input value={form.concepto} onChange={(e) => set("concepto", e.target.value)} className={inputCls} />
            </label>
          </div>
          <p className="text-xs text-inkSoft">
            Genera una partida de tipo <b>{{ egreso: "Egreso", ingreso: "Ingresos", diario: "Diario", transferencia: "Transferencias" }[cfg.partida]}</b>:{" "}
            {cfg.lado === "haber" ? "cargo a la cuenta elegida y abono al banco." : "cargo al banco y abono a la cuenta elegida."}
          </p>
          {error && <p className="text-sm text-rust">{error}</p>}
          {aviso && <p className="text-sm text-ledger">{aviso}</p>}
          <button type="submit" disabled={guardando} className="cc-btn cc-btn-primario font-medium">{guardando ? "Guardando…" : esCheques ? "Emitir cheque" : "Registrar"}</button>
        </form>
      )}

      <section>
        <div className="flex flex-wrap items-end gap-3 mb-2 text-xs text-inkSoft no-print">
          <label><span className="block mb-1">Desde</span><input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="border border-paperLine rounded-sm px-2 py-1 bg-white text-ink" /></label>
          <label><span className="block mb-1">Hasta</span><input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="border border-paperLine rounded-sm px-2 py-1 bg-white text-ink" /></label>
          {(desde || hasta) && <button onClick={() => { setDesde(""); setHasta(""); }} className="underline pb-1">Quitar fechas</button>}
        </div>
        <div className="bg-white border border-paperLine overflow-x-auto">
          <p className="px-3 pt-2 text-sm font-semibold hidden print:block">{empresa?.nombre} — {titulo}</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#DAD7CD] text-left text-xs">
                <th className="px-3 py-1.5">Fecha</th>
                {!esCheques && <th className="px-3 py-1.5">Tipo</th>}
                <th className="px-3 py-1.5">N.°</th>
                <th className="px-3 py-1.5">Cuenta bancaria</th>
                <th className="px-3 py-1.5">{esCheques ? "Beneficiario" : "Referencia"}</th>
                <th className="px-3 py-1.5">Concepto</th>
                <th className="px-3 py-1.5 text-right">Monto</th>
                <th className="px-3 py-1.5">Partida</th>
                <th className="px-3 py-1.5 no-print" />
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr><td colSpan={9} className="px-3 py-4 text-center text-inkSoft text-xs">Cargando…</td></tr>
              ) : filas.length === 0 ? (
                <tr><td colSpan={9} className="px-3 py-4 text-center text-inkSoft text-xs">Todavía no hay registros.</td></tr>
              ) : (
                filas.map((f) => (
                  <tr key={f.id} className={`border-t border-paperLine ${f.estado === "anulado" ? "text-inkSoft line-through" : ""}`}>
                    <td className="px-3 py-1 whitespace-nowrap">{fmtFecha(f.fecha)}</td>
                    {!esCheques && <td className="px-3 py-1">{TIPOS_BANCO[f.tipo]?.label}</td>}
                    <td className="px-3 py-1 font-num">{f.numero || "—"}</td>
                    <td className="px-3 py-1">{f.cuenta_bancaria?.nombre}</td>
                    <td className="px-3 py-1">{f.beneficiario || "—"}</td>
                    <td className="px-3 py-1">{f.concepto || ""}</td>
                    <td className="px-3 py-1 text-right font-num tabular">{formatoMoneda(f.monto)}</td>
                    <td className="px-3 py-1 font-num text-xs">{f.estado === "anulado" ? <span className="no-underline">Anulado</span> : f.partida ? etiquetaPartida(f.partida.tipo, f.partida.numero_partida) : "—"}</td>
                    <td className="px-3 py-1 text-right whitespace-nowrap no-print">
                      {esCheques && f.estado !== "anulado" && <button onClick={() => anular(f)} className="text-xs text-accentDark hover:underline mr-3">Anular</button>}
                      <button onClick={() => eliminar(f)} className="text-xs text-rust hover:underline">Eliminar</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {filas.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-black font-semibold">
                  <td colSpan={esCheques ? 5 : 6} className="px-3 py-1.5 text-right">Total (sin anulados):</td>
                  <td className="px-3 py-1.5 text-right font-num tabular">{formatoMoneda(total)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </div>
  );
}
