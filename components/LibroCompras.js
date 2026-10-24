"use client";

import { formatoMoneda } from "@/lib/contabilidad";
import { formatoNit, formatoNrc, fechaCorta2, nrcSinGuion } from "@/lib/libros";

const m = (n) => formatoMoneda(n);
const th = "border border-black px-1 py-1 font-normal text-center align-bottom";
const td = "px-1 py-0.5";
const num = td + " text-right font-num tabular whitespace-nowrap";

// Libro o registro de compras, con el diseño del formato oficial.
export default function LibroCompras({ empresa, mes, anio, folio, libro }) {
  const { filas, totales } = libro;
  const f6 = String(folio).padStart(6, "0");
  const valores = (x) => [x.exentasInternas, x.exentasImportaciones, x.gravadasInternas, x.gravadasImportaciones, x.creditoFiscal, x.retencion, x.totalCompras, x.retenidoTerceros, x.sujetosExcluidos];

  return (
    <div className="libro-oficial bg-white text-black border border-paperLine p-4 overflow-x-auto" style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
      <h3 className="font-bold text-lg mb-1">LIBRO O REGISTRO DE COMPRAS</h3>
      <div className="flex flex-wrap justify-between gap-x-6 text-xs mb-1">
        <p><b>NOMBRE DEL CONTRIBUYENTE:</b> {empresa?.nombre}</p>
        <p><b>NRC:</b> {formatoNrc(empresa?.nrc)}</p>
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
            <th rowSpan={2} className={th}>No.</th>
            <th rowSpan={2} className={th}>FECHA<br />DE<br />EMISIÓN</th>
            <th rowSpan={2} className={th}>NÚMERO DE<br />DOCUMENTO</th>
            <th rowSpan={2} className={th}>NRC</th>
            <th rowSpan={2} className={th}>NIT o DUI<br />DE SUJETO<br />EXCLUIDO</th>
            <th rowSpan={2} className={th}>NOMBRE DEL PROVEEDOR</th>
            <th colSpan={2} className={th}>COMPRAS EXENTAS</th>
            <th colSpan={3} className={th}>COMPRAS GRAVADAS</th>
            <th rowSpan={2} className={th}>RET. 1%<br />Y 2%<br />A/C</th>
            <th rowSpan={2} className={th}>TOTAL<br />COMPRAS</th>
            <th rowSpan={2} className={th}>IMPUESTO<br />RETENIDO<br />A<br />TERCEROS</th>
            <th rowSpan={2} className={th}>COMPRAS<br />A SUJETOS<br />EXCLUIDOS</th>
          </tr>
          <tr>
            <th className={th}>INTERNAS</th>
            <th className={th}>IMPORTAC.<br />E INTERNAC.</th>
            <th className={th}>INTERNAS</th>
            <th className={th}>IMPORTAC.<br />E INTERNAC.</th>
            <th className={th}>CRÉDITO<br />FISCAL</th>
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 && (
            <tr>
              <td className={td + " text-center"}>0</td>
              <td className={td}>/ /</td>
              <td colSpan={4} />
              {Array(9).fill(0).map((_, i) => <td key={i} className={num}>{m(0)}</td>)}
            </tr>
          )}
          {filas.map((f) => (
            <tr key={f.id}>
              <td className={td + " text-center"}>{f.n}</td>
              <td className={td + " whitespace-nowrap"}>{fechaCorta2(f.fecha)}</td>
              <td className={td + " break-all"}>
                {f.documento}
              </td>
              <td className={td + " whitespace-nowrap"}>{nrcSinGuion(f.nrc)}</td>
              <td className={td + " whitespace-nowrap"}>{f.nitExcluido}</td>
              <td className={td}>{f.proveedor}</td>
              {valores(f).map((v, i) => <td key={i} className={num}>{m(v)}</td>)}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-black font-semibold">
            <td colSpan={6} className={td + " text-right"}>TOTAL DEL MES:</td>
            {valores(totales).map((v, i) => <td key={i} className={num}>{m(v)}</td>)}
          </tr>
        </tfoot>
      </table>

      <div className="mt-16 flex items-end gap-3 text-xs">
        <b>Nombre y Firma del Contador o Contribuyente</b>
        <span className="flex-1 max-w-md border-b border-black" />
      </div>
    </div>
  );
}
