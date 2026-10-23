"use client";

import { formatoMoneda } from "@/lib/contabilidad";
import { formatoNit, formatoNrc, fechaCorta } from "@/lib/libros";

const m = (n) => formatoMoneda(n);
const th = "border border-black px-1 py-1 font-normal text-center align-bottom";
const td = "px-1 py-0.5";
const num = td + " text-right font-num tabular whitespace-nowrap";

// Libro o registro de operaciones de ventas a contribuyentes, con el diseño del formato oficial.
export default function LibroContribuyentes({ empresa, mes, anio, folio, libro }) {
  const { filas, totales, resumen } = libro;
  const f6 = String(folio).padStart(6, "0");
  const vacias = ["", "", "", "", "", "", "", "", "", ""];

  return (
    <div className="libro-oficial bg-white text-black border border-paperLine p-4 overflow-x-auto" style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
      <h3 className="text-center font-bold text-lg tracking-tight mb-3">LIBRO O REGISTRO DE OPERACIONES DE VENTAS A CONTRIBUYENTES</h3>
      <div className="flex flex-wrap justify-between gap-x-6 text-xs mb-1">
        <p><b>NOMBRE DEL CONTRIBUYENTE:</b> {empresa?.nombre}</p>
        <p><b>NRC.:</b> {formatoNrc(empresa?.nrc)}</p>
        <p><b>NIT:</b> {formatoNit(empresa?.nit)}</p>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-x-6 text-xs mb-2">
        <p><b>MES:</b> {mes} &nbsp;&nbsp;&nbsp; <b>AÑO:</b> {anio}</p>
        <p>VALORES EXPRESADOS EN US DÓLARES</p>
        <p className="text-sm font-bold">Folio No. {f6}</p>
      </div>

      <table className="w-full text-[10px] border-collapse border border-black">
        <thead>
          <tr>
            <th rowSpan={3} className={th}>No.</th>
            <th rowSpan={3} className={th}>FECHA<br />DE<br />EMISIÓN</th>
            <th rowSpan={3} className={th}>N.°<br />CORRELATIVO<br />PREIMPRESO</th>
            <th rowSpan={3} className={th}>PREFIJO<br />O<br />SERIE</th>
            <th rowSpan={3} className={th}>N.° DE CONTROL<br />INTERNO SISTEMA<br />FORMULARIO ÚNICO</th>
            <th rowSpan={3} className={th}>NOMBRE DE CLIENTE, MANDANTE<br />O MANDATARIO</th>
            <th rowSpan={3} className={th}>NRC</th>
            <th colSpan={8} className={th}>OPERACIONES DE VENTAS PROPIAS Y A CUENTA DE TERCEROS</th>
            <th rowSpan={3} className={th}>TOTAL</th>
          </tr>
          <tr>
            <th colSpan={4} className={th}>PROPIAS</th>
            <th colSpan={4} className={th}>A CUENTA DE TERCEROS</th>
          </tr>
          <tr>
            <th className={th}>NO<br />SUJETAS</th>
            <th className={th}>EXENTAS</th>
            <th className={th}>INTERNAS<br />GRAVADAS</th>
            <th className={th}>DÉBITO<br />FISCAL</th>
            <th className={th}>EXENTAS</th>
            <th className={th}>INTERNAS<br />GRAVADAS</th>
            <th className={th}>DÉBITO<br />FISCAL</th>
            <th className={th}>IVA<br />RETENIDO</th>
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 && (
            <tr>
              <td className={td + " text-center"}>1</td>
              <td className={td}>/ /</td>
              <td colSpan={5} className={td}>-</td>
              {Array(9).fill(0).map((_, i) => <td key={i} className={num}>{m(0)}</td>)}
            </tr>
          )}
          {filas.map((f) => (
            <tr key={f.id}>
              <td className={td + " text-center"}>{f.n}</td>
              <td className={td + " whitespace-nowrap"}>{fechaCorta(f.fecha)}</td>
              <td className={td + " break-all"}>{f.correlativo}</td>
              <td className={td}>{f.serie}</td>
              <td className={td + " break-all"}>{f.control}</td>
              <td className={td}>{f.nombre}</td>
              <td className={td + " whitespace-nowrap"}>{formatoNrc(f.nrc)}</td>
              <td className={num}>{m(f.noSujetas)}</td>
              <td className={num}>{m(f.exentas)}</td>
              <td className={num}>{m(f.gravadas)}</td>
              <td className={num}>{m(f.debito)}</td>
              <td className={num}>{m(f.tExentas)}</td>
              <td className={num}>{m(f.tGravadas)}</td>
              <td className={num}>{m(f.tDebito)}</td>
              <td className={num}>{m(f.ivaRetenido)}</td>
              <td className={num}>{m(f.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-black font-semibold">
            <td colSpan={7} className={td + " text-right"}>TOTALES DEL MES:</td>
            <td className={num}>{m(totales.noSujetas)}</td>
            <td className={num}>{m(totales.exentas)}</td>
            <td className={num}>{m(totales.gravadas)}</td>
            <td className={num}>{m(totales.debito)}</td>
            <td className={num}>{m(totales.tExentas)}</td>
            <td className={num}>{m(totales.tGravadas)}</td>
            <td className={num}>{m(totales.tDebito)}</td>
            <td className={num}>{m(totales.ivaRetenido)}</td>
            <td className={num}>{m(totales.total)}</td>
          </tr>
        </tfoot>
      </table>

      <div className="flex flex-wrap items-end justify-between gap-6 mt-6">
        <table className="text-[10px] border-collapse border border-black">
          <thead>
            <tr>
              <th rowSpan={2} className={th + " text-sm font-bold px-4"}>RESUMEN DE OPERACIONES</th>
              <th colSpan={2} className={th}>PROPIAS</th>
              <th colSpan={2} className={th}>A CUENTA DE TERCEROS</th>
              <th rowSpan={2} className={th}>IVA<br />RETENIDO</th>
              <th rowSpan={2} className={th}>CESC</th>
            </tr>
            <tr>
              <th className={th}>VALOR<br />NETO</th>
              <th className={th}>DÉBITO<br />FISCAL</th>
              <th className={th}>VALOR<br />NETO</th>
              <th className={th}>DÉBITO<br />FISCAL</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["VENTAS NETAS INTERNAS GRAVADAS A CONTRIBUYENTES", resumen.gravContribNeto, resumen.gravContribDebito, true, false],
              ["VENTAS NETAS INTERNAS GRAVADAS A CONSUMIDORES", resumen.gravConsNeto, resumen.gravConsDebito, true, false],
              ["TOTAL DE OPERACIONES INTERNAS GRAVADAS", resumen.totalGravNeto, resumen.totalGravDebito, true, true],
              ["VENTAS NETAS INTERNAS EXENTAS A CONTRIBUYENTES", resumen.exentContrib, null, false, false],
              ["VENTAS NETAS INTERNAS EXENTAS A CONSUMIDORES", resumen.exentCons, null, false, false],
              ["TOTAL DE OPERACIONES INTERNAS EXENTAS", resumen.totalExentas, null, false, true],
              ["EXPORTACIONES SEGÚN FACTURAS DE EXPORTACIÓN", resumen.exportaciones, 0, false, false],
              ["VENTAS NO SUJETAS", resumen.noSujetas, null, false, false],
            ].map(([txt, neto, deb, conRet, negrita]) => (
              <tr key={txt} className={"border-t border-black " + (negrita ? "font-semibold" : "")}>
                <td className={td}>{txt}</td>
                <td className={num}>{m(neto)}</td>
                <td className={num}>{deb === null ? "" : m(deb)}</td>
                <td className={num}>{m(0)}</td>
                <td className={num}>{deb === null ? "" : m(0)}</td>
                <td className={num}>{conRet ? m(0) : ""}</td>
                <td className={num}>{conRet ? m(0) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="text-xs text-center min-w-[260px]">
          <div className="border-t border-black pt-1 mt-16 font-bold">Nombre y Firma del Contador o Contribuyente</div>
        </div>
      </div>
    </div>
  );
}
