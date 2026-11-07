"use client";

import { useEffect, useMemo, useState } from "react";
import { useEmpresa } from "@/lib/EmpresaContext";
import { formatoMoneda } from "@/lib/contabilidad";
import { exportarAExcel } from "@/lib/exportarExcel";
import { obtenerEmpleados, r2 } from "@/lib/rrhh";
import { csvQ25, descargarCsv } from "@/lib/anexosRenta";

const dmy = (iso) => {
  const [a, m, d] = String(iso || "").split("-");
  return a ? `${d}/${m}/${a}` : "";
};
const periodoDe = (iso) => (iso ? `${iso.slice(5, 7)}${iso.slice(0, 4)}` : "");

export default function AnexoQ25Page() {
  const { empresaId, empresa } = useEmpresa();
  const [empleados, setEmpleados] = useState([]);
  const [filas, setFilas] = useState([]);
  const [fechaPago, setFechaPago] = useState(`${new Date().getFullYear()}-01-15`);
  const [tope, setTope] = useState("1500");
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    obtenerEmpleados(empresaId)
      .then(setEmpleados)
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }, [empresaId]);

  // Una fila por empleado activo con sueldo hasta el tope; la quincena 25 es medio sueldo mensual (editable).
  useEffect(() => {
    const limite = Number(tope) || Infinity;
    setFilas(
      empleados
        .filter((e) => e.estado === "activo" && Number(e.sueldo) > 0 && Number(e.sueldo) <= limite)
        .map((e) => ({
          id: e.id,
          nombre: e.nombre,
          nit: e.dui ? "" : e.nit || "",
          dui: e.dui || "",
          salario: Number(e.sueldo),
          quincena25: r2(Number(e.sueldo) / 2),
          incluir: true,
        }))
    );
  }, [empleados, tope]);

  const cambiar = (id, cambios) => setFilas((fs) => fs.map((f) => (f.id === id ? { ...f, ...cambios } : f)));
  const incluidas = useMemo(() => filas.filter((f) => f.incluir), [filas]);
  const total = r2(incluidas.reduce((a, f) => a + Number(f.quincena25), 0));
  const datos = (f) => ({ ...f, fechaPago: dmy(fechaPago), periodo: periodoDe(fechaPago) });

  function descargar() {
    if (!incluidas.length) return setError("No hay empleados para el anexo.");
    descargarCsv(`ANEXO Q25 ${periodoDe(fechaPago)}.csv`, csvQ25(incluidas.map(datos)));
  }
  function excel() {
    exportarAExcel(`anexo-q25-${periodoDe(fechaPago)}`, [
      {
        nombre: "ANEXO Q25",
        filas: [
          [empresa?.nombre || ""],
          ["Anexo Quincena 25"],
          [],
          ["Apellidos, nombres", "NIT", "DUI", "Fecha de pago", "Salario nominal", "Quincena veinticinco", "Periodo"],
          ...incluidas.map((f) => [f.nombre, f.nit, f.dui, dmy(fechaPago), f.salario, Number(f.quincena25), periodoDe(fechaPago)]),
          ["", "", "", "", "Total:", total],
        ],
      },
    ]);
  }

  const m = (n) => formatoMoneda(n);
  const lbl = "block text-xs font-medium text-inkSoft mb-1";
  const inp = "border border-paperLine rounded-sm px-2 py-1 bg-white text-sm";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 no-print">
        <h2 className="font-display text-lg font-semibold">Anexo Q25 — Quincena 25</h2>
        <div className="flex items-center gap-3">
          <button onClick={excel} disabled={!incluidas.length} className="text-xs text-ledgerDark hover:underline disabled:opacity-50">Exportar a Excel</button>
          <button onClick={descargar} disabled={!incluidas.length} className="sac-btn sac-btn-primario font-medium">Descargar CSV para Hacienda</button>
        </div>
      </div>

      <div className="no-print bg-[#F7F4EA] border border-paperLine rounded-sm p-3 flex flex-wrap items-end gap-4">
        <label><span className={lbl}>Fecha de pago</span><input type="date" className={inp} value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} /></label>
        <label><span className={lbl}>Incluir sueldos hasta ($)</span><input type="number" min="0" step="0.01" className={inp + " w-28 font-num"} value={tope} onChange={(e) => setTope(e.target.value)} /></label>
        <p className="text-xs text-inkSoft max-w-md">Verifica con tu contador a quién aplica la Ley Quincena 25. Puedes quitar empleados o ajustar el monto de cada uno.</p>
      </div>

      {error && <p className="text-sm text-rust">{error}</p>}
      {cargando ? (
        <p className="text-sm text-inkSoft">Cargando…</p>
      ) : filas.length === 0 ? (
        <p className="text-sm text-inkSoft">No hay empleados activos con sueldo dentro del tope.</p>
      ) : (
        <div className="overflow-x-auto bg-white border border-paperLine rounded-sm">
          <table className="w-full text-xs">
            <thead className="bg-brand text-onBrand">
              <tr>
                <th className="px-2 py-1 no-print" />
                <th className="text-left font-normal px-2 py-1">Nombre</th>
                <th className="text-left font-normal px-2 py-1">NIT / DUI</th>
                <th className="text-left font-normal px-2 py-1">Fecha de pago</th>
                <th className="text-right font-normal px-2 py-1">Salario nominal</th>
                <th className="text-right font-normal px-2 py-1">Quincena 25</th>
                <th className="text-left font-normal px-2 py-1">Periodo</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id} className={"border-t border-paperLine " + (f.incluir ? "" : "opacity-40")}>
                  <td className="px-2 py-1 no-print"><input type="checkbox" checked={f.incluir} onChange={(e) => cambiar(f.id, { incluir: e.target.checked })} /></td>
                  <td className="px-2 py-1">{f.nombre}</td>
                  <td className={"px-2 py-1 font-num " + (!f.nit && !f.dui ? "text-rust" : "")}>{f.dui ? `DUI ${f.dui}` : f.nit ? `NIT ${f.nit}` : "falta"}</td>
                  <td className="px-2 py-1">{dmy(fechaPago)}</td>
                  <td className="px-2 py-1 text-right font-num tabular">{m(f.salario)}</td>
                  <td className="px-2 py-1 text-right"><input type="number" step="0.01" min="0" value={f.quincena25} onChange={(e) => cambiar(f.id, { quincena25: e.target.value })} className="w-24 border border-paperLine rounded-sm px-1.5 py-0.5 text-xs font-num text-right" /></td>
                  <td className="px-2 py-1 font-num">{periodoDe(fechaPago)}</td>
                </tr>
              ))}
              <tr className="border-t border-black font-semibold">
                <td colSpan={5} className="px-2 py-1 text-right">Total ({incluidas.length} empleados):</td>
                <td className="px-2 py-1 text-right font-num tabular">{m(total)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
