"use client";

import { useEffect, useMemo, useState } from "react";
import { useEmpresa } from "@/lib/EmpresaContext";
import { obtenerCuentasBancarias, obtenerMovimientosLibros } from "@/lib/bancos";
import { formatoMoneda } from "@/lib/contabilidad";
import { etiquetaPartida } from "@/lib/partidas";
import { exportarAExcel } from "@/lib/exportarExcel";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const fmt = (f) => {
  const [a, m, d] = String(f || "").split("-");
  return a ? `${d}/${m}/${a}` : "";
};
function periodo(desde, hasta) {
  if (!desde && !hasta) return "Todos los movimientos";
  if (desde && hasta) {
    const [a1, m1, d1] = desde.split("-").map(Number);
    const [a2, m2, d2] = hasta.split("-").map(Number);
    if (a1 === a2 && m1 === m2) return `Del ${d1} al ${d2} de ${MESES[m1 - 1]} de ${a1}`;
    return `Del ${fmt(desde)} al ${fmt(hasta)}`;
  }
  return desde ? `Desde el ${fmt(desde)}` : `Hasta el ${fmt(hasta)}`;
}

export default function LibroBancos() {
  const { empresa, empresaId } = useEmpresa();
  const [bancos, setBancos] = useState([]);
  const [bancoId, setBancoId] = useState("");
  const [movs, setMovs] = useState([]);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    obtenerCuentasBancarias(empresaId).then((d) => {
      setBancos(d);
      if (d.length) setBancoId(d[0].id);
      setCargando(false);
    });
  }, [empresaId]);

  const banco = bancos.find((b) => b.id === bancoId);
  useEffect(() => {
    if (banco) obtenerMovimientosLibros(banco.cuenta_contable_id).then(setMovs);
    else setMovs([]);
  }, [banco?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const datos = useMemo(() => {
    const fecha = (m) => String(m.transacciones?.fecha ?? "");
    const antes = movs.filter((m) => desde && fecha(m) < desde);
    const enPeriodo = movs.filter((m) => (!desde || fecha(m) >= desde) && (!hasta || fecha(m) <= hasta));
    const saldoAnterior = antes.reduce((s, m) => s + Number(m.debe) - Number(m.haber), 0);
    let saldo = saldoAnterior;
    const filas = enPeriodo.map((m) => {
      saldo += Number(m.debe) - Number(m.haber);
      return { id: m.id, fecha: fecha(m), partida: etiquetaPartida(m.transacciones?.tipo, m.transacciones?.numero_partida), concepto: m.transacciones?.descripcion || "", debe: Number(m.debe), haber: Number(m.haber), saldo };
    });
    return {
      saldoAnterior,
      filas,
      totalDebe: filas.reduce((a, f) => a + f.debe, 0),
      totalHaber: filas.reduce((a, f) => a + f.haber, 0),
      saldoFinal: saldo,
    };
  }, [movs, desde, hasta]);

  function exportar() {
    const out = [[empresa?.nombre || ""], ["Libro de bancos"], [periodo(desde, hasta)], [banco ? `${banco.banco || ""} ${banco.nombre} ${banco.numero_cuenta || ""}`.trim() : ""], [], ["Fecha", "Partida", "Concepto", "Depósitos / Abonos", "Retiros / Cargos", "Saldo"], ["", "", "Saldo anterior", "", "", datos.saldoAnterior]];
    for (const f of datos.filas) out.push([fmt(f.fecha), f.partida, f.concepto, f.debe || "", f.haber || "", f.saldo]);
    out.push(["", "", "Totales", datos.totalDebe, datos.totalHaber, datos.saldoFinal]);
    exportarAExcel("libro-de-bancos", [{ nombre: "Libro de bancos", filas: out }]);
  }

  const sel = "border border-paperLine rounded-sm px-2 py-1 bg-white text-ink text-xs";
  const m = (n) => formatoMoneda(n);

  if (!cargando && bancos.length === 0) return <p className="text-sm text-inkSoft">Aún no hay cuentas bancarias. Regístralas en el módulo <b>Bancos</b>.</p>;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 no-print">
        <h2 className="font-display text-lg font-semibold">Libro de bancos</h2>
        <div className="flex gap-3 text-xs">
          <button onClick={() => window.print()} className="text-inkSoft hover:text-ink underline underline-offset-2">Imprimir</button>
          <button onClick={exportar} className="text-ledgerDark hover:underline">Exportar a Excel</button>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-4 mb-4 no-print text-xs text-inkSoft">
        <label><span className="block mb-1">Cuenta bancaria</span>
          <select value={bancoId} onChange={(e) => setBancoId(e.target.value)} className={sel}>
            {bancos.map((b) => <option key={b.id} value={b.id}>{[b.banco, b.nombre].filter(Boolean).join(" — ")}</option>)}
          </select>
        </label>
        <label><span className="block mb-1">Desde</span><input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={sel} /></label>
        <label><span className="block mb-1">Hasta</span><input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={sel} /></label>
        {(desde || hasta) && <button onClick={() => { setDesde(""); setHasta(""); }} className="underline pb-1">Quitar fechas</button>}
      </div>

      <div className="bg-white border border-paperLine px-8 py-6 text-[12px] text-black">
        <div className="text-center mb-3">
          <p className="text-[11px] uppercase">{empresa?.nombre}</p>
          <p className="text-base font-bold">Libro de bancos</p>
          <p className="text-sm">{periodo(desde, hasta)}</p>
          <p className="text-sm uppercase">Valores expresados en {empresa?.moneda ? empresa.moneda.replace(/\s*\(.*\)\s*$/, "") : "US dólares"}</p>
        </div>
        {banco && (
          <>
            <p><b>Banco:</b>&nbsp; {banco.banco || "—"}</p>
            <p><b>Cuenta:</b>&nbsp; {banco.nombre}{banco.numero_cuenta ? ` — ${banco.numero_cuenta}` : ""}</p>
            <p className="mb-2"><b>Cuenta contable:</b>&nbsp; {banco.cuenta_contable ? `${banco.cuenta_contable.codigo} — ${banco.cuenta_contable.nombre}` : ""}</p>
          </>
        )}
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-y-2 border-black text-left">
              <th className="px-2 py-1">Fecha</th>
              <th className="px-2 py-1">Partida</th>
              <th className="px-2 py-1">Concepto</th>
              <th className="px-2 py-1 text-right w-28">Depósitos</th>
              <th className="px-2 py-1 text-right w-28">Retiros</th>
              <th className="px-2 py-1 text-right w-28">Saldo</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={5} className="px-2 py-1 text-right font-bold">Saldo anterior:</td>
              <td className="px-2 py-1 text-right font-num tabular">{m(datos.saldoAnterior)}</td>
            </tr>
            {datos.filas.map((f) => (
              <tr key={f.id}>
                <td className="px-2 py-[1px] whitespace-nowrap">{fmt(f.fecha)}</td>
                <td className="px-2 py-[1px] font-num">{f.partida}</td>
                <td className="px-2 py-[1px]">{f.concepto}</td>
                <td className="px-2 py-[1px] text-right font-num tabular">{f.debe ? m(f.debe) : ""}</td>
                <td className="px-2 py-[1px] text-right font-num tabular">{f.haber ? m(f.haber) : ""}</td>
                <td className="px-2 py-[1px] text-right font-num tabular">{m(f.saldo)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-black font-bold">
              <td colSpan={3} className="px-2 py-1 text-right">Totales:</td>
              <td className="px-2 py-1 text-right font-num tabular">{m(datos.totalDebe)}</td>
              <td className="px-2 py-1 text-right font-num tabular">{m(datos.totalHaber)}</td>
              <td className="px-2 py-1 text-right font-num tabular">{m(datos.saldoFinal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
