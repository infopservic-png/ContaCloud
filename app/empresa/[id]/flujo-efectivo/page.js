"use client";

import { useEffect, useState } from "react";
import { useEmpresa } from "@/lib/EmpresaContext";
import { corteDefecto } from "@/lib/periodos";
import { obtenerCuentasConMovimientos, formatoMoneda } from "@/lib/contabilidad";
import { calcularFlujoEfectivo } from "@/lib/flujoPatrimonio";
import { EncabezadoRango, FirmasEstadosFinancieros } from "@/lib/EncabezadoReporte";
import { exportarAExcel } from "@/lib/exportarExcel";

const fmt = (n) => (n < 0 ? `(${formatoMoneda(Math.abs(n))})` : formatoMoneda(n));

export default function FlujoEfectivoPage() {
  const { empresa, empresaId, periodo } = useEmpresa();
  const [cargando, setCargando] = useState(true);
  const [cuentas, setCuentas] = useState([]);
  const [fechaInicio, setFechaInicio] = useState(() => periodo?.fecha_inicio || "");
  const [fechaFin, setFechaFin] = useState(() => corteDefecto(periodo));

  useEffect(() => {
    let activo = true;
    setCargando(true);
    setFechaInicio(periodo?.fecha_inicio || "");
    setFechaFin(corteDefecto(periodo));
    obtenerCuentasConMovimientos(empresaId, { periodo, excluirCierre: true }).then((c) => {
      if (!activo) return;
      setCuentas(c);
      setCargando(false);
    });
    return () => { activo = false; };
  }, [empresaId, periodo?.id]);

  if (cargando) return <p className="text-inkSoft text-sm">Calculando…</p>;

  const d = calcularFlujoEfectivo(cuentas, fechaInicio, fechaFin);
  const sinDatos = !d.utilidadNeta && !d.efectivoInicio && !d.efectivoFinal && !d.ajustes.length && !d.capital.length && !d.inversion.length && !d.financiacion.length;

  function exportar() {
    const lin = (ls) => ls.map((l) => ["", l.etiqueta, l.monto]);
    const filas = [
      [empresa?.nombre || ""],
      ["ESTADO DE FLUJO DE EFECTIVO (MÉTODO INDIRECTO)"],
      [`Del ${fechaInicio || "…"} al ${fechaFin || "…"}`, empresa?.moneda || ""],
      [],
      ["ACTIVIDADES DE OPERACIÓN"],
      ["", "Utilidad (pérdida) neta del período", d.utilidadNeta],
      ...(d.ajustes.length ? [["", "Ajustes por partidas que no requieren efectivo"], ...lin(d.ajustes)] : []),
      ...(d.capital.length ? [["", "Cambios en activos y pasivos de operación"], ...lin(d.capital)] : []),
      ["", "Efectivo neto de actividades de operación", d.totales.operacion],
      [],
      ["ACTIVIDADES DE INVERSIÓN"], ...lin(d.inversion),
      ["", "Efectivo neto de actividades de inversión", d.totales.inversion],
      [],
      ["ACTIVIDADES DE FINANCIACIÓN"], ...lin(d.financiacion),
      ["", "Efectivo neto de actividades de financiación", d.totales.financiacion],
      [],
      ["", "Aumento (disminución) neto de efectivo", d.totales.aumento],
      ["", "Efectivo al inicio del período", d.efectivoInicio],
      ["", "Efectivo al final del período", d.efectivoFinal],
    ];
    exportarAExcel(`flujo-efectivo-${fechaFin || "actual"}`, [{ nombre: "Flujo de efectivo", filas }]);
  }

  const Fila = ({ etiqueta, monto, nivel = 1, fuerte }) => (
    <tr>
      <td className={`py-0.5 ${nivel === 2 ? "pl-8" : nivel === 1 ? "pl-3" : ""} ${fuerte ? "font-medium" : ""}`}>{etiqueta}</td>
      <td className={`py-0.5 font-num text-right tabular ${fuerte ? "font-medium" : ""}`}>{fmt(monto)}</td>
    </tr>
  );
  const Titulo = ({ t }) => (
    <tr><td colSpan={2} className="pt-4 pb-1 text-xs uppercase tracking-wide text-inkSoft">{t}</td></tr>
  );
  const Sub = ({ t }) => (
    <tr><td colSpan={2} className="pt-2 pb-0.5 pl-3 text-xs italic text-inkSoft">{t}</td></tr>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-display text-lg font-semibold">Estado de flujo de efectivo</h2>
          <p className="text-xs text-inkSoft">
            {empresa?.nombre} — Método indirecto — Del {fechaInicio || "…"} al {fechaFin || "…"}
            {empresa?.moneda ? ` — ${empresa.moneda}` : ""}
          </p>
        </div>
        <button onClick={() => window.print()} className="text-xs text-inkSoft hover:text-ink underline underline-offset-2 no-print">Imprimir</button>
      </div>

      {!sinDatos && (
        <button onClick={exportar} className="text-xs text-ledgerDark hover:underline no-print mb-4 inline-block">Exportar a Excel</button>
      )}

      <EncabezadoRango fechaInicio={fechaInicio} fechaFin={fechaFin} onFechaInicio={setFechaInicio} onFechaFin={setFechaFin} />

      {sinDatos ? (
        <p className="text-inkSoft text-sm">Todavía no hay movimientos registrados.</p>
      ) : (
        <div className="bg-[#F7F4EA] border border-paperLine rounded-sm p-6 max-w-2xl">
          <table className="w-full text-sm">
            <tbody>
              <Titulo t="Actividades de operación" />
              <Fila etiqueta="Utilidad (pérdida) neta del período" monto={d.utilidadNeta} />
              {d.ajustes.length > 0 && <Sub t="Ajustes por partidas que no requieren efectivo" />}
              {d.ajustes.map((l) => <Fila key={l.etiqueta} etiqueta={l.etiqueta} monto={l.monto} nivel={2} />)}
              {d.capital.length > 0 && <Sub t="Cambios en activos y pasivos de operación" />}
              {d.capital.map((l) => <Fila key={l.etiqueta} etiqueta={l.etiqueta} monto={l.monto} nivel={2} />)}
              <tr className="border-t border-paperLine"><td className="pt-1 font-medium">Efectivo neto de actividades de operación</td><td className="pt-1 font-num text-right tabular font-medium">{fmt(d.totales.operacion)}</td></tr>

              <Titulo t="Actividades de inversión" />
              {d.inversion.map((l) => <Fila key={l.etiqueta} etiqueta={l.etiqueta} monto={l.monto} />)}
              <tr className="border-t border-paperLine"><td className="pt-1 font-medium">Efectivo neto de actividades de inversión</td><td className="pt-1 font-num text-right tabular font-medium">{fmt(d.totales.inversion)}</td></tr>

              <Titulo t="Actividades de financiación" />
              {d.financiacion.map((l) => <Fila key={l.etiqueta} etiqueta={l.etiqueta} monto={l.monto} />)}
              <tr className="border-t border-paperLine"><td className="pt-1 font-medium">Efectivo neto de actividades de financiación</td><td className="pt-1 font-num text-right tabular font-medium">{fmt(d.totales.financiacion)}</td></tr>

              <tr className="border-t-2 border-ink"><td className="pt-3 font-display font-semibold">Aumento (disminución) neto de efectivo</td><td className="pt-3 font-num text-right tabular font-display font-semibold">{fmt(d.totales.aumento)}</td></tr>
              <Fila etiqueta="Efectivo al inicio del período" monto={d.efectivoInicio} nivel={0} />
              <tr className="border-t border-ink"><td className="pt-1 font-display font-semibold">Efectivo al final del período</td><td className="pt-1 font-num text-right tabular font-display font-semibold">{fmt(d.efectivoFinal)}</td></tr>
            </tbody>
          </table>
          {!d.concilia && (
            <p className="mt-3 text-xs text-rust">El flujo no concilia con el saldo de efectivo (cuentas 1101). Revise las partidas del período.</p>
          )}
          {d.sinClasificar.length > 0 && (
            <p className="mt-3 text-xs text-inkSoft">
              “Otras partidas no clasificadas” incluye cuentas fuera de la clasificación estándar: {d.sinClasificar.join("; ")}.
            </p>
          )}
        </div>
      )}

      <FirmasEstadosFinancieros />
    </div>
  );
}
