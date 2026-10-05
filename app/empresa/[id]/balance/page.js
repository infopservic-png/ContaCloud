"use client";

import { useEffect, useState } from "react";
import { useEmpresa } from "@/lib/EmpresaContext";
import {
  obtenerCuentasConMovimientos,
  filtrarMovimientosHasta,
  calcularBalanceComprobacion,
  formatoMoneda,
} from "@/lib/contabilidad";
import { EncabezadoAlFecha, FirmasEstadosFinancieros } from "@/lib/EncabezadoReporte";
import { exportarAExcel } from "@/lib/exportarExcel";

export default function BalancePage() {
  const { empresa, empresaId } = useEmpresa();
  const [cargando, setCargando] = useState(true);
  const [cuentasBase, setCuentasBase] = useState([]);
  const [fechaCorte, setFechaCorte] = useState(
    () => new Date().toISOString().slice(0, 10)
  );

  useEffect(() => {
    let activo = true;
    setCargando(true);
    obtenerCuentasConMovimientos(empresaId).then((cuentas) => {
      if (!activo) return;
      setCuentasBase(cuentas);
      setCargando(false);
    });
    return () => {
      activo = false;
    };
  }, [empresaId]);

  if (cargando) {
    return <p className="text-inkSoft text-sm">Calculando balance…</p>;
  }

  const cuentasFiltradas = filtrarMovimientosHasta(cuentasBase, fechaCorte);
  const conMov = cuentasFiltradas.filter((c) => (c.movimientos || []).length > 0);
  const resultado = calcularBalanceComprobacion(conMov);
  const { filas, totales } = resultado;
  const cuadra = Math.abs(totales.saldoDeudor - totales.saldoAcreedor) < 0.01;

  function exportar() {
    const encabezado = [
      [empresa?.nombre || "Balance de Comprobación"],
      [fechaCorte ? `Al ${fechaCorte}` : "", empresa?.moneda || ""],
      [],
      ["Código", "Cuenta", "Suma Debe", "Suma Haber", "Saldo Deudor", "Saldo Acreedor"],
    ];
    const cuerpo = filas.map((f) => [
      f.cuenta.codigo,
      f.cuenta.nombre,
      f.sumaDebe,
      f.sumaHaber,
      f.saldoDeudor || "",
      f.saldoAcreedor || "",
    ]);
    const pie = [
      ["", "Totales", totales.sumaDebe, totales.sumaHaber, totales.saldoDeudor, totales.saldoAcreedor],
    ];
    exportarAExcel(`balance-comprobacion-${fechaCorte || "actual"}`, [
      { nombre: "Balance Comprobación", filas: [...encabezado, ...cuerpo, ...pie] },
    ]);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-display text-lg font-semibold">Balance de Comprobación</h2>
          <p className="text-xs text-inkSoft">
            {empresa?.nombre}
            {fechaCorte ? ` — Al ${fechaCorte}` : ""}
            {empresa?.moneda ? ` — ${empresa.moneda}` : ""}
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="text-xs text-inkSoft hover:text-ink underline underline-offset-2 no-print"
        >
          Imprimir
        </button>
      </div>

      {filas.length > 0 && (
        <button
          onClick={exportar}
          className="text-xs text-ledgerDark hover:underline no-print mb-4 inline-block"
        >
          Exportar a Excel
        </button>
      )}

      <EncabezadoAlFecha fechaCorte={fechaCorte} onFechaCorte={setFechaCorte} />

      {filas.length === 0 ? (
        <p className="text-inkSoft text-sm">Todavía no hay movimientos registrados.</p>
      ) : (
        <div className="bg-[#F7F4EA] border border-paperLine rounded-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-ink text-paper text-left">
                <th className="px-3 py-2 font-medium">Código</th>
                <th className="px-3 py-2 font-medium">Cuenta</th>
                <th className="px-3 py-2 font-medium text-right">Suma Debe</th>
                <th className="px-3 py-2 font-medium text-right">Suma Haber</th>
                <th className="px-3 py-2 font-medium text-right">Saldo Deudor</th>
                <th className="px-3 py-2 font-medium text-right">Saldo Acreedor</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.cuenta.id} className="border-t border-paperLine">
                  <td className="px-3 py-1.5 font-num">{f.cuenta.codigo}</td>
                  <td className="px-3 py-1.5">{f.cuenta.nombre}</td>
                  <td className="px-3 py-1.5 font-num text-right tabular">
                    {formatoMoneda(f.sumaDebe)}
                  </td>
                  <td className="px-3 py-1.5 font-num text-right tabular">
                    {formatoMoneda(f.sumaHaber)}
                  </td>
                  <td className="px-3 py-1.5 font-num text-right tabular">
                    {f.saldoDeudor > 0 ? formatoMoneda(f.saldoDeudor) : ""}
                  </td>
                  <td className="px-3 py-1.5 font-num text-right tabular">
                    {f.saldoAcreedor > 0 ? formatoMoneda(f.saldoAcreedor) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-ink font-semibold">
                <td colSpan={2} className="px-3 py-2 text-right text-xs">
                  Totales
                </td>
                <td className="px-3 py-2 font-num text-right tabular">
                  {formatoMoneda(totales.sumaDebe)}
                </td>
                <td className="px-3 py-2 font-num text-right tabular">
                  {formatoMoneda(totales.sumaHaber)}
                </td>
                <td className="px-3 py-2 font-num text-right tabular">
                  {formatoMoneda(totales.saldoDeudor)}
                </td>
                <td className="px-3 py-2 font-num text-right tabular">
                  {formatoMoneda(totales.saldoAcreedor)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className={`text-sm mt-3 ${cuadra ? "text-ledger" : "text-rust"}`}>
        {cuadra
          ? "✓ El balance cuadra: las sumas deudoras y acreedoras son iguales."
          : "⚠ El balance no cuadra — revisa las partidas registradas."}
      </p>

      <FirmasEstadosFinancieros />
    </div>
  );
}
