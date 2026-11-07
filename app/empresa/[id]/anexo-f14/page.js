"use client";

import { useEffect, useMemo, useState } from "react";
import { useEmpresa } from "@/lib/EmpresaContext";
import { formatoMoneda } from "@/lib/contabilidad";
import { exportarAExcel } from "@/lib/exportarExcel";
import { obtenerConfig, guardarConfig, r2 } from "@/lib/rrhh";
import {
  CODIGOS_INGRESO,
  TIPO_OPERACION,
  CLASIFICACION,
  SECTOR,
  TIPO_COSTO,
  obtenerFilasF14,
  csvF14,
  descargarCsv,
  periodoMMAAAA,
} from "@/lib/anexosRenta";

const mesAnterior = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

function Sel({ valor, opciones, onChange, ancho = "w-16" }) {
  return (
    <select value={valor} onChange={(e) => onChange(e.target.value)} className={`${ancho} border border-paperLine rounded-sm px-1 py-0.5 text-xs bg-white`} title={opciones.find(([c]) => c === valor)?.[1]}>
      {opciones.map(([c, t]) => (
        <option key={c} value={c} title={t}>{c} {t.length > 28 ? t.slice(0, 28) + "…" : t}</option>
      ))}
    </select>
  );
}

export default function AnexoF14Page() {
  const { empresaId, empresa } = useEmpresa();
  const [ym, setYm] = useState(mesAnterior());
  const [cfg, setCfg] = useState(null);
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);

  useEffect(() => {
    obtenerConfig(empresaId).then(setCfg).catch((e) => setError(e.message));
  }, [empresaId]);

  async function cargar() {
    if (!cfg) return;
    setCargando(true);
    setError(null);
    setAviso(null);
    try {
      const f = await obtenerFilasF14(empresaId, ym, cfg);
      setFilas(f.map((x, i) => ({ ...x, id: i, incluir: true })));
    } catch (e) {
      setError("No se pudo cargar (¿corriste la migración 29 en Supabase?): " + (e.message || e));
    } finally {
      setCargando(false);
    }
  }
  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ym, !!cfg, empresaId]);

  const cambiar = (id, cambios) => setFilas((fs) => fs.map((f) => (f.id === id ? { ...f, ...cambios } : f)));
  const aTodas = (cambios) => setFilas((fs) => fs.map((f) => ({ ...f, ...cambios })));

  const incluidas = useMemo(() => filas.filter((f) => f.incluir), [filas]);
  const tot = useMemo(
    () => ({
      devengado: r2(incluidas.reduce((a, f) => a + Number(f.devengado), 0)),
      bonif: r2(incluidas.reduce((a, f) => a + Number(f.bonificaciones), 0)),
      retenido: r2(incluidas.reduce((a, f) => a + Number(f.retenido), 0)),
      afp: r2(incluidas.reduce((a, f) => a + Number(f.afp), 0)),
      isss: r2(incluidas.reduce((a, f) => a + Number(f.isss), 0)),
    }),
    [incluidas]
  );
  const sinDocumento = incluidas.filter((f) => !f.nit && !f.dui);

  function descargar() {
    if (incluidas.length === 0) return setError("No hay filas para el anexo.");
    if (sinDocumento.length) {
      if (!confirm(`${sinDocumento.length} fila(s) no tienen NIT ni DUI (${sinDocumento.map((f) => f.nombre).join(", ")}). Hacienda lo rechazará. ¿Descargar de todos modos?`)) return;
    }
    descargarCsv(`ANEXO F14 ${periodoMMAAAA(ym)}.csv`, csvF14(incluidas));
  }

  function excel() {
    const filasX = [
      [empresa?.nombre || ""],
      [`Anexo F14 — retenciones de renta — periodo ${periodoMMAAAA(ym)}`],
      [],
      ["Origen", "Domiciliado", "País", "Nombre", "NIT", "DUI", "Código ingreso", "Monto devengado", "Bonificaciones y gratificaciones", "Impuesto retenido", "Aguinaldo exento", "Aguinaldo gravado", "AFP", "ISSS", "INPEP", "IPSFA", "CEFAFA", "Bienestar magisterial", "ISSS IVM", "Tipo operación", "Clasificación", "Sector", "Tipo costo/gasto", "Periodo"],
      ...incluidas.map((f) => [f.origen, f.domiciliado, f.pais, f.nombre, f.nit, f.dui, f.codigoIngreso, Number(f.devengado), Number(f.bonificaciones), Number(f.retenido), 0, 0, Number(f.afp), Number(f.isss), 0, 0, 0, 0, 0, f.tipoOperacion, f.clasificacion, f.sector, f.tipoCosto, f.periodo]),
      ["", "", "", "", "", "", "Totales:", tot.devengado, tot.bonif, tot.retenido, "", "", tot.afp, tot.isss],
    ];
    exportarAExcel(`anexo-f14-${periodoMMAAAA(ym)}`, [{ nombre: "ANEXO F14", filas: filasX }]);
  }

  async function guardarPredeterminados(v) {
    try {
      await guardarConfig(empresaId, { ...cfg, ...v });
      setCfg({ ...cfg, ...v });
      setAviso("Valores predeterminados guardados.");
    } catch (e) {
      setError("No se pudo guardar: " + (e.message || e));
    }
  }

  const m = (n) => formatoMoneda(n);
  const lbl = "block text-xs font-medium text-inkSoft mb-1";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 no-print">
        <h2 className="font-display text-lg font-semibold">Anexo F14 — retenciones de renta</h2>
        <div className="flex items-center gap-3">
          <button onClick={excel} disabled={!incluidas.length} className="text-xs text-ledgerDark hover:underline disabled:opacity-50">Exportar a Excel</button>
          <button onClick={descargar} disabled={!incluidas.length} className="sac-btn sac-btn-primario font-medium">Descargar CSV para Hacienda</button>
        </div>
      </div>

      <div className="no-print bg-[#F7F4EA] border border-paperLine rounded-sm p-3 flex flex-wrap items-end gap-4">
        <label>
          <span className={lbl}>Periodo</span>
          <input type="month" value={ym} onChange={(e) => setYm(e.target.value)} className="border border-paperLine rounded-sm px-2 py-1 bg-white text-sm" />
        </label>
        {cfg && filas.length > 0 && (() => {
          const ref = filas.find((x) => !x.deCompra) || filas[0];
          return (
          <>
            <label><span className={lbl}>Tipo de operación (todas)</span><Sel ancho="w-44" valor={ref.tipoOperacion} opciones={TIPO_OPERACION} onChange={(v) => aTodas({ tipoOperacion: v })} /></label>
            <label><span className={lbl}>Clasificación (todas)</span><Sel ancho="w-32" valor={ref.clasificacion} opciones={CLASIFICACION} onChange={(v) => aTodas({ clasificacion: v })} /></label>
            <label><span className={lbl}>Sector (todas)</span><Sel ancho="w-36" valor={ref.sector} opciones={SECTOR} onChange={(v) => aTodas({ sector: v })} /></label>
            <label><span className={lbl}>Tipo costo/gasto (todas)</span><Sel ancho="w-48" valor={ref.tipoCosto} opciones={TIPO_COSTO} onChange={(v) => aTodas({ tipoCosto: v })} /></label>
            <button
              onClick={() => guardarPredeterminados({ f14_tipo_operacion: ref.tipoOperacion, f14_clasificacion: ref.clasificacion, f14_sector: ref.sector, f14_tipo_costo: ref.tipoCosto })}
              className="text-xs text-accentDark hover:underline"
            >
              Guardar como predeterminados
            </button>
          </>
          );
        })()}
      </div>

      {error && <p className="text-sm text-rust">{error}</p>}
      {aviso && <p className="text-sm text-ledgerDark">{aviso}</p>}
      {sinDocumento.length > 0 && (
        <p className="text-xs text-rust">Sin NIT ni DUI: {sinDocumento.map((f) => f.nombre).join(", ")}. Complétalos en Empleados o Proveedores.</p>
      )}

      {cargando ? (
        <p className="text-sm text-inkSoft">Cargando…</p>
      ) : filas.length === 0 ? (
        <p className="text-sm text-inkSoft">No hay planillas ni compras con retención de renta en este periodo.</p>
      ) : (
        <div className="overflow-x-auto bg-white border border-paperLine rounded-sm">
          <table className="w-full text-xs">
            <thead className="bg-brand text-onBrand">
              <tr>
                <th className="px-2 py-1 no-print" />
                <th className="text-left font-normal px-2 py-1">Origen</th>
                <th className="text-left font-normal px-2 py-1">Nombre</th>
                <th className="text-left font-normal px-2 py-1">NIT / DUI</th>
                <th className="text-left font-normal px-2 py-1">Código ingreso</th>
                <th className="text-right font-normal px-2 py-1">Devengado</th>
                <th className="text-right font-normal px-2 py-1">Bonif.</th>
                <th className="text-right font-normal px-2 py-1">Retenido</th>
                <th className="text-right font-normal px-2 py-1">AFP</th>
                <th className="text-right font-normal px-2 py-1">ISSS</th>
                <th className="text-left font-normal px-2 py-1">Operación</th>
                <th className="text-left font-normal px-2 py-1">Clasif.</th>
                <th className="text-left font-normal px-2 py-1">Sector</th>
                <th className="text-left font-normal px-2 py-1">Costo/gasto</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id} className={"border-t border-paperLine " + (f.incluir ? "" : "opacity-40")}>
                  <td className="px-2 py-1 no-print"><input type="checkbox" checked={f.incluir} onChange={(e) => cambiar(f.id, { incluir: e.target.checked })} title="Incluir en el anexo" /></td>
                  <td className="px-2 py-1 whitespace-nowrap">{f.origen}</td>
                  <td className="px-2 py-1">{f.nombre}</td>
                  <td className={"px-2 py-1 font-num " + (!f.nit && !f.dui ? "text-rust" : "")}>{f.dui ? `DUI ${f.dui}` : f.nit ? `NIT ${f.nit}` : "falta"}</td>
                  <td className="px-2 py-1"><Sel ancho="w-40" valor={f.codigoIngreso} opciones={CODIGOS_INGRESO} onChange={(v) => cambiar(f.id, { codigoIngreso: v })} /></td>
                  <td className="px-2 py-1 text-right font-num tabular">{m(f.devengado)}</td>
                  <td className="px-2 py-1 text-right font-num tabular">{m(f.bonificaciones)}</td>
                  <td className="px-2 py-1 text-right font-num tabular">{m(f.retenido)}</td>
                  <td className="px-2 py-1 text-right font-num tabular">{m(f.afp)}</td>
                  <td className="px-2 py-1 text-right font-num tabular">{m(f.isss)}</td>
                  <td className="px-2 py-1"><Sel ancho="w-28" valor={f.tipoOperacion} opciones={TIPO_OPERACION} onChange={(v) => cambiar(f.id, { tipoOperacion: v })} /></td>
                  <td className="px-2 py-1"><Sel ancho="w-24" valor={f.clasificacion} opciones={CLASIFICACION} onChange={(v) => cambiar(f.id, { clasificacion: v })} /></td>
                  <td className="px-2 py-1"><Sel ancho="w-28" valor={f.sector} opciones={SECTOR} onChange={(v) => cambiar(f.id, { sector: v })} /></td>
                  <td className="px-2 py-1"><Sel ancho="w-36" valor={f.tipoCosto} opciones={TIPO_COSTO} onChange={(v) => cambiar(f.id, { tipoCosto: v })} /></td>
                </tr>
              ))}
              <tr className="border-t border-black font-semibold">
                <td colSpan={5} className="px-2 py-1 text-right">Totales ({incluidas.length} filas):</td>
                <td className="px-2 py-1 text-right font-num tabular">{m(tot.devengado)}</td>
                <td className="px-2 py-1 text-right font-num tabular">{m(tot.bonif)}</td>
                <td className="px-2 py-1 text-right font-num tabular">{m(tot.retenido)}</td>
                <td className="px-2 py-1 text-right font-num tabular">{m(tot.afp)}</td>
                <td className="px-2 py-1 text-right font-num tabular">{m(tot.isss)}</td>
                <td colSpan={4} />
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-inkSoft no-print">
        Empleados: se suman las quincenas del mes; el código es 01 si hubo retención y 60 si cayó en el Tramo I. Compras: entran las que tienen retención de renta
        (o la que trae el DTE importado) y llevan código 8 «más de 1 anexo» en operación, clasificación, sector y costo/gasto, porque ya se informan en el F-07. El archivo CSV usa el formato de la plantilla de Hacienda (separado por «;»).
      </p>
    </div>
  );
}
