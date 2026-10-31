"use client";

import { useEffect, useState } from "react";
import { useEmpresa } from "@/lib/EmpresaContext";
import {
  obtenerCuentasConMovimientos,
  filtrarMovimientosHasta,
  calcularEstadoResultados,
  calcularBalanceGeneral,
  formatoMoneda,
} from "@/lib/contabilidad";
import { EncabezadoAlFecha, FirmasEstadosFinancieros } from "@/lib/EncabezadoReporte";
import { exportarAExcel } from "@/lib/exportarExcel";
import { nombreCuentaMayor } from "@/lib/cuentasMayor";

export default function BalanceGeneralPage() {
  const { empresa, empresaId } = useEmpresa();
  const [cargando, setCargando] = useState(true);
  const [cuentasBase, setCuentasBase] = useState([]);
  const [fechaCorte, setFechaCorte] = useState(
    () => new Date().toISOString().slice(0, 10)
  );

  useEffect(() => {
    let activo = true;
    setCargando(true);
    obtenerCuentasConMovimientos(empresaId).then((cuentas) => {
      if (!activo) return;
      setCuentasBase(cuentas);
      setCargando(false);
    });
    return () => {
      activo = false;
    };
  }, [empresaId]);

  if (cargando) {
    return <p className="text-inkSoft text-sm">Calculando…</p>;
  }

  const cuentasFiltradas = filtrarMovimientosHasta(cuentasBase, fechaCorte);
  const resultados = calcularEstadoResultados(cuentasFiltradas);
  const datos = calcularBalanceGeneral(cuentasFiltradas, resultados.utilidadNeta);

  const sinDatos =
    datos.activos.length === 0 && datos.pasivos.length === 0 && datos.capital.length === 0;

  // Clasificación corriente / no corriente según el código del catálogo
  // (12 = activo no corriente, 22 = pasivo no corriente).
  // Agrupa las cuentas de detalle en su cuenta de mayor (4 primeros dígitos).
  function porMayor(lineas) {
    const mapa = new Map();
    for (const l of lineas) {
      const cod = String(l.cuenta.codigo || "").slice(0, 4);
      const g = mapa.get(cod) || { cuenta: { id: cod, codigo: cod, nombre: nombreCuentaMayor(cod) || l.cuenta.nombre }, monto: 0 };
      g.monto += l.monto;
      mapa.set(cod, g);
    }
    return [...mapa.values()].filter((g) => Math.abs(g.monto) > 0.004).sort((a, b) => a.cuenta.codigo.localeCompare(b.cuenta.codigo));
  }
  const activoNoCte = (l) => String(l.cuenta.codigo || "").startsWith("12");
  const pasivoNoCte = (l) => String(l.cuenta.codigo || "").startsWith("22");
  const actCte = porMayor(datos.activos.filter((l) => !activoNoCte(l)));
  const actNoCte = porMayor(datos.activos.filter(activoNoCte));
  const pasCte = porMayor(datos.pasivos.filter((l) => !pasivoNoCte(l)));
  const pasNoCte = porMayor(datos.pasivos.filter(pasivoNoCte));
  const suma = (ls) => ls.reduce((a, l) => a + l.monto, 0);
  const totActCte = suma(actCte);
  const totActNoCte = suma(actNoCte);
  const totPasCte = suma(pasCte);
  const totPasNoCte = suma(pasNoCte);

  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const textoFecha = (() => {
    const [a, m, d] = String(fechaCorte || "").split("-").map(Number);
    return a && m && d ? `${d} de ${MESES[m - 1]} de ${a}` : "";
  })();

  const patrimonio = [
    ...porMayor(datos.capital).map((l) => ({ nombre: l.cuenta.nombre, monto: l.monto })),
    { nombre: datos.utilidadNeta >= 0 ? "Utilidad del período" : "Pérdida del período", monto: datos.utilidadNeta },
  ];

  // Estructura única que usan la pantalla y el Excel.
  // tipo: titulo | sub | linea | total | granTotal | espacio
  const filas = [
    { t: "titulo", n: "ACTIVO" },
    { t: "sub", n: "ACTIVO CORRIENTE" },
    ...actCte.map((l) => ({ t: "linea", n: l.cuenta.nombre, m: l.monto })),
    { t: "total", n: "TOTAL ACTIVO CORRIENTE", m: totActCte },
    ...(actNoCte.length
      ? [
          { t: "sub", n: "ACTIVO NO CORRIENTE" },
          ...actNoCte.map((l) => ({ t: "linea", n: l.cuenta.nombre, m: l.monto })),
          { t: "total", n: "TOTAL ACTIVO NO CORRIENTE", m: totActNoCte },
        ]
      : []),
    { t: "granTotal", n: "TOTAL ACTIVO", m: datos.totalActivo },
    { t: "espacio" },
    { t: "titulo", n: "PASIVO Y PATRIMONIO NETO" },
    { t: "sub", n: "PASIVO CORRIENTE" },
    ...pasCte.map((l) => ({ t: "linea", n: l.cuenta.nombre, m: l.monto })),
    { t: "total", n: "TOTAL PASIVO CORRIENTE", m: totPasCte },
    ...(pasNoCte.length
      ? [
          { t: "sub", n: "PASIVO NO CORRIENTE" },
          ...pasNoCte.map((l) => ({ t: "linea", n: l.cuenta.nombre, m: l.monto })),
          { t: "total", n: "TOTAL PASIVO NO CORRIENTE", m: totPasNoCte },
        ]
      : []),
    { t: "total", n: "TOTAL PASIVO", m: datos.totalPasivo },
    { t: "sub", n: "PATRIMONIO NETO" },
    ...patrimonio.map((l) => ({ t: "linea", n: l.nombre, m: l.monto })),
    { t: "total", n: "TOTAL PATRIMONIO NETO", m: datos.totalCapital },
    { t: "granTotal", n: "TOTAL PASIVO Y PATRIMONIO NETO", m: datos.totalPasivoCapital },
  ];

  function exportar() {
    const out = [
      [empresa?.nombre || ""],
      ["Balance General"],
      [textoFecha ? `Al ${textoFecha}` : ""],
      [empresa?.moneda ? `(${empresa.moneda})` : ""],
      [],
      ...filas.map((f) => {
        if (f.t === "espacio") return [];
        const sangria = f.t === "linea" ? "      " : f.t === "sub" ? "   " : "";
        return [sangria + f.n, f.m === undefined ? "" : Math.round(f.m * 100) / 100];
      }),
    ];
    exportarAExcel(`balance-general-${fechaCorte || "actual"}`, [{ nombre: "Balance General", filas: out }]);
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-4 no-print">
        <h2 className="font-display text-lg font-semibold flex-1">Balance General</h2>
        <button onClick={() => window.print()} className="text-xs text-inkSoft hover:text-ink underline underline-offset-2">
          Imprimir
        </button>
        {!sinDatos && (
          <button onClick={exportar} className="text-xs text-ledgerDark hover:underline">
            Exportar a Excel
          </button>
        )}
      </div>

      <EncabezadoAlFecha fechaCorte={fechaCorte} onFechaCorte={setFechaCorte} />

      {sinDatos ? (
        <p className="text-inkSoft text-sm">Todavía no hay movimientos registrados.</p>
      ) : (
        <>
          <div className="bg-white border border-paperLine rounded-sm px-8 py-6 max-w-3xl text-[13px] text-black">
            <p className="font-bold">{empresa?.nombre}</p>
            <p className="font-bold">Balance General</p>
            <p className="font-bold">Al {textoFecha}</p>
            {empresa?.moneda && <p className="font-bold">({empresa.moneda})</p>}

            <table className="w-full mt-4 border-collapse">
              <tbody>
                {filas.map((f, i) => {
                  if (f.t === "espacio") return <tr key={i}><td colSpan={2} className="h-4" /></tr>;
                  const cls = {
                    titulo: "font-bold pt-2",
                    sub: "font-bold pl-3 pt-1.5",
                    linea: "pl-8",
                    total: "font-bold pl-3",
                    granTotal: "font-bold",
                  }[f.t];
                  const caja =
                    f.t === "total" ? "border-t border-black" : f.t === "granTotal" ? "border-t border-black border-b-[3px] border-double" : "";
                  return (
                    <tr key={i}>
                      <td className={`py-0.5 ${cls}`}>{f.n}</td>
                      <td className="w-36 py-0.5 text-right tabular font-num align-bottom">
                        {f.m !== undefined && (
                          <span className={`inline-block min-w-[7.5rem] ${caja} ${f.t === "total" || f.t === "granTotal" ? "font-bold" : ""}`}>
                            {formatoMoneda(f.m)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <p className="text-center text-xs mt-8">Las notas anexas forman parte integral de los estados financieros</p>
          </div>

          <p className={`text-sm mt-4 no-print ${datos.cuadra ? "text-ledger" : "text-rust"}`}>
            {datos.cuadra ? "✓ El balance cuadra: Activo = Pasivo + Patrimonio." : "⚠ El balance no cuadra — revisa las partidas registradas."}
          </p>
        </>
      )}

      <FirmasEstadosFinancieros />
    </div>
  );
}
