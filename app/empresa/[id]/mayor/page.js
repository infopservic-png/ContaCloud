"use client";

import { useEffect, useMemo, useState } from "react";
import { useEmpresa } from "@/lib/EmpresaContext";
import { obtenerCuentasConMovimientos, formatoMoneda } from "@/lib/contabilidad";
import { nombreCuentaMayor } from "@/lib/cuentasMayor";
import { compararPartidas, etiquetaPartida } from "@/lib/partidas";
import CuentaCombobox from "@/lib/CuentaCombobox";
import { exportarAExcel } from "@/lib/exportarExcel";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const ACREEDORAS = ["Pasivo", "Capital", "Ingreso"];

function fechaCorta(f) {
  const [a, m, d] = String(f || "").split("-");
  return a ? `${d}/${m}/${a}` : "";
}
function textoPeriodo(desde, hasta) {
  const p = (f) => {
    const [a, m, d] = f.split("-").map(Number);
    return { a, m, d };
  };
  if (!desde && !hasta) return "Todos los movimientos";
  if (desde && hasta) {
    const x = p(desde), y = p(hasta);
    if (x.a === y.a && x.m === y.m) return `Del ${x.d} al ${y.d} de ${MESES[x.m - 1]} de ${x.a}`;
    return `Del ${fechaCorta(desde)} al ${fechaCorta(hasta)}`;
  }
  return desde ? `Desde el ${fechaCorta(desde)}` : `Hasta el ${fechaCorta(hasta)}`;
}

