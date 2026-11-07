"use client";

import { useEffect, useMemo, useState } from "react";
import { useEmpresa } from "@/lib/EmpresaContext";
import { formatoMoneda } from "@/lib/contabilidad";
import { exportarAExcel } from "@/lib/exportarExcel";
import { obtenerConfig } from "@/lib/rrhh";
import { TIPO_OPERACION, CLASIFICACION, SECTOR, TIPO_COSTO, descargarCsv } from "@/lib/anexosRenta";
import { obtenerAnexosIva, csvAnexo, periodoMMAAAA, fechaDMA, OPERACION_VENTAS, INGRESO_VENTAS, NOMBRE_ARCHIVO } from "@/lib/anexosIva";

const mesAnterior = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const TITULOS = {
  contribuyentes: "Anexo de ventas a contribuyentes (F-07)",
  consumidor: "Anexo de ventas a consumidor final (F-07)",
  compras: "Anexo de compras (F-07)",
  excluidos: "Casilla 66 — compras a sujetos excluidos (F-07)",
};
const TIPOS_VENTA = { contribuyentes: [["03", "03 Comprobante de crédito fiscal"], ["05", "05 Nota de crédito"], ["06", "06 Nota de débito"], ["07", "07 Comprobante de retención"], ["08", "08 Comprobante de liquidación"], ["11", "11 Factura de exportación"]], consumidor: [["01", "01 Factura"], ["02", "02 Factura simplificada"], ["10", "10 Tiquete"], ["11", "11 Exportación"]] };
const TIPOS_COMPRA = [["03", "03 Comprobante de crédito fiscal"], ["05", "05 Nota de crédito"], ["06", "06 Nota de débito"], ["11", "11 Exportación"], ["12", "12 Declaración de mercancías"], ["13", "13 Mandamiento de ingreso"]];
const CLASES = [["1", "1 Imprenta / tiquetes"], ["2", "2 Formulario único"], ["3", "3 Otros"], ["4", "4 DTE"]];

function Sel({ valor, opciones, onChange, ancho = "w-16" }) {
  return (
    <select value={valor} onChange={(e) => onChange(e.target.value)} className={`${ancho} border border-paperLine rounded-sm px-1 py-0.5 text-xs bg-white`}>
      {opciones.map(([c, t]) => (
        <option key={c} value={c} title={t}>{c} {t.length > 24 ? t.slice(0, 24) + "…" : t}</option>
      ))}
    </select>
  );
}
function Txt({ valor, onChange, ancho = "w-24", ph }) {
  return <input value={valor ?? ""} placeholder={ph} onChange={(e) => onChange(e.target.value)} className={`${ancho} border border-paperLine rounded-sm px-1 py-0.5 text-xs bg-white font-num`} />;
}

