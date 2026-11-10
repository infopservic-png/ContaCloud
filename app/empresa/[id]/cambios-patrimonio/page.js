"use client";

import { useEffect, useState } from "react";
import { useEmpresa } from "@/lib/EmpresaContext";
import { corteDefecto } from "@/lib/periodos";
import { obtenerCuentasConMovimientos, formatoMoneda } from "@/lib/contabilidad";
import { calcularCambiosPatrimonio } from "@/lib/flujoPatrimonio";
import { EncabezadoRango, FirmasEstadosFinancieros } from "@/lib/EncabezadoReporte";
import { exportarAExcel } from "@/lib/exportarExcel";

const fmt = (n) => (Math.abs(n) < 0.005 ? "-" : n < 0 ? `(${formatoMoneda(Math.abs(n))})` : formatoMoneda(n));

export default function CambiosPatrimonioPage() {
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

  const d = calcularCambiosPatrimonio(cuentas, fechaInicio, fechaFin);
  const sinDatos = d.columnas.length === 0;

  function exportar() {
    const filas = [
      [empresa?.nombre || ""],
      ["ESTADO DE CAMBIOS EN EL PATRIMONIO"],
      [`Del ${fechaInicio || "…"} al ${fechaFin || "…"}`, empresa?.moneda || ""],
      [],
      ["", ...d.columnas.map((c) => c.titulo), "Total"],
      ...d.filas.map((f) => [f.etiqueta, ...d.columnas.map((c) => f.valores[c.clave]), f.total]),
    ];
    exportarAExcel(`cambios-patrimonio-${fechaFin || "actual"}`, [{ nombre: "Cambios en patrimonio", filas }]);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-display text-lg font-semibold">Estado de cambios en el patrimonio</h2>
          <p className="text-xs text-inkSoft">
            {empresa?.nombre} — Del {fechaInicio || "…"} al {fechaFin || "…"}
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
        <p className="text-inkSoft text-sm">Todavía no hay movimientos de patrimonio ni resultados registrados.</p>
      ) : (
        <div className="bg-[#F7F4EA] border border-paperLine rounded-sm p-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-inkSoft">
                <th className="text-left pb-2 font-normal"></th>
                {d.columnas.map((c) => <th key={c.clave} className="text-right pb-2 pl-3 font-normal">{c.titulo}</th>)}
                <th className="text-right pb-2 pl-3 font-normal">Total</th>
              </tr>
            </thead>
            <tbody>
              {d.filas.map((f) => (
                <tr key={f.etiqueta} className={f.fuerte ? "border-t border-paperLine font-medium" : ""}>
                  <td className="py-1 pr-3">{f.etiqueta}</td>
                  {d.columnas.map((c) => <td key={c.clave} className="py-1 pl-3 font-num text-right tabular">{fmt(f.valores[c.clave])}</td>)}
                  <td className="py-1 pl-3 font-num text-right tabular font-medium">{fmt(f.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <FirmasEstadosFinancieros />
    </div>
  );
}
