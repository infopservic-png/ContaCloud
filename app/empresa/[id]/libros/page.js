"use client";

import { useEffect, useMemo, useState } from "react";
import { useEmpresa } from "@/lib/EmpresaContext";
import { formatoMoneda } from "@/lib/contabilidad";
import { exportarAExcel } from "@/lib/exportarExcel";
import {
  LIBROS, rangoDelMes, cargarDocumentosPeriodo, armarLibros, tablaLibro,
  armarLibroContribuyentes, filasExcelContribuyentes, armarLibroConsumidor, filasExcelConsumidor,
  armarLibroCompras, filasExcelCompras,
} from "@/lib/libros";
import LibroContribuyentes from "@/components/LibroContribuyentes";
import LibroConsumidor from "@/components/LibroConsumidor";
import LibroCompras from "@/components/LibroCompras";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const inputCls = "border border-paperLine rounded-sm px-2 py-1.5 text-sm bg-white";

export default function LibrosPage() {
  const { empresa, empresaId } = useEmpresa();
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [libroId, setLibroId] = useState("ventas_contribuyentes");
  const [folios, setFolios] = useState({ ventas_contribuyentes: 1, ventas_consumidor: 1, compras: 1 });
  const [ventas, setVentas] = useState([]);
  const [compras, setCompras] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const { desde, hasta } = rangoDelMes(anio, mes);

  useEffect(() => {
    let activo = true;
    setCargando(true);
    setError(null);
    Promise.all([
      cargarDocumentosPeriodo("venta", empresaId, desde, hasta),
      cargarDocumentosPeriodo("compra", empresaId, desde, hasta),
    ])
      .then(([v, c]) => {
        if (!activo) return;
        setVentas(v);
        setCompras(c);
      })
      .catch((e) => activo && setError("No se pudieron cargar los documentos: " + e.message))
      .finally(() => activo && setCargando(false));
    return () => {
      activo = false;
    };
  }, [empresaId, desde, hasta]);

  const { libros, totales, resumenIva } = useMemo(() => armarLibros(ventas, compras), [ventas, compras]);
  const oficialContrib = useMemo(() => armarLibroContribuyentes(ventas), [ventas]);
  const oficialConsumidor = useMemo(() => armarLibroConsumidor(ventas), [ventas]);
  const oficialCompras = useMemo(() => armarLibroCompras(compras), [compras]);
  const esOficial = true; // los tres libros usan el formato oficial
  const folio = folios[libroId];
  const filas = libros[libroId];
  const { encabezados, cuerpo, pie } = tablaLibro(libroId, filas, totales[libroId]);
  const etiqueta = LIBROS.find((l) => l.id === libroId).etiqueta;
  const periodo = `${MESES[mes - 1]} ${anio}`;

  function exportar() {
    if (esOficial) {
      const datos = { empresa, mes: MESES[mes - 1], anio, folio };
      const hoja =
        libroId === "ventas_contribuyentes"
          ? filasExcelContribuyentes({ ...datos, libro: oficialContrib })
          : libroId === "ventas_consumidor"
          ? filasExcelConsumidor({ ...datos, libro: oficialConsumidor })
          : filasExcelCompras({ ...datos, libro: oficialCompras });
      exportarAExcel(`libro-${libroId}-${anio}-${String(mes).padStart(2, "0")}`, [{ nombre: etiqueta, filas: hoja }]);
      return;
    }
    const cab = [
      [`Libro de ${etiqueta.toLowerCase()}`],
      [empresa?.nombre || ""],
      [`NIT: ${empresa?.nit || "—"}   NRC: ${empresa?.nrc || "—"}`],
      [`Período: ${periodo} (expresado en ${empresa?.moneda || "USD"})`],
      [],
    ];
    exportarAExcel(`libro-${libroId}-${anio}-${String(mes).padStart(2, "0")}`, [
      { nombre: etiqueta, filas: [...cab, encabezados, ...cuerpo, pie] },
    ]);
  }

  const numerica = (i) => i >= encabezados.length - 4;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4 no-print">
        <h2 className="font-display text-lg font-semibold">Libros de IVA</h2>
        <div className="flex flex-wrap items-center gap-3">
          <select value={mes} onChange={(e) => setMes(Number(e.target.value))} className={inputCls} aria-label="Mes">
            {MESES.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
          <input
            type="number"
            value={anio}
            min="2000"
            max="2100"
            onChange={(e) => setAnio(Number(e.target.value) || hoy.getFullYear())}
            className={inputCls + " w-24"}
            aria-label="Año"
          />
          {esOficial && (
            <label className="flex items-center gap-1.5 text-xs text-inkSoft">
              Folio
              <input
                type="number"
                min="1"
                value={folio}
                onChange={(e) => setFolios((f) => ({ ...f, [libroId]: Math.max(1, Number(e.target.value) || 1) }))}
                className={inputCls + " w-20"}
              />
            </label>
          )}
          <button onClick={() => window.print()} className="text-xs text-inkSoft hover:text-ink underline underline-offset-2">
            Imprimir
          </button>
          {(esOficial || filas.length > 0) && (
            <button onClick={exportar} className="text-xs text-ledgerDark hover:underline">
              Exportar a Excel
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 mb-4 no-print">
        {LIBROS.map((l) => (
          <button
            key={l.id}
            onClick={() => setLibroId(l.id)}
            aria-pressed={libroId === l.id}
            className={
              "px-3 py-1.5 text-sm rounded-sm border border-paperLine " +
              (libroId === l.id ? "bg-brand text-onBrand" : "bg-white text-inkSoft hover:bg-paperLine/30")
            }
          >
            {l.etiqueta} ({libros[l.id].length})
          </button>
        ))}
      </div>

      <style>{`@media print { @page { size: landscape; margin: 10mm; } .libro-oficial { border: 0 !important; padding: 0 !important; } }`}</style>
      {error && <p className="text-sm text-rust mb-3">{error}</p>}
      {esOficial && cargando && <p className="text-inkSoft text-sm">Cargando documentos…</p>}
      {esOficial && !cargando && libroId === "ventas_contribuyentes" && (
        <LibroContribuyentes empresa={empresa} mes={MESES[mes - 1]} anio={anio} folio={folio} libro={oficialContrib} />
      )}
      {esOficial && !cargando && libroId === "ventas_consumidor" && (
        <LibroConsumidor empresa={empresa} mes={MESES[mes - 1]} anio={anio} folio={folio} libro={oficialConsumidor} />
      )}
      {esOficial && !cargando && libroId === "compras" && (
        <LibroCompras empresa={empresa} mes={MESES[mes - 1]} anio={anio} folio={folio} libro={oficialCompras} />
      )}

      {!esOficial && (
      <>
      <div className="mb-3">
        <p className="font-display font-semibold">Libro de {etiqueta.toLowerCase()}</p>
        <p className="text-xs text-inkSoft">
          {empresa?.nombre} · NIT {empresa?.nit || "—"} · NRC {empresa?.nrc || "—"} · Período: {periodo} · Valores en {empresa?.moneda || "USD"}
        </p>
      </div>

      {cargando ? (
        <p className="text-inkSoft text-sm">Cargando documentos…</p>
      ) : filas.length === 0 ? (
        <p className="text-inkSoft text-sm">No hay documentos de este libro en {periodo}.</p>
      ) : (
        <div className="bg-[#F7F4EA] border border-paperLine rounded-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-inkSoft border-b border-paperLine">
                {encabezados.map((h, i) => (
                  <th key={h} className={"px-3 py-2 font-medium " + (numerica(i) ? "text-right" : "")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cuerpo.map((fila, r) => (
                <tr key={filas[r].id} className="border-t border-paperLine">
                  {fila.map((c, i) => (
                    <td
                      key={i}
                      className={
                        "px-3 py-1.5 " +
                        (numerica(i) ? "font-num text-right tabular" : i === 3 ? "font-num text-xs text-inkSoft" : "")
                      }
                    >
                      {numerica(i) ? formatoMoneda(c) : c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-paperLine font-medium">
                {pie.map((c, i) => (
                  <td key={i} className={"px-3 py-2 " + (numerica(i) ? "font-num text-right tabular" : "")}>
                    {numerica(i) ? formatoMoneda(c) : c}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      </>
      )}

      <section className="mt-6 no-print bg-[#F7F4EA] border border-paperLine rounded-sm p-4 max-w-md">
        <p className="text-sm font-medium mb-2">Resumen de IVA del período</p>
        <dl className="text-sm space-y-1">
          <div className="flex justify-between"><dt>IVA débito fiscal (ventas)</dt><dd className="font-num tabular">{formatoMoneda(resumenIva.debito)}</dd></div>
          <div className="flex justify-between"><dt>IVA crédito fiscal (compras)</dt><dd className="font-num tabular">{formatoMoneda(resumenIva.credito)}</dd></div>
          <div className="flex justify-between border-t border-paperLine pt-1 font-medium">
            <dt>{resumenIva.diferencia >= 0 ? "IVA por pagar" : "Remanente de IVA"}</dt>
            <dd className="font-num tabular">{formatoMoneda(Math.abs(resumenIva.diferencia))}</dd>
          </div>
        </dl>
        <p className="text-xs text-inkSoft mt-2">
          Es una referencia con los documentos registrados en ContaCloud: no incluye remanentes de meses anteriores ni retenciones de IVA.
        </p>
      </section>
    </div>
  );
}
