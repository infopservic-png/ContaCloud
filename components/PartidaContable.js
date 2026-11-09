"use client";

import { formatoMoneda } from "@/lib/contabilidad";
import { nombreCuentaMayor } from "@/lib/cuentasMayor";
import { agruparPorMayor, numeroReportePartida } from "@/lib/partidas";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
function fechaLarga(f) {
  const [a, m, d] = String(f || "").split("-").map(Number);
  return a ? `${d} de ${MESES[m - 1]} de ${a}` : "";
}
function fechaCorta(f) {
  const [a, m, d] = String(f || "").split("-");
  return a ? `${d}/${m}/${a}` : "";
}
const num = (n) => (Number(n) ? formatoMoneda(n) : "");

// Reporte de «Partida contable» al estilo del sistema de referencia: cuentas de mayor con su total,
// subcuentas y, en la columna Parciales, el detalle por documento.
export default function PartidaContable({ partida, empresa, acciones = null }) {
  const grupos = agruparPorMayor(partida.movimientos, nombreCuentaMayor);
  const totalDebe = partida.movimientos.reduce((a, m) => a + Number(m.debe), 0);
  const totalHaber = partida.movimientos.reduce((a, m) => a + Number(m.haber), 0);
  const celda = "px-2 py-[1px] align-top";
  const monto = "px-2 py-[1px] text-right font-num tabular whitespace-nowrap align-bottom";

  return (
    <div className="partida-imprimir bg-white border border-paperLine px-8 py-6 text-[12px] text-black">
      <div className="flex justify-between items-start">
        <div className="text-[11px]">{empresa?.nombre}</div>
        {acciones && <div className="no-print flex gap-3 text-xs">{acciones}</div>}
      </div>
      <div className="text-center mb-3">
        <p className="text-base font-bold">Partida contable</p>
        <p className="text-sm">{fechaLarga(partida.fecha)}</p>
        <p className="text-sm font-semibold uppercase">Valores expresados en {empresa?.moneda ? empresa.moneda.replace(/\s*\(.*\)\s*$/, "") : "US dólares"}</p>
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr className="border border-black">
            <th className="text-left px-2 py-0.5 w-24">Cuenta</th>
            <th className="text-left px-2 py-0.5">Descripción</th>
            <th className="text-right px-2 py-0.5 w-24">Parciales</th>
            <th className="text-right px-2 py-0.5 w-24">Debe</th>
            <th className="text-right px-2 py-0.5 w-24">Haber</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={5} className="px-2 pt-1 pb-2 text-[12px]">
              Partida #: {numeroReportePartida(partida.tipo, partida.numero_partida)} &nbsp;&nbsp;&nbsp;&nbsp; {fechaCorta(partida.fecha)}
            </td>
          </tr>
          {grupos.map((g) => (
            <MayorFilas key={g.codigo} g={g} celda={celda} monto={monto} />
          ))}
          <tr>
            <td colSpan={3} className="text-right font-bold px-2 pt-4">Totales:</td>
            <td className={monto + " pt-4 border-t border-black border-b-[3px] border-double font-semibold"}>{formatoMoneda(totalDebe)}</td>
            <td className={monto + " pt-4 border-t border-black border-b-[3px] border-double font-semibold"}>{formatoMoneda(totalHaber)}</td>
          </tr>
        </tbody>
      </table>

      <p className="mt-4 font-bold">Concepto de la partida:</p>
      <p className="ml-4 uppercase">{partida.descripcion}</p>

      <div className="mt-10 grid grid-cols-3 gap-6 text-center text-[11px]">
        {[["Elaborado por", partida.elaborado_por || empresa?.firma_elaborado], ["Revisado por", partida.revisado_por || empresa?.firma_revisado], ["Autorizado por", empresa?.firma_autorizado]].map(([t, n]) => (
          <div key={t}>
            <div className="border-t border-black pt-1">{n || " "}</div>
            <div>{t}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MayorFilas({ g, celda, monto }) {
  return (
    <>
      <tr>
        <td className={celda}>{g.codigo}</td>
        <td className={celda + " uppercase"}>{g.nombre}</td>
        <td />
        <td className={monto}>{num(g.debe)}</td>
        <td className={monto}>{num(g.haber)}</td>
      </tr>
      {g.subcuentas.map((s, i) => {
        const hayDetalle = s.detalle.length > 0;
        return (
          <FilasSub key={i} s={s} hayDetalle={hayDetalle} celda={celda} monto={monto} />
        );
      })}
    </>
  );
}

function FilasSub({ s, hayDetalle, celda, monto }) {
  const detalle = hayDetalle ? s.detalle : [];
  return (
    <>
      <tr>
        <td className={celda}>{s.codigo}</td>
        <td className={celda}>{s.nombre}</td>
        <td className={monto}>{!hayDetalle ? formatoMoneda(s.monto) : ""}</td>
        <td />
        <td />
      </tr>
      {detalle.map((d, i) => {
        const ultimo = i === detalle.length - 1;
        return (
          <tr key={i}>
            <td />
            <td className={celda + " pl-6 break-words"}>{d.texto}</td>
            <td className={monto + (ultimo ? " border-b border-black" : "")}>{formatoMoneda(d.monto)}</td>
            <td />
            <td />
          </tr>
        );
      })}
    </>
  );
}
