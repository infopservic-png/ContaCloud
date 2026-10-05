"use client";

import { useEffect, useState } from "react";
import { useEmpresa } from "@/lib/EmpresaContext";
import {
  obtenerCuentasConMovimientos,
  filtrarMovimientosRango,
  calcularEstadoResultados,
  formatoMoneda,
} from "@/lib/contabilidad";
import { EncabezadoRango, FirmasEstadosFinancieros } from "@/lib/EncabezadoReporte";
import { exportarAExcel } from "@/lib/exportarExcel";

export default function ResultadosPage() {
  const { empresa, empresaId } = useEmpresa();
  const [cargando, setCargando] = useState(true);
  const [cuentasBase, setCuentasBase] = useState([]);
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState(() => new Date().toISOString().slice(0, 10));

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
    return <p className="text-inkSoft text-sm">Calculando…</p>;
  }

  const cuentasFiltradas = filtrarMovimientosRango(cuentasBase, fechaInicio, fechaFin);
  const datos = calcularEstadoResultados(cuentasFiltradas);
  const esComercial = empresa?.tipo === "comercial";
  const sinDatos = datos.ingresos.length === 0 && datos.gastos.length === 0;

  function exportar() {
    const filas = [
      [empresa?.nombre || "Estado de Resultados"],
      [`Del ${fechaInicio || "…"} al ${fechaFin || "…"}`, empresa?.moneda || ""],
      [],
      ["Ingresos"],
      ...datos.ingresos.map((l) => ["", l.cuenta.nombre, l.monto]),
      ["", "Total Ingresos", datos.totalIngresos],
      [],
    ];
    if (esComercial) {
      filas.push(
        ["Costos"],
        ...datos.costos.map((l) => ["", l.cuenta.nombre, l.monto]),
        ["", "Total Costos", -datos.totalCostos],
        ["", "Utilidad Bruta", datos.utilidadBruta],
        []
      );
    }
    filas.push(
      ["Gastos de Operación"],
      ...datos.gastos.map((l) => ["", l.cuenta.nombre, l.monto]),
      ["", "Total Gastos", -datos.totalGastos],
      [],
      ["", datos.utilidadNeta >= 0 ? "Utilidad Neta" : "Pérdida Neta", datos.utilidadNeta]
    );
    exportarAExcel(`estado-resultados-${fechaFin || "actual"}`, [
      { nombre: "Estado de Resultados", filas },
    ]);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-display text-lg font-semibold">Estado de Resultados</h2>
          <p className="text-xs text-inkSoft">
            {empresa?.nombre}
            {fechaInicio || fechaFin
              ? ` — Del ${fechaInicio || "…"} al ${fechaFin || "…"}`
              : ""}
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

      {!sinDatos && (
        <button
          onClick={exportar}
          className="text-xs text-ledgerDark hover:underline no-print mb-4 inline-block"
        >
          Exportar a Excel
        </button>
      )}

      <EncabezadoRango
        fechaInicio={fechaInicio}
        fechaFin={fechaFin}
        onFechaInicio={setFechaInicio}
        onFechaFin={setFechaFin}
      />

      {sinDatos ? (
        <p className="text-inkSoft text-sm">Todavía no hay movimientos registrados.</p>
      ) : (
        <div className="bg-[#F7F4EA] border border-paperLine rounded-sm p-6 max-w-xl">
          <table className="w-full text-sm">
            <tbody>
              <Seccion titulo="Ingresos" lineas={datos.ingresos} />
              <tr>
                <td className="pt-2 pb-3 font-medium">Total Ingresos</td>
                <td></td>
                <td className="pt-2 pb-3 font-num text-right tabular font-medium">
                  {formatoMoneda(datos.totalIngresos)}
                </td>
              </tr>

              {esComercial && (
                <>
                  <Seccion titulo="Costos" lineas={datos.costos} />
                  <tr>
                    <td className="pt-2 pb-3 font-medium">Total Costos</td>
                    <td></td>
                    <td className="pt-2 pb-3 font-num text-right tabular font-medium">
                      ({formatoMoneda(datos.totalCostos)})
                    </td>
                  </tr>
                  <tr className="border-t border-paperLine">
                    <td className="pt-2 pb-3 font-semibold">Utilidad Bruta</td>
                    <td></td>
                    <td className="pt-2 pb-3 font-num text-right tabular font-semibold">
                      {formatoMoneda(datos.utilidadBruta)}
                    </td>
                  </tr>
                </>
              )}

              <Seccion titulo="Gastos de Operación" lineas={datos.gastos} />
              <tr>
                <td className="pt-2 pb-3 font-medium">Total Gastos</td>
                <td></td>
                <td className="pt-2 pb-3 font-num text-right tabular font-medium">
                  ({formatoMoneda(datos.totalGastos)})
                </td>
              </tr>

              <tr className="border-t-2 border-ink">
                <td className="pt-3 font-display font-semibold">
                  {datos.utilidadNeta >= 0 ? "Utilidad Neta" : "Pérdida Neta"}
                </td>
                <td></td>
                <td
                  className={`pt-3 font-num text-right tabular font-display font-semibold ${
                    datos.utilidadNeta >= 0 ? "text-ledger" : "text-rust"
                  }`}
                >
                  {formatoMoneda(Math.abs(datos.utilidadNeta))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <FirmasEstadosFinancieros />
    </div>
  );
}

function Seccion({ titulo, lineas }) {
  if (lineas.length === 0) return null;
  return (
    <>
      <tr>
        <td colSpan={3} className="pt-3 pb-1 text-xs uppercase tracking-wide text-inkSoft">
          {titulo}
        </td>
      </tr>
      {lineas.map((l) => (
        <tr key={l.cuenta.id}>
          <td className="py-0.5 pl-3">{l.cuenta.nombre}</td>
          <td></td>
          <td className="py-0.5 font-num text-right tabular">{formatoMoneda(l.monto)}</td>
        </tr>
      ))}
    </>
  );
}
