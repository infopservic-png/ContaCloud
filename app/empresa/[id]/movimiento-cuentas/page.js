"use client";

import { useEffect, useMemo, useState } from "react";
import { useEmpresa } from "@/lib/EmpresaContext";
import { obtenerCuentasConMovimientos, formatoMoneda } from "@/lib/contabilidad";
import { compararPartidas, etiquetaPartida } from "@/lib/partidas";
import { exportarAExcel } from "@/lib/exportarExcel";
import CuentaCombobox from "@/lib/CuentaCombobox";

const ACREEDORAS = ["Pasivo", "Capital", "Ingreso"];

function fechaCorta(f) {
  const [a, m, d] = String(f || "").split("-");
  return a ? `${d}/${m}/${a}` : "";
}
function textoPeriodo(desde, hasta) {
  if (!desde && !hasta) return "Todos los movimientos";
  if (desde && hasta) return `Del ${fechaCorta(desde)} al ${fechaCorta(hasta)}`;
  return desde ? `Desde el ${fechaCorta(desde)}` : `Hasta el ${fechaCorta(hasta)}`;
}

// Un código entra en el rango si es >= «desde» y <= «hasta», donde «hasta» también
// cubre las subcuentas que empiecen con ese código (hasta 61 incluye 610101).
function enRango(codigo, cDesde, cHasta) {
  const c = String(codigo || "");
  if (cDesde && c < cDesde && !c.startsWith(cDesde)) return false;
  if (cHasta && c > cHasta && !c.startsWith(cHasta)) return false;
  return true;
}

