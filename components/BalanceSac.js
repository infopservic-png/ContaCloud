"use client";

import { useEffect, useMemo, useState } from "react";
import { formatoMoneda } from "@/lib/contabilidad";
import { exportarAExcel } from "@/lib/exportarExcel";
import { construirBalanceJerarquico, leyendaRango } from "@/lib/balanceJerarquico";
import { FirmasEstadosFinancieros } from "@/lib/EncabezadoReporte";

const hoyISO = () => new Date().toISOString().slice(0, 10);
const inicioMes = (f) => `${f.slice(0, 7)}-01`;
const finMes = (f) => new Date(Date.UTC(Number(f.slice(0, 4)), Number(f.slice(5, 7)), 0)).toISOString().slice(0, 10);
const num = (n) => (Number(n) ? formatoMoneda(n) : "0.00");
const inputCls = "border border-paperLine rounded-sm px-2 py-1 text-sm bg-white";

// Detalle: hasta qué nivel de código se muestran las filas
const DETALLES = [
  { v: 99, t: "Todas las cuentas" },
  { v: 4, t: "Hasta cuentas de mayor (4 dígitos)" },
  { v: 2, t: "Hasta 2 dígitos" },
  { v: 1, t: "Solo totales (1 dígito)" },
];

export default function BalanceSac({ cuentasBase, empresa, periodo }) {
  const ajustar = (f) => {
    if (!periodo) return f;
    return f < periodo.fecha_inicio ? periodo.fecha_inicio : f > periodo.fecha_fin ? periodo.fecha_fin : f;
  };
  const corteInicial = ajustar(hoyISO());
  const [hasta, setHasta] = useState(corteInicial);
  const [desde, setDesde] = useState(() => ajustar(inicioMes(corteInicial)));
  const [detalle, setDetalle] = useState(99);

  useEffect(() => {
    const c = ajustar(hoyISO());
    setHasta(c);
    setDesde(ajustar(inicioMes(c)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo?.id]);

  const { secciones, cuadra } = useMemo(() => construirBalanceJerarquico(cuentasBase, desde, hasta), [cuentasBase, desde, hasta]);
  const hayDatos = secciones.some((s) => s.filas.length > 0);

  function elegirMes(valor) {
    // valor = 'YYYY-MM'
    if (!valor) return;
    setDesde(ajustar(`${valor}-01`));
    setHasta(ajustar(finMes(`${valor}-01`)));
  }

  function exportar() {
    const filas = [[empresa?.nombre || ""], ["BALANCE DE COMPROBACIÓN"], [leyendaRango(desde, hasta)], [`VALORES EXPRESADOS EN ${(empresa?.moneda || "US DÓLARES").toUpperCase()}`], []];
    for (const s of secciones) {
      filas.push([s.titulo], ["Código", "Cuentas", "Saldo Anterior", "Cargos", "Abonos", "Saldo Final"]);
      for (const f of s.filas.filter((x) => x.codigo.length <= detalle || detalle === 99)) filas.push([f.codigo, f.nombre, f.anterior, f.cargos, f.abonos, f.final]);
      filas.push(["", "TOTALES", s.totales.anterior, s.totales.cargos, s.totales.abonos, s.totales.final], []);
    }
    exportarAExcel(`balance-comprobacion-${hasta}`, [{ nombre: "Balance Comprobación", filas }]);
  }

  return (
    <div>
      <div className="no-print flex flex-wrap items-end gap-3 mb-4 text-sm">
        <label><span className="block text-xs text-inkSoft mb-1">Mes</span><input type="month" value={hasta.slice(0, 7)} onChange={(e) => elegirMes(e.target.value)} className={inputCls} /></label>
        <label><span className="block text-xs text-inkSoft mb-1">Desde</span><input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={inputCls} /></label>
        <label><span className="block text-xs text-inkSoft mb-1">Hasta</span><input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={inputCls} /></label>
        {periodo && <button type="button" onClick={() => { setDesde(periodo.fecha_inicio); setHasta(ajustar(hoyISO())); }} className="text-xs text-accentDark hover:underline pb-1.5">Todo el período</button>}
        <label><span className="block text-xs text-inkSoft mb-1">Detalle</span>
          <select value={detalle} onChange={(e) => setDetalle(Number(e.target.value))} className={inputCls}>
            {DETALLES.map((d) => <option key={d.v} value={d.v}>{d.t}</option>)}
          </select>
        </label>
        {hayDatos && <button type="button" onClick={exportar} className="text-xs text-ledgerDark hover:underline pb-1.5">Exportar a Excel</button>}
        <button type="button" onClick={() => window.print()} className="text-xs text-inkSoft hover:text-ink underline underline-offset-2 pb-1.5">Imprimir</button>
      </div>

      <div className="bg-white border border-paperLine px-6 py-5 text-[12px] text-black">
        <div className="text-center mb-4">
          <div className="text-[11px] text-left">{empresa?.nombre}</div>
          <div className="font-bold text-sm">BALANCE DE COMPROBACIÓN</div>
          <div>{leyendaRango(desde, hasta)}</div>
          <div className="uppercase">Valores expresados en {empresa?.moneda || "US dólares"}</div>
        </div>

        {!hayDatos && <p className="text-inkSoft">No hay movimientos en el rango elegido.</p>}
        {secciones.map((s) => s.filas.length > 0 && (
          <div key={s.clave} className="mb-6">
            <div className="text-center font-semibold mb-1">{s.titulo}</div>
            <table className="w-full">
              <thead>
                <tr className="border-y border-black">
                  <th className="text-left font-semibold px-2 py-1" colSpan={2}>Cuentas</th>
                  <th className="text-right font-semibold px-2 py-1">Saldo Anterior</th>
                  <th className="text-right font-semibold px-2 py-1">Cargos</th>
                  <th className="text-right font-semibold px-2 py-1">Abonos</th>
                  <th className="text-right font-semibold px-2 py-1">Saldo Final</th>
                </tr>
              </thead>
              <tbody>
                {s.filas.filter((f) => detalle === 99 || f.codigo.length <= detalle).map((f) => {
                  const negrita = !f.esCuenta || f.codigo.length <= 4;
                  return (
                    <tr key={f.codigo} className={negrita ? "font-semibold" : ""}>
                      <td className="px-2 py-[1px] font-num whitespace-nowrap w-28">{f.codigo}</td>
                      <td className="px-2 py-[1px]">{f.nombre}</td>
                      <td className="px-2 py-[1px] text-right font-num tabular">{num(f.anterior)}</td>
                      <td className="px-2 py-[1px] text-right font-num tabular">{num(f.cargos)}</td>
                      <td className="px-2 py-[1px] text-right font-num tabular">{num(f.abonos)}</td>
                      <td className="px-2 py-[1px] text-right font-num tabular">{num(f.final)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-black font-bold">
                  <td colSpan={2} className="px-2 py-1 text-right">TOTALES</td>
                  <td className="px-2 py-1 text-right font-num tabular">{num(s.totales.anterior)}</td>
                  <td className="px-2 py-1 text-right font-num tabular">{num(s.totales.cargos)}</td>
                  <td className="px-2 py-1 text-right font-num tabular">{num(s.totales.abonos)}</td>
                  <td className="px-2 py-1 text-right font-num tabular">{num(s.totales.final)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ))}
      </div>

      {hayDatos && (
        <p className={`text-sm mt-3 ${cuadra ? "text-ledger" : "text-rust"}`}>
          {cuadra ? "✓ El balance cuadra: activos y gastos igualan a pasivos, patrimonio e ingresos." : "⚠ El balance no cuadra — revisa las partidas registradas."}
        </p>
      )}
      <FirmasEstadosFinancieros />
    </div>
  );
}
