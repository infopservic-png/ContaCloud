"use client";

import { formatoMoneda } from "@/lib/contabilidad";
import { formatoNit, formatoNrc } from "@/lib/libros";

const m = (n) => formatoMoneda(n);
const th = "border border-black px-1 py-1 font-bold text-center align-bottom";
const td = "px-1 py-0.5";
const num = td + " text-right font-num tabular whitespace-nowrap";

// Libro de ventas al consumidor, con el diseño del formato oficial.
export default function LibroConsumidor({ empresa, mes, anio, folio, libro }) {
  const { filas, totales, resumen } = libro;
  const f6 = String(folio).padStart(6, "0");
  const lineasResumen = [
    ["Ventas No Sujetas:", resumen.noSujetas],
    ["Ventas exentas:", resumen.exentas],
    ["Ventas netas gravadas:", resumen.gravadasNetas],
    ["DÉBITO FISCAL:", resumen.debitoFiscal],
    ["Exportaciones:", resumen.exportaciones],
  ];

  return (
    <div className="libro-oficial bg-white text-black border border-paperLine p-4 overflow-x-auto" style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
      <p className="font-bold text-sm">LIBRO DE VENTAS AL CONSUMIDOR</p>
      <p className="text-xs mt-1"><b>NOMBRE DEL ESTABLECIMIENTO:</b> {empresa?.nombre}</p>
      <div className="flex flex-wrap justify-between items-start gap-x-6 text-xs mt-1">
        <div>
          <p><b>NRC:</b> &nbsp; {formatoNrc(empresa?.nrc)} &nbsp;&nbsp;&nbsp;&nbsp; <b>NIT:</b> &nbsp; {formatoNit(empresa?.nit)}</p>
          <p className="mt-2"><b>MES:</b> &nbsp; {mes} &nbsp;&nbsp;&nbsp;&nbsp; <b>AÑO:</b> &nbsp; {anio}</p>
        </div>
        <div className="text-center">
          <p className="text-base font-bold">No. {f6}</p>
          <p className="mt-1">(Valores expresados en dólares estadounidenses)</p>
        </div>
      </div>

      <table className="w-full text-[10px] border-collapse border border-black mt-2">
        <thead>
          <tr>
            <th rowSpan={2} className={th}>Día</th>
            <th rowSpan={2} className={th}>Del No.</th>
            <th rowSpan={2} className={th}>Al No.</th>
            <th rowSpan={2} className={th}>No. Máquina<br />o Caja<br />Registradora</th>
            <th colSpan={5} className={th}>Ventas por Cuenta Propia</th>
            <th rowSpan={2} className={th}>Ventas por<br />Cuenta de<br />Terceros</th>
            <th rowSpan={2} className={th}>1% Retención</th>
          </tr>
          <tr>
            <th className={th}>Ventas<br />No Sujetas</th>
            <th className={th}>Ventas<br />Exentas</th>
            <th className={th}>Ventas<br />Gravadas<br />Locales</th>
            <th className={th}>Exportaciones</th>
            <th className={th}>Ventas<br />Totales</th>
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 && (
            <tr>
              <td className={td}>0</td>
              <td colSpan={3} />
              {Array(7).fill(0).map((_, i) => <td key={i} className={num}>{m(0)}</td>)}
            </tr>
          )}
          {filas.map((f) => (
            <tr key={f.fecha}>
              <td className={td + " text-center"}>{f.dia}</td>
              <td className={td + " break-all"}>{f.del}</td>
              <td className={td + " break-all"}>{f.al}</td>
              <td className={td} />
              <td className={num}>{m(f.noSujetas)}</td>
              <td className={num}>{m(f.exentas)}</td>
              <td className={num}>{m(f.gravadas)}</td>
              <td className={num}>{m(f.exportaciones)}</td>
              <td className={num}>{m(f.totales)}</td>
              <td className={num}>{m(f.terceros)}</td>
              <td className={num}>{m(f.retencion)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-black font-semibold">
            <td colSpan={4} className={td + " text-right"}>Total:</td>
            <td className={num}>{m(totales.noSujetas)}</td>
            <td className={num}>{m(totales.exentas)}</td>
            <td className={num}>{m(totales.gravadas)}</td>
            <td className={num}>{m(totales.exportaciones)}</td>
            <td className={num}>{m(totales.totales)}</td>
            <td className={num}>{m(totales.terceros)}</td>
            <td className={num}>{m(totales.retencion)}</td>
          </tr>
        </tfoot>
      </table>

      <div className="flex flex-wrap items-start justify-between gap-8 mt-6 text-xs">
        <div>
          <p className="font-bold mb-2">RESUMEN:</p>
          <table className="border-collapse text-[11px]">
            <tbody>
              {lineasResumen.map(([t, v]) => (
                <tr key={t}>
                  <td className="pr-6 py-0.5 text-right font-bold">{t}</td>
                  <td className="py-0.5 text-right font-num tabular">{m(v)}</td>
                </tr>
              ))}
              <tr className="border-t-4 border-double border-black">
                <td className="pr-6 pt-2 text-right font-bold">VENTAS TOTALES:</td>
                <td className="pt-2 text-right font-num tabular">{m(resumen.ventasTotales)}</td>
              </tr>
              <tr>
                <td className="pr-6 py-1 text-right font-bold">1% Retención:</td>
                <td className="py-1 text-right font-num tabular">{m(resumen.retencion)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="text-center min-w-[260px]">
          <div className="border-t border-black pt-1 mt-16 font-bold">Nombre y Firma del Contador</div>
        </div>
      </div>
    </div>
  );
}
