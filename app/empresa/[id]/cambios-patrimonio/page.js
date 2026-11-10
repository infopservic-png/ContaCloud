"use client";

import { Fragment, useEffect, useState } from "react";
import { useEmpresa } from "@/lib/EmpresaContext";
import { corteDefecto } from "@/lib/periodos";
import { obtenerCuentasConMovimientos } from "@/lib/contabilidad";
import { calcularCambiosPatrimonio } from "@/lib/flujoPatrimonio";
import { EncabezadoRango, FirmasEstadosFinancieros } from "@/lib/EncabezadoReporte";
import { exportarAExcel } from "@/lib/exportarExcel";

const fmt = (n) =>
  Math.abs(n) < 0.005 ? "$ -" : `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const fechaLarga = (iso) => {
  if (!iso) return "…";
  const [a, m, d] = iso.split("-").map(Number);
  return `${d} de ${MESES[m - 1]} de ${a}`;
};
const diaAnterior = (iso) => {
  if (!iso) return "";
  const dt = new Date(iso + "T00:00:00Z");
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
};

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
  const anio = (fechaFin || "").slice(0, 4);
  const filasVis = d.filas.filter((f) => f.fuerte || f.etiqueta === "Resultado del ejercicio" || Math.abs(f.total) >= 0.005);
  const etiqueta = (f) =>
    f.tipo === "inicio" ? `Saldos al ${fechaLarga(diaAnterior(fechaInicio))}` : f.tipo === "final" ? `Saldos al ${fechaLarga(fechaFin)}` : f.etiqueta;
  const movimientos = `Movimientos durante el ${fechaInicio.slice(5) === "01-01" ? "año " + anio : "período"}`;

  function exportar() {
    const filas = [
      [empresa?.nombre || ""],
      ["ESTADO DE CAMBIOS EN EL PATRIMONIO"],
      [`Del ${fechaInicio || "…"} al ${fechaFin || "…"}`, empresa?.moneda || ""],
      [],
      ["", ...d.columnas.map((c) => c.titulo), "Total capital"],
      ...filasVis.flatMap((f) => {
        const fila = [etiqueta(f), ...d.columnas.map((c) => f.valores[c.clave]), f.total];
        return f.tipo === "inicio" ? [fila, [movimientos]] : [fila];
      }),
    ];
    exportarAExcel(`cambios-patrimonio-${fechaFin || "actual"}`, [{ nombre: "Cambios en patrimonio", filas }]);
  }

  return (
    <div>
      <style>{`@media print { @page { size: letter landscape; margin: 12mm; } }`}</style>
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
                <th className="text-left pb-2 font-normal">Conceptos</th>
                {d.columnas.map((c) => <th key={c.clave} className="text-right pb-2 pl-3 font-normal">{c.titulo}</th>)}
                <th className="text-right pb-2 pl-3 font-normal">Total capital</th>
              </tr>
            </thead>
            <tbody>
              {filasVis.map((f) => (
                <Fragment key={f.etiqueta}>
                <tr className={f.fuerte ? "border-t border-paperLine font-medium" : ""}>
                  <td className={`py-1 pr-3 ${f.fuerte ? "" : "pl-3"}`}>{etiqueta(f)}</td>
                  {d.columnas.map((c) => <td key={c.clave} className="py-1 pl-3 font-num text-right tabular">{fmt(f.valores[c.clave])}</td>)}
                  <td className="py-1 pl-3 font-num text-right tabular font-medium">{fmt(f.total)}</td>
                </tr>
                {f.tipo === "inicio" && (
                  <tr><td colSpan={d.columnas.length + 2} className="pt-2 pb-0.5 text-xs font-medium">{movimientos}</td></tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <FirmasEstadosFinancieros />
    </div>
  );
}