export default function MovimientoCuentasPage() {
  const { empresaId, empresa, cuentas } = useEmpresa();
  const [datos, setDatos] = useState([]);
  const [cargando, setCargando] = useState(true);
  // Cuentas elegidas del catálogo (id); el rango se calcula con sus códigos.
  const [idDesde, setIdDesde] = useState("");
  const [idHasta, setIdHasta] = useState("");
  const cDesde = cuentas.find((c) => c.id === idDesde)?.codigo || "";
  const cHasta = cuentas.find((c) => c.id === idHasta)?.codigo || "";
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [vista, setVista] = useState("detalle"); // "detalle" | "resumen"
  const [sinMov, setSinMov] = useState(false);

  useEffect(() => {
    let activo = true;
    setCargando(true);
    obtenerCuentasConMovimientos(empresaId).then((data) => {
      if (activo) {
        setDatos(data);
        setCargando(false);
      }
    });
    return () => {
      activo = false;
    };
  }, [empresaId]);

  const cuentasRep = useMemo(() => {
    const cd = cDesde.trim();
    const ch = cHasta.trim();
    return datos
      .filter((c) => enRango(c.codigo, cd, ch))
      .map((c) => {
        const acreedora = ACREEDORAS.includes(c.clase);
        const signo = acreedora ? -1 : 1;
        const movs = [...(c.movimientos || [])].sort((a, b) =>
          compararPartidas(
            { ...a.transacciones },
            { ...b.transacciones }
          )
        );
        const antes = desde ? movs.filter((m) => (m.transacciones?.fecha || "") < desde) : [];
        const periodo = movs.filter((m) => {
          const f = m.transacciones?.fecha || "";
          return (!desde || f >= desde) && (!hasta || f <= hasta);
        });
        const saldoAnterior = antes.reduce((a, m) => a + signo * (Number(m.debe) - Number(m.haber)), 0);
        let saldo = saldoAnterior;
        const filas = periodo.map((m) => {
          saldo += signo * (Number(m.debe) - Number(m.haber));
          return {
            key: m.id,
            fecha: m.transacciones?.fecha,
            partida: etiquetaPartida(m.transacciones?.tipo, m.transacciones?.numero_partida),
            concepto: m.transacciones?.descripcion || "",
            debe: Number(m.debe),
            haber: Number(m.haber),
            saldo,
          };
        });
        const totalDebe = periodo.reduce((a, m) => a + Number(m.debe), 0);
        const totalHaber = periodo.reduce((a, m) => a + Number(m.haber), 0);
        return {
          id: c.id,
          codigo: c.codigo,
          nombre: c.nombre,
          acreedora,
          saldoAnterior,
          filas,
          totalDebe,
          totalHaber,
          saldoFinal: saldo,
          tieneMov: periodo.length > 0 || antes.length > 0,
        };
      })
      .filter((c) => sinMov || c.tieneMov);
  }, [datos, cDesde, cHasta, desde, hasta, sinMov]);

  const totales = useMemo(
    () => ({
      debe: cuentasRep.reduce((a, c) => a + c.totalDebe, 0),
      haber: cuentasRep.reduce((a, c) => a + c.totalHaber, 0),
    }),
    [cuentasRep]
  );

  if (cargando) return <p className="text-inkSoft text-sm">Cargando movimiento de cuentas…</p>;

  const m = (n) => formatoMoneda(n);
  const sel = "border border-paperLine rounded-sm px-2 py-1 bg-white text-ink text-xs";
  const rangoTexto =
    cDesde || cHasta ? `Cuentas ${cDesde || "primera"} a ${cHasta || "última"}` : "Todas las cuentas";

  function exportar() {
    const filas = [[empresa?.nombre || ""], ["Movimiento de cuentas"], [textoPeriodo(desde, hasta)], [rangoTexto], []];
    if (vista === "resumen") {
      filas.push(["Cuenta", "Nombre", "Saldo anterior", "Cargos", "Abonos", "Saldo final"]);
      for (const c of cuentasRep) filas.push([c.codigo, c.nombre, c.saldoAnterior, c.totalDebe, c.totalHaber, c.saldoFinal]);
      filas.push(["", "Totales:", "", totales.debe, totales.haber, ""]);
    } else {
      for (const c of cuentasRep) {
        filas.push(["Cuenta:", c.codigo, c.nombre]);
        filas.push(["Fecha", "Partida", "Concepto", "Debe", "Haber", "Saldo"]);
        filas.push(["", "", "Saldo anterior:", "", "", c.saldoAnterior]);
        for (const f of c.filas) filas.push([fechaCorta(f.fecha), f.partida, f.concepto, f.debe, f.haber, f.saldo]);
        filas.push(["", "", "Totales:", c.totalDebe, c.totalHaber, c.saldoFinal]);
        filas.push([]);
      }
    }
    exportarAExcel("movimiento-de-cuentas", [{ nombre: "Movimiento de cuentas", filas }]);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 no-print">
        <h2 className="font-display text-lg font-semibold">Movimiento de cuentas</h2>
        <div className="flex items-center gap-3">
          <button onClick={() => window.print()} className="text-xs text-inkSoft hover:text-ink underline underline-offset-2">Imprimir</button>
          {cuentasRep.length > 0 && (
            <button onClick={exportar} className="text-xs text-ledgerDark hover:underline">Exportar a Excel</button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4 mb-4 no-print text-xs text-inkSoft">
        <div className="w-64">
          <span className="block mb-1">Cuenta desde</span>
          <CuentaCombobox cuentas={cuentas} value={idDesde} onChange={setIdDesde} placeholder="Catálogo… (vacío = primera)" />
        </div>
        <div className="w-64">
          <span className="block mb-1">Cuenta hasta</span>
          <CuentaCombobox cuentas={cuentas} value={idHasta} onChange={setIdHasta} placeholder="Catálogo… (vacío = última)" />
        </div>
        <label>
          <span className="block mb-1">Fecha desde</span>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={sel} />
        </label>
        <label>
          <span className="block mb-1">Fecha hasta</span>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={sel} />
        </label>
        <label>
          <span className="block mb-1">Vista</span>
          <select value={vista} onChange={(e) => setVista(e.target.value)} className={sel}>
            <option value="detalle">Detalle de movimientos</option>
            <option value="resumen">Resumen por cuenta</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 pb-1">
          <input type="checkbox" checked={sinMov} onChange={(e) => setSinMov(e.target.checked)} /> Incluir cuentas sin movimiento
        </label>
        {(idDesde || idHasta || desde || hasta) && (
          <button onClick={() => { setIdDesde(""); setIdHasta(""); setDesde(""); setHasta(""); }} className="underline underline-offset-2 hover:text-ink pb-1">
            Todas las cuentas y fechas
          </button>
        )}
      </div>

      {cuentasRep.length === 0 ? (
        <p className="text-inkSoft text-sm">No hay movimientos para mostrar con esos filtros.</p>
      ) : vista === "resumen" ? (
        <div className="partida-imprimir bg-white border border-paperLine px-8 py-6 text-[12px] text-black">
          <div className="text-center mb-3">
            <p className="text-[11px] uppercase">{empresa?.nombre}</p>
            <p className="text-base font-bold">Movimiento de cuentas</p>
            <p className="text-sm">{textoPeriodo(desde, hasta)} · {rangoTexto}</p>
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border border-black">
                <th className="text-left px-2 py-0.5 w-24">Cuenta</th>
                <th className="text-left px-2 py-0.5">Nombre</th>
                <th className="text-right px-2 py-0.5 w-28">Saldo anterior</th>
                <th className="text-right px-2 py-0.5 w-24">Cargos</th>
                <th className="text-right px-2 py-0.5 w-24">Abonos</th>
                <th className="text-right px-2 py-0.5 w-28">Saldo final</th>
              </tr>
            </thead>
            <tbody>
              {cuentasRep.map((c) => (
                <tr key={c.id}>
                  <td className="px-2 py-[1px]">{c.codigo}</td>
                  <td className="px-2 py-[1px]">{c.nombre}</td>
                  <td className="px-2 py-[1px] text-right font-num tabular">{m(c.saldoAnterior)}</td>
                  <td className="px-2 py-[1px] text-right font-num tabular">{c.totalDebe ? m(c.totalDebe) : ""}</td>
                  <td className="px-2 py-[1px] text-right font-num tabular">{c.totalHaber ? m(c.totalHaber) : ""}</td>
                  <td className="px-2 py-[1px] text-right font-num tabular">{m(c.saldoFinal)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={3} className="text-right font-bold px-2 pt-3">Totales:</td>
                <td className="px-2 pt-3 text-right font-num tabular font-semibold border-t border-black">{m(totales.debe)}</td>
                <td className="px-2 pt-3 text-right font-num tabular font-semibold border-t border-black">{m(totales.haber)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-6">
          {cuentasRep.map((c) => (
            <div key={c.id} className="partida-imprimir bg-white border border-paperLine px-8 py-6 text-[12px] text-black">
              <div className="text-center mb-3">
                <p className="text-[11px] uppercase">{empresa?.nombre}</p>
                <p className="text-base font-bold">Movimiento de cuentas</p>
                <p className="text-sm">{textoPeriodo(desde, hasta)}</p>
              </div>
              <p><b>Cuenta:</b>&nbsp; {c.codigo}</p>
              <p className="mb-2"><b>Nombre de Cuenta:</b>&nbsp; <span className="uppercase">{c.nombre}</span></p>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border border-black">
                    <th className="text-left px-2 py-0.5 w-24">Fecha</th>
                    <th className="text-left px-2 py-0.5 w-20">Partida</th>
                    <th className="text-left px-2 py-0.5">Concepto</th>
                    <th className="text-right px-2 py-0.5 w-24">Debe</th>
                    <th className="text-right px-2 py-0.5 w-24">Haber</th>
                    <th className="text-right px-2 py-0.5 w-28">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan={5} className="px-2 py-[1px] text-right">Saldo anterior:</td>
                    <td className="px-2 py-[1px] text-right font-num tabular">{m(c.saldoAnterior)}</td>
                  </tr>
                  {c.filas.map((f) => (
                    <tr key={f.key}>
                      <td className="px-2 py-[1px] align-top">{fechaCorta(f.fecha)}</td>
                      <td className="px-2 py-[1px] align-top font-num">{f.partida}</td>
                      <td className="px-2 py-[1px] align-top break-words">{f.concepto}</td>
                      <td className="px-2 py-[1px] text-right font-num tabular align-top">{f.debe ? m(f.debe) : ""}</td>
                      <td className="px-2 py-[1px] text-right font-num tabular align-top">{f.haber ? m(f.haber) : ""}</td>
                      <td className="px-2 py-[1px] text-right font-num tabular align-top">{m(f.saldo)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={3} className="text-right font-bold px-2 pt-3">Totales:</td>
                    <td className="px-2 pt-3 text-right font-num tabular font-semibold border-t border-black">{m(c.totalDebe)}</td>
                    <td className="px-2 pt-3 text-right font-num tabular font-semibold border-t border-black">{m(c.totalHaber)}</td>
                    <td className="px-2 pt-3 text-right font-num tabular font-semibold border-t border-black">{m(c.saldoFinal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