export default function MayorPage() {
  const { cuentas, empresaId, empresa } = useEmpresa();
  const [datos, setDatos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [cuentaId, setCuentaId] = useState("todas");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [vista, setVista] = useState("dia"); // "dia" (como el SAC) | "partida"

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

  const modoAgrupado = cuentaId === "todas";

  // Tarjetas: una por cuenta de mayor (4 dígitos) o la cuenta elegida, con su saldo anterior y movimientos del período.
  const tarjetas = useMemo(() => {
    const base = datos.filter((c) => (modoAgrupado ? true : c.id === cuentaId)).filter((c) => (c.movimientos || []).length > 0);
    let grupos;
    if (modoAgrupado) {
      const porCodigo4 = new Map();
      for (const cuenta of base) {
        const codigo4 = cuenta.codigo.slice(0, 4);
        if (!porCodigo4.has(codigo4)) {
          porCodigo4.set(codigo4, { codigo4, nombre: nombreCuentaMayor(codigo4) || codigo4, clase: cuenta.clase, movimientos: [] });
        }
        for (const m of cuenta.movimientos) porCodigo4.get(codigo4).movimientos.push({ ...m, cuentaOrigen: cuenta });
      }
      grupos = [...porCodigo4.values()].sort((a, b) => a.codigo4.localeCompare(b.codigo4));
    } else {
      grupos = base.map((c) => ({ codigo4: c.codigo, nombre: c.nombre, clase: c.clase, movimientos: c.movimientos.map((m) => ({ ...m, cuentaOrigen: c })) }));
    }

    return grupos
      .map((g) => {
        const acreedora = ACREEDORAS.includes(g.clase);
        const signo = acreedora ? -1 : 1; // saldo natural de la cuenta
        const ordenados = [...g.movimientos].sort((a, b) => compararPartidas(a.transacciones, b.transacciones));
        const fecha = (m) => String(m.transacciones?.fecha ?? "");
        const antes = ordenados.filter((m) => desde && fecha(m) < desde);
        const periodo = ordenados.filter((m) => (!desde || fecha(m) >= desde) && (!hasta || fecha(m) <= hasta));
        const saldoAnterior = antes.reduce((s, m) => s + signo * (Number(m.debe) - Number(m.haber)), 0);

        let saldo = saldoAnterior;
        let filas;
        if (vista === "dia") {
          const porDia = new Map();
          for (const m of periodo) {
            const f = fecha(m);
            const x = porDia.get(f) || { fecha: f, debe: 0, haber: 0 };
            x.debe += Number(m.debe);
            x.haber += Number(m.haber);
            porDia.set(f, x);
          }
          filas = [...porDia.values()]
            .sort((a, b) => a.fecha.localeCompare(b.fecha))
            .map((d) => {
              saldo += signo * (d.debe - d.haber);
              return { key: d.fecha, fecha: d.fecha, concepto: "Transacciones del día", debe: d.debe, haber: d.haber, saldo };
            });
        } else {
          filas = periodo.map((m) => {
            saldo += signo * (Number(m.debe) - Number(m.haber));
            return {
              key: m.id,
              fecha: fecha(m),
              partida: etiquetaPartida(m.transacciones?.tipo, m.transacciones?.numero_partida),
              concepto: m.transacciones?.descripcion || "Movimientos del día",
              debe: Number(m.debe),
              haber: Number(m.haber),
              saldo,
            };
          });
        }
        const totalDebe = periodo.reduce((a, m) => a + Number(m.debe), 0);
        const totalHaber = periodo.reduce((a, m) => a + Number(m.haber), 0);
        return { ...g, acreedora, saldoAnterior, filas, totalDebe, totalHaber, saldoFinal: saldo, hayPeriodo: periodo.length > 0 || antes.length > 0 };
      })
      .filter((g) => g.hayPeriodo);
  }, [datos, modoAgrupado, cuentaId, desde, hasta, vista]);

  if (cargando) {
    return <p className="text-inkSoft text-sm">Cargando mayor…</p>;
  }

  function exportarMayor() {
    const filas = [[empresa?.nombre || ""], ["Libro Mayor"], [textoPeriodo(desde, hasta)], []];
    for (const g of tarjetas) {
      filas.push(["Cuenta:", g.codigo4], ["Nombre de Cuenta:", g.nombre]);
      filas.push(vista === "dia" ? ["Fecha", "Concepto", "Debe", "Haber", "Saldo"] : ["Fecha", "Partida", "Concepto", "Debe", "Haber", "Saldo"]);
      filas.push(vista === "dia" ? ["", "Saldo anterior:", "", "", g.saldoAnterior] : ["", "", "Saldo anterior:", "", "", g.saldoAnterior]);
      for (const f of g.filas) {
        filas.push(vista === "dia" ? [fechaCorta(f.fecha), f.concepto, f.debe, f.haber, f.saldo] : [fechaCorta(f.fecha), f.partida, f.concepto, f.debe, f.haber, f.saldo]);
      }
      filas.push(vista === "dia" ? ["", "Totales:", g.totalDebe, g.totalHaber, g.saldoFinal] : ["", "", "Totales:", g.totalDebe, g.totalHaber, g.saldoFinal]);
      filas.push([]);
    }
    exportarAExcel("libro-mayor", [{ nombre: "Libro Mayor", filas }]);
  }

  const sel = "border border-paperLine rounded-sm px-2 py-1 bg-white text-ink text-xs";
  const m = (n) => formatoMoneda(n);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 no-print">
        <h2 className="font-display text-lg font-semibold">Libro Mayor</h2>
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-64">
            <CuentaCombobox cuentas={cuentas} value={cuentaId === "todas" ? "" : cuentaId} onChange={(id) => setCuentaId(id || "todas")} placeholder="Buscar cuenta… (vacío = todas)" />
          </div>
          {cuentaId !== "todas" && (
            <button onClick={() => setCuentaId("todas")} className="text-xs text-inkSoft hover:text-ink underline underline-offset-2">Ver todas</button>
          )}
          <button onClick={() => window.print()} className="text-xs text-inkSoft hover:text-ink underline underline-offset-2">Imprimir</button>
          {tarjetas.length > 0 && (
            <button onClick={exportarMayor} className="text-xs text-ledgerDark hover:underline">Exportar a Excel</button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4 mb-4 no-print text-xs text-inkSoft">
        <label>
          <span className="block mb-1">Desde</span>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={sel} />
        </label>
        <label>
          <span className="block mb-1">Hasta</span>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={sel} />
        </label>
        <label>
          <span className="block mb-1">Vista</span>
          <select value={vista} onChange={(e) => setVista(e.target.value)} className={sel}>
            <option value="dia">Por día (movimientos del día)</option>
            <option value="partida">Detalle por partida</option>
          </select>
        </label>
        {(desde || hasta) && (
          <button onClick={() => { setDesde(""); setHasta(""); }} className="underline underline-offset-2 hover:text-ink pb-1">Quitar fechas</button>
        )}
      </div>

      {modoAgrupado && (
        <p className="text-xs text-inkSoft mb-4 no-print">
          Mostrando el Mayor acumulado por cuenta de mayor (4 dígitos). Busca una cuenta específica arriba para ver su detalle individual.
        </p>
      )}

      {tarjetas.length === 0 ? (
        <p className="text-inkSoft text-sm">No hay movimientos para mostrar{desde || hasta ? " en ese período" : ""}.</p>
      ) : (
        <div className="space-y-6">
          {tarjetas.map((g) => (
            <div key={g.codigo4} className="partida-imprimir bg-white border border-paperLine px-8 py-6 text-[12px] text-black">
              <div className="text-center mb-3">
                <p className="text-[11px] uppercase">{empresa?.nombre}</p>
                <p className="text-base font-bold">Libro Mayor</p>
                <p className="text-sm">{textoPeriodo(desde, hasta)}</p>
                <p className="text-sm uppercase">Valores expresados en {empresa?.moneda ? empresa.moneda.replace(/\s*\(.*\)\s*$/, "") : "US dólares"}</p>
              </div>
              <p><b>Cuenta:</b>&nbsp; {g.codigo4}</p>
              <p className="mb-2"><b>Nombre de Cuenta:</b>&nbsp; <span className="uppercase">{g.nombre}</span></p>

              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-y-2 border-black text-left">
                    <th className="px-2 py-1">Fecha</th>
                    {vista === "partida" && <th className="px-2 py-1">Partida</th>}
                    <th className="px-2 py-1">Concepto</th>
                    <th className="px-2 py-1 text-right w-28">Debe</th>
                    <th className="px-2 py-1 text-right w-28">Haber</th>
                    <th className="px-2 py-1 text-right w-28">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan={vista === "partida" ? 5 : 4} className="px-2 py-1 text-right font-bold">Saldo anterior:</td>
                    <td className="px-2 py-1 text-right font-num tabular">{m(g.saldoAnterior)}</td>
                  </tr>
                  <tr><td colSpan={vista === "partida" ? 6 : 5} className="h-2" /></tr>
                  {g.filas.map((f) => (
                    <tr key={f.key}>
                      <td className="px-2 py-[1px] whitespace-nowrap">{fechaCorta(f.fecha)}</td>
                      {vista === "partida" && <td className="px-2 py-[1px] font-num">{f.partida}</td>}
                      <td className="px-2 py-[1px]">{f.concepto}</td>
                      <td className="px-2 py-[1px] text-right font-num tabular">{m(f.debe)}</td>
                      <td className="px-2 py-[1px] text-right font-num tabular">{m(f.haber)}</td>
                      <td className="px-2 py-[1px] text-right font-num tabular">{m(f.saldo)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-black font-bold">
                    <td colSpan={vista === "partida" ? 3 : 2} className="px-2 py-1 text-right">Totales:</td>
                    <td className="px-2 py-1 text-right font-num tabular">{m(g.totalDebe)}</td>
                    <td className="px-2 py-1 text-right font-num tabular">{m(g.totalHaber)}</td>
                    <td className="px-2 py-1 text-right font-num tabular">{m(g.saldoFinal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