export default function AnexoIvaPanel({ tipo }) {
  const { empresaId, empresa } = useEmpresa();
  const [ym, setYm] = useState(mesAnterior());
  const [cfg, setCfg] = useState(null);
  const [filas, setFilas] = useState([]);
  const [omitidas, setOmitidas] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const esCompras = tipo === "compras";
  const esContrib = tipo === "contribuyentes";

  useEffect(() => {
    obtenerConfig(empresaId).then(setCfg).catch(() => setCfg({}));
  }, [empresaId]);

  async function cargar() {
    if (!cfg) return;
    setCargando(true);
    setError(null);
    try {
      const r = await obtenerAnexosIva(empresaId, ym, empresa, cfg);
      setFilas(r[tipo]);
      setOmitidas(r.comprasOmitidas || 0);
    } catch (e) {
      setError("No se pudo cargar: " + (e.message || e));
    } finally {
      setCargando(false);
    }
  }
  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ym, !!cfg, empresaId, tipo]);

  const cambiar = (id, c) => setFilas((fs) => fs.map((f) => (f.id === id ? { ...f, ...c } : f)));
  const aTodas = (c) => setFilas((fs) => fs.map((f) => ({ ...f, ...c })));
  const incluidas = useMemo(() => filas.filter((f) => f.incluir), [filas]);
  const suma = (k) => r2(incluidas.reduce((a, f) => a + Number(f[k] || 0), 0));

  const esExcl = tipo === "excluidos";
  const sinId = incluidas.filter((f) => (esExcl ? !f.idDoc : (esCompras || esContrib) && !f.nitNrc && !f.dui));
  const dteIncompleto = incluidas.filter((f) => f.clase === "4" && (!f.serie && !esCompras));

  function descargar() {
    if (!incluidas.length) return setError("No hay filas para el anexo.");
    const avisos = [];
    if (sinId.length) avisos.push(`${sinId.length} documento(s) sin NIT/NRC ni DUI`);
    if (dteIncompleto.length) avisos.push(`${dteIncompleto.length} DTE sin sello de recepción`);
    if (avisos.length && !confirm(avisos.join(" y ") + ". Hacienda puede rechazar el archivo. ¿Descargar de todos modos?")) return;
    descargarCsv(`${NOMBRE_ARCHIVO[tipo]} ${periodoMMAAAA(ym)}.csv`, csvAnexo(tipo, incluidas));
  }

  function excel() {
    let cab, datos, tot;
    if (esExcl) {
      cab = ["Tipo doc. identidad", "Identificación", "Nombre", "Fecha", "Serie", "Nº documento", "Monto de la operación", "Retención IVA 13%", "Tipo operación", "Clasificación", "Sector", "Tipo costo/gasto"];
      datos = incluidas.map((f) => [f.tipoId, f.idDoc, f.nombre, fechaDMA(f.fecha), f.serie, f.numDoc, f.monto, f.retIva, f.tipoOp, f.clasificacion, f.sector, f.tipoCosto]);
      tot = ["", "", "", "", "", "Totales:", suma("monto"), suma("retIva")];
    } else if (esContrib) {
      cab = ["Fecha", "Clase", "Tipo", "Resolución", "Serie", "Nº documento", "Control interno", "NIT/NRC", "DUI", "Cliente", "Exentas", "No sujetas", "Gravadas", "Débito fiscal", "Total", "Tipo operación renta", "Tipo ingreso renta"];
      datos = incluidas.map((f) => [fechaDMA(f.fecha), f.clase, f.tipo, f.resolucion, f.serie, f.numDoc, f.control, f.nitNrc, f.dui, f.nombre, f.exentas, f.noSujetas, f.gravadas, f.debito, f.total, f.tipoOp, f.tipoIngreso]);
      tot = ["", "", "", "", "", "", "", "", "", "Totales:", suma("exentas"), suma("noSujetas"), suma("gravadas"), suma("debito"), suma("total")];
    } else if (tipo === "consumidor") {
      cab = ["Fecha", "Clase", "Tipo", "Resolución", "Serie", "Control interno", "Nº documento", "Nº máquina", "Exentas", "Gravadas locales", "Total", "Tipo operación renta", "Tipo ingreso renta"];
      datos = incluidas.map((f) => [fechaDMA(f.fecha), f.clase, f.tipo, f.resolucion, f.serie, f.control, f.numDoc, f.maquina, f.exentas, f.gravadas, f.total, f.tipoOp, f.tipoIngreso]);
      tot = ["", "", "", "", "", "", "", "Totales:", suma("exentas"), suma("gravadas"), suma("total")];
    } else {
      cab = ["Fecha", "Clase", "Tipo", "Nº documento", "NIT/NRC", "DUI", "Proveedor", "Exentas", "Gravadas", "Crédito fiscal", "Total", "Tipo operación", "Clasificación", "Sector", "Tipo costo/gasto"];
      datos = incluidas.map((f) => [fechaDMA(f.fecha), f.clase, f.tipo, f.numDoc, f.nitNrc, f.dui, f.nombre, f.exentas, f.gravadas, f.credito, f.total, f.tipoOp, f.clasificacion, f.sector, f.tipoCosto]);
      tot = ["", "", "", "", "", "", "Totales:", suma("exentas"), suma("gravadas"), suma("credito"), suma("total")];
    }
    exportarAExcel(`${NOMBRE_ARCHIVO[tipo].toLowerCase().replace(/ /g, "-")}-${periodoMMAAAA(ym)}`, [{ nombre: "ANEXO", filas: [[empresa?.nombre || ""], [`${TITULOS[tipo]} — periodo ${periodoMMAAAA(ym)}`], [], cab, ...datos, tot] }]);
  }

  const m = (n) => formatoMoneda(n);
  const lbl = "block text-xs font-medium text-inkSoft mb-1";
  const th = "font-normal px-2 py-1 ";
  const num = "px-2 py-1 text-right font-num tabular";

  const encabezado = (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3 no-print">
        <h2 className="font-display text-lg font-semibold">{TITULOS[tipo]}</h2>
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
        {filas.length > 0 && (
          <>
            <label><span className={lbl}>Tipo operación (todas)</span><Sel ancho="w-40" valor={filas[0].tipoOp} opciones={TIPO_OPERACION} onChange={(v) => aTodas({ tipoOp: v })} /></label>
            <label><span className={lbl}>Clasificación (todas)</span><Sel ancho="w-32" valor={filas[0].clasificacion} opciones={CLASIFICACION} onChange={(v) => aTodas({ clasificacion: v })} /></label>
            <label><span className={lbl}>Sector (todas)</span><Sel ancho="w-36" valor={filas[0].sector} opciones={SECTOR} onChange={(v) => aTodas({ sector: v })} /></label>
            <label><span className={lbl}>Tipo costo/gasto (todas)</span><Sel ancho="w-44" valor={filas[0].tipoCosto} opciones={TIPO_COSTO} onChange={(v) => aTodas({ tipoCosto: v })} /></label>
          </>
        )}
      </div>
    </>
  );

  if (esExcl) {
    return (
      <div className="space-y-5">
        {encabezado}
        {error && <p className="text-sm text-rust">{error}</p>}
        {sinId.length > 0 && <p className="text-xs text-rust">Sin NIT/DUI: {sinId.map((f) => f.nombre || f.etiqueta).join(", ")}. Complétalos en Proveedores.</p>}
        {cargando ? (
          <p className="text-sm text-inkSoft">Cargando…</p>
        ) : filas.length === 0 ? (
          <p className="text-sm text-inkSoft">No hay compras a sujetos excluidos en el periodo. Marca «Factura de sujeto excluido» al registrar la compra.</p>
        ) : (
          <div className="overflow-x-auto bg-white border border-paperLine rounded-sm">
            <table className="w-full text-xs">
              <thead className="bg-brand text-onBrand">
                <tr>
                  <th className="px-2 py-1 no-print" />
                  <th className={th + "text-left"}>Fecha</th>
                  <th className={th + "text-left"}>Tipo id.</th>
                  <th className={th + "text-left"}>Identificación</th>
                  <th className={th + "text-left"}>Nombre</th>
                  <th className={th + "text-left"}>Serie / sello</th>
                  <th className={th + "text-left"}>Documento</th>
                  <th className={th + "text-right"}>Monto</th>
                  <th className={th + "text-right"}>Ret. IVA 13%</th>
                  <th className={th + "text-left"}>Oper.</th>
                  <th className={th + "text-left"}>Clasif.</th>
                  <th className={th + "text-left"}>Sector</th>
                  <th className={th + "text-left"}>Costo/gasto</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.id} className={"border-t border-paperLine " + (f.incluir ? "" : "opacity-40")}>
                    <td className="px-2 py-1 no-print"><input type="checkbox" checked={f.incluir} onChange={(e) => cambiar(f.id, { incluir: e.target.checked })} /></td>
                    <td className="px-2 py-1 whitespace-nowrap">{fechaDMA(f.fecha)}</td>
                    <td className="px-2 py-1"><Sel ancho="w-20" valor={f.tipoId} opciones={[["1", "NIT"], ["2", "DUI"], ["3", "Otro"]]} onChange={(v) => cambiar(f.id, { tipoId: v })} /></td>
                    <td className="px-2 py-1"><Txt valor={f.idDoc} onChange={(v) => cambiar(f.id, { idDoc: v })} ancho="w-28" /></td>
                    <td className="px-2 py-1">{f.nombre}</td>
                    <td className="px-2 py-1"><Txt valor={f.serie} onChange={(v) => cambiar(f.id, { serie: v })} ancho="w-24" /></td>
                    <td className="px-2 py-1"><Txt valor={f.numDoc} onChange={(v) => cambiar(f.id, { numDoc: v })} ancho="w-32" /></td>
                    <td className={num}>{m(f.monto)}</td>
                    <td className="px-2 py-1 text-right"><input type="number" step="0.01" min="0" value={f.retIva} onChange={(e) => cambiar(f.id, { retIva: e.target.value })} className="w-20 border border-paperLine rounded-sm px-1 py-0.5 text-xs text-right font-num" /></td>
                    <td className="px-2 py-1"><Sel ancho="w-14" valor={f.tipoOp} opciones={TIPO_OPERACION} onChange={(v) => cambiar(f.id, { tipoOp: v })} /></td>
                    <td className="px-2 py-1"><Sel ancho="w-14" valor={f.clasificacion} opciones={CLASIFICACION} onChange={(v) => cambiar(f.id, { clasificacion: v })} /></td>
                    <td className="px-2 py-1"><Sel ancho="w-14" valor={f.sector} opciones={SECTOR} onChange={(v) => cambiar(f.id, { sector: v })} /></td>
                    <td className="px-2 py-1"><Sel ancho="w-14" valor={f.tipoCosto} opciones={TIPO_COSTO} onChange={(v) => cambiar(f.id, { tipoCosto: v })} /></td>
                  </tr>
                ))}
                <tr className="border-t border-black font-semibold">
                  <td colSpan={7} className="px-2 py-1 text-right">Totales ({incluidas.length} documentos):</td>
                  <td className={num}>{m(suma("monto"))}</td>
                  <td className={num}>{m(suma("retIva"))}</td>
                  <td colSpan={4} />
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-inkSoft no-print">Se alimenta de las compras marcadas como «Factura de sujeto excluido». La retención de IVA es 0 salvo que la captures aquí. Formato idéntico al de la plantilla (campos separados por «;», anexo 5).</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 no-print">
        <h2 className="font-display text-lg font-semibold">{TITULOS[tipo]}</h2>
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
        {filas.length > 0 && !esCompras && (
          <>
            <label><span className={lbl}>Tipo operación renta (todas)</span><Sel ancho="w-44" valor={filas[0].tipoOp} opciones={OPERACION_VENTAS} onChange={(v) => aTodas({ tipoOp: v })} /></label>
            <label><span className={lbl}>Tipo ingreso renta (todas)</span><Sel ancho="w-48" valor={filas[0].tipoIngreso} opciones={INGRESO_VENTAS} onChange={(v) => aTodas({ tipoIngreso: v })} /></label>
          </>
        )}
        {filas.length > 0 && esCompras && (
          <>
            <label><span className={lbl}>Tipo operación (todas)</span><Sel ancho="w-40" valor={filas[0].tipoOp} opciones={TIPO_OPERACION} onChange={(v) => aTodas({ tipoOp: v })} /></label>
            <label><span className={lbl}>Clasificación (todas)</span><Sel ancho="w-32" valor={filas[0].clasificacion} opciones={CLASIFICACION} onChange={(v) => aTodas({ clasificacion: v })} /></label>
            <label><span className={lbl}>Sector (todas)</span><Sel ancho="w-36" valor={filas[0].sector} opciones={SECTOR} onChange={(v) => aTodas({ sector: v })} /></label>
            <label><span className={lbl}>Tipo costo/gasto (todas)</span><Sel ancho="w-44" valor={filas[0].tipoCosto} opciones={TIPO_COSTO} onChange={(v) => aTodas({ tipoCosto: v })} /></label>
          </>
        )}
      </div>

      {error && <p className="text-sm text-rust">{error}</p>}
      {sinId.length > 0 && <p className="text-xs text-rust">Sin NIT/NRC ni DUI: {sinId.map((f) => f.nombre || f.etiqueta).join(", ")}. Complétalos en {esCompras ? "Proveedores" : "Clientes"}.</p>}
      {esCompras && omitidas > 0 && <p className="text-xs text-inkSoft">{omitidas} factura(s) de consumidor final no se incluyen: el anexo de compras sólo admite CCF, notas, importaciones y similares.</p>}

      {cargando ? (
        <p className="text-sm text-inkSoft">Cargando…</p>
      ) : filas.length === 0 ? (
        <p className="text-sm text-inkSoft">No hay documentos para este anexo en el periodo.</p>
      ) : (
        <div className="overflow-x-auto bg-white border border-paperLine rounded-sm">
          <table className="w-full text-xs">
            <thead className="bg-brand text-onBrand">
              <tr>
                <th className="px-2 py-1 no-print" />
                <th className={th + "text-left"}>Fecha</th>
                <th className={th + "text-left"}>Clase</th>
                <th className={th + "text-left"}>Tipo</th>
                {!esCompras && <th className={th + "text-left"}>Resolución</th>}
                {!esCompras && <th className={th + "text-left"}>Serie / sello</th>}
                <th className={th + "text-left"}>{esCompras ? "Documento" : tipo === "consumidor" ? "Control / documento" : "Documento"}</th>
                {!esCompras && !esContrib && <th className={th + "text-left"}>Máquina</th>}
                {(esCompras || esContrib) && <th className={th + "text-left"}>NIT/NRC · DUI</th>}
                {(esCompras || esContrib) && <th className={th + "text-left"}>Nombre</th>}
                <th className={th + "text-right"}>Exentas</th>
                {esContrib && <th className={th + "text-right"}>No sujetas</th>}
                <th className={th + "text-right"}>Gravadas</th>
                {esContrib && <th className={th + "text-right"}>Débito</th>}
                {esCompras && <th className={th + "text-right"}>Crédito</th>}
                <th className={th + "text-right"}>Total</th>
                {!esCompras ? (<><th className={th + "text-left"}>Operación</th><th className={th + "text-left"}>Ingreso</th></>) : (<><th className={th + "text-left"}>Oper.</th><th className={th + "text-left"}>Clasif.</th><th className={th + "text-left"}>Sector</th><th className={th + "text-left"}>Costo/gasto</th></>)}
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id} className={"border-t border-paperLine " + (f.incluir ? "" : "opacity-40")}>
                  <td className="px-2 py-1 no-print"><input type="checkbox" checked={f.incluir} onChange={(e) => cambiar(f.id, { incluir: e.target.checked })} /></td>
                  <td className="px-2 py-1 whitespace-nowrap">{fechaDMA(f.fecha)}</td>
                  <td className="px-2 py-1"><Sel ancho="w-14" valor={f.clase} opciones={CLASES} onChange={(v) => cambiar(f.id, { clase: v })} /></td>
                  <td className="px-2 py-1"><Sel ancho="w-16" valor={f.tipo} opciones={esCompras ? TIPOS_COMPRA : TIPOS_VENTA[tipo]} onChange={(v) => cambiar(f.id, { tipo: v })} /></td>
                  {!esCompras && <td className="px-2 py-1"><Txt valor={f.resolucion} onChange={(v) => cambiar(f.id, { resolucion: v })} ancho="w-28" /></td>}
                  {!esCompras && <td className="px-2 py-1"><Txt valor={f.serie} onChange={(v) => cambiar(f.id, { serie: v })} ancho="w-28" /></td>}
                  <td className="px-2 py-1">
                    {esCompras ? <Txt valor={f.numDoc} onChange={(v) => cambiar(f.id, { numDoc: v })} ancho="w-32" /> : (
                      <div className="flex gap-1">
                        <Txt valor={f.control} ph="control" onChange={(v) => cambiar(f.id, { control: v })} ancho="w-28" />
                        {tipo === "consumidor" || true ? <Txt valor={f.numDoc} ph="documento" onChange={(v) => cambiar(f.id, { numDoc: v })} ancho="w-28" /> : null}
                      </div>
                    )}
                  </td>
                  {!esCompras && !esContrib && <td className="px-2 py-1"><Txt valor={f.maquina} onChange={(v) => cambiar(f.id, { maquina: v })} ancho="w-20" /></td>}
                  {(esCompras || esContrib) && <td className={"px-2 py-1 font-num " + (!f.nitNrc && !f.dui ? "text-rust" : "")}>{f.dui ? `DUI ${f.dui}` : f.nitNrc || "falta"}</td>}
                  {(esCompras || esContrib) && <td className="px-2 py-1">{f.nombre}</td>}
                  <td className={num}>{m(f.exentas)}</td>
                  {esContrib && <td className={num}>{m(f.noSujetas)}</td>}
                  <td className={num}>{m(f.gravadas)}</td>
                  {esContrib && <td className={num}>{m(f.debito)}</td>}
                  {esCompras && <td className={num}>{m(f.credito)}</td>}
                  <td className={num}>{m(f.total)}</td>
                  {!esCompras ? (
                    <>
                      <td className="px-2 py-1"><Sel ancho="w-16" valor={f.tipoOp} opciones={OPERACION_VENTAS} onChange={(v) => cambiar(f.id, { tipoOp: v })} /></td>
                      <td className="px-2 py-1"><Sel ancho="w-16" valor={f.tipoIngreso} opciones={INGRESO_VENTAS} onChange={(v) => cambiar(f.id, { tipoIngreso: v })} /></td>
                    </>
                  ) : (
                    <>
                      <td className="px-2 py-1"><Sel ancho="w-14" valor={f.tipoOp} opciones={TIPO_OPERACION} onChange={(v) => cambiar(f.id, { tipoOp: v })} /></td>
                      <td className="px-2 py-1"><Sel ancho="w-14" valor={f.clasificacion} opciones={CLASIFICACION} onChange={(v) => cambiar(f.id, { clasificacion: v })} /></td>
                      <td className="px-2 py-1"><Sel ancho="w-14" valor={f.sector} opciones={SECTOR} onChange={(v) => cambiar(f.id, { sector: v })} /></td>
                      <td className="px-2 py-1"><Sel ancho="w-14" valor={f.tipoCosto} opciones={TIPO_COSTO} onChange={(v) => cambiar(f.id, { tipoCosto: v })} /></td>
                    </>
                  )}
                </tr>
              ))}
              <tr className="border-t border-black font-semibold">
                <td colSpan={esCompras ? 7 : esContrib ? 9 : 8} className="px-2 py-1 text-right">Totales ({incluidas.length} documentos):</td>
                <td className={num}>{m(suma("exentas"))}</td>
                {esContrib && <td className={num}>{m(suma("noSujetas"))}</td>}
                <td className={num}>{m(suma("gravadas"))}</td>
                {esContrib && <td className={num}>{m(suma("debito"))}</td>}
                {esCompras && <td className={num}>{m(suma("credito"))}</td>}
                <td className={num}>{m(suma("total"))}</td>
                <td colSpan={esCompras ? 4 : 2} />
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-inkSoft no-print">
        Formato idéntico al de la plantilla de Hacienda (campos separados por «;», codificación ANSI). En DTE: resolución = número de control, serie = sello de recepción,
        documento = código de generación. {tipo === "consumidor" ? "Consumidor final: las gravadas incluyen el IVA. " : ""}Revisa los códigos de renta antes de presentar.
      </p>
    </div>
  );
}
