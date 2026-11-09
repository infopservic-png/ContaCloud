"use client";

import { useEffect, useMemo, useState } from "react";
import { useEmpresa } from "@/lib/EmpresaContext";
import CuentaCombobox from "@/lib/CuentaCombobox";
import { formatoMoneda } from "@/lib/contabilidad";
import { obtenerProductos } from "@/lib/kardex";
import { etiquetaCorta } from "@/lib/ventasCompras";
import { obtenerDocumentosOrigen, cargarOrigen, calcularDevolucion, registrarDevolucion } from "@/lib/devoluciones";
import { emitirNotaCredito } from "@/lib/dteNotaCredito";

const hoy = () => new Date().toISOString().slice(0, 10);
const inputCls = "w-full border border-paperLine rounded-sm px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent";
const labelCls = "block text-xs font-medium text-inkSoft mb-1";

// tipoFijo: "venta" | "compra" | null (se elige). electronica: emite la nota de crédito electrónica (DTE 05) sobre un CCF.
export default function FormDevolucion({ tipoFijo = null, electronica = false, onHecho }) {
  const { empresa, empresaId, cuentas } = useEmpresa();
  const [tipo, setTipo] = useState(tipoFijo || "venta");
  const [docs, setDocs] = useState([]);
  const [docId, setDocId] = useState("");
  const [origen, setOrigen] = useState(null);
  const [cantidades, setCantidades] = useState({});
  const [conAjuste, setConAjuste] = useState(false);
  const [ajuste, setAjuste] = useState({ descripcion: "", cuenta_id: "", monto: "" });
  const [productos, setProductos] = useState([]);
  const [fecha, setFecha] = useState(hoy());
  const [numero, setNumero] = useState("");
  const [motivo, setMotivo] = useState("");
  const [liquidacion, setLiquidacion] = useState("cuenta");
  const [cuentaDinero, setCuentaDinero] = useState("");
  const [error, setError] = useState(null);
  const [exito, setExito] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const esVenta = tipo === "venta";

  useEffect(() => {
    obtenerProductos(empresaId).then(setProductos).catch(() => {});
  }, [empresaId]);

  useEffect(() => {
    setDocId("");
    setOrigen(null);
    setCantidades({});
    obtenerDocumentosOrigen(tipo, empresaId, { soloCcfElectronico: electronica }).then(setDocs).catch((e) => setError(e.message));
  }, [tipo, empresaId, electronica]);

  async function elegirDoc(id) {
    setDocId(id);
    setOrigen(null);
    setCantidades({});
    setError(null);
    if (!id) return;
    try {
      const o = await cargarOrigen(tipo, id);
      setOrigen(o);
      setLiquidacion(o.doc.condicion === "credito" ? "cuenta" : "efectivo");
      setAjuste((a) => ({ ...a, cuenta_id: o.lineas[0]?.cuenta_id || "" }));
    } catch (e) {
      setError("No se pudo cargar el documento: " + e.message);
    }
  }

  const items = useMemo(() => {
    if (!origen) return [];
    const lista = origen.lineas.filter((l) => Number(cantidades[l.id]) > 0).map((l) => ({ linea: l, cantidad: Number(cantidades[l.id]) }));
    if (conAjuste && Number(ajuste.monto) > 0) lista.push({ ajuste: true, ...ajuste });
    return lista;
  }, [origen, cantidades, conAjuste, ajuste]);
  const calculo = useMemo(() => (origen ? calcularDevolucion(tipo, origen.doc, items) : null), [origen, tipo, items]);
  const cuentasDinero = useMemo(() => cuentas.filter((c) => c.clase === "Activo"), [cuentas]);

  async function guardar(e) {
    e.preventDefault();
    setError(null);
    setExito(null);
    if (!origen) return setError("Elige el documento original.");
    if (!esVenta && !numero.trim() && !electronica) return setError("Indica el número de la nota de crédito del proveedor.");
    setGuardando(true);
    const datos = { fecha, numero, motivo, liquidacion, cuentaDinero };
    const res = electronica
      ? await emitirNotaCredito({ empresa, empresaId, doc: origen.doc, items, productos, datos })
      : await registrarDevolucion({ tipo, empresa, empresaId, doc: origen.doc, items, productos, datos });
    setGuardando(false);
    if (res.error) return setError(res.error);
    setExito(
      electronica
        ? `Nota de crédito ${res.numeroControl} emitida (partida N° ${res.numeroPartida}).`
        : `Devolución registrada (partida N° ${res.numeroPartida}). El kardex ya refleja el movimiento.`
    );
    setDocId("");
    setOrigen(null);
    setCantidades({});
    setConAjuste(false);
    setNumero("");
    setMotivo("");
    obtenerDocumentosOrigen(tipo, empresaId, { soloCcfElectronico: electronica }).then(setDocs).catch(() => {});
    onHecho?.();
  }

  return (
    <form onSubmit={guardar} className="bg-[#F7F4EA] border border-paperLine rounded-sm p-5 space-y-4">
      {!tipoFijo && (
        <div className="flex gap-2 text-sm">
          {[["venta", "Devolución de un cliente (sobre venta)"], ["compra", "Devolución a un proveedor (sobre compra)"]].map(([v, t]) => (
            <button key={v} type="button" onClick={() => setTipo(v)} className={"px-3 py-1.5 rounded-sm border " + (tipo === v ? "bg-brand text-onBrand border-brand" : "border-paperLine bg-white hover:bg-paper")}>{t}</button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="sm:col-span-3">
          <label className={labelCls}>{esVenta ? (electronica ? "Comprobante de crédito fiscal que se corrige" : "Venta original") : "Compra original"}</label>
          <select value={docId} onChange={(e) => elegirDoc(e.target.value)} className={inputCls}>
            <option value="">— Elige el documento —</option>
            {docs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.fecha} · {etiquetaCorta(d.tipo_documento)} {d.numero_documento ? `· ${d.numero_documento.slice(0, 40)}` : ""} · {d.entidad?.nombre || "Sin nombre"} · {formatoMoneda(d.total)}
              </option>
            ))}
          </select>
          {electronica && docs.length === 0 && <p className="text-xs text-inkSoft mt-1">No hay comprobantes de crédito fiscal electrónicos emitidos.</p>}
        </div>
        <div>
          <label className={labelCls}>Fecha de la devolución</label>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls} />
        </div>
      </div>

      {origen && (
        <>
          <div className="overflow-x-auto bg-white border border-paperLine rounded-sm">
            <table className="w-full text-sm">
              <thead className="bg-brand text-onBrand text-xs">
                <tr>
                  <th className="px-2 py-1 text-left font-normal">Descripción</th>
                  <th className="px-2 py-1 text-right font-normal">Cantidad</th>
                  <th className="px-2 py-1 text-right font-normal">Ya devuelto</th>
                  <th className="px-2 py-1 text-right font-normal">Disponible</th>
                  <th className="px-2 py-1 text-right font-normal">Devolver</th>
                </tr>
              </thead>
              <tbody>
                {origen.lineas.map((l) => (
                  <tr key={l.id} className="border-t border-paperLine">
                    <td className="px-2 py-1">{l.descripcion || "—"} {l.producto_id ? <span className="text-xs text-inkSoft">(inventario)</span> : null}</td>
                    <td className="px-2 py-1 text-right font-num">{Number(l.cantidad)}</td>
                    <td className="px-2 py-1 text-right font-num">{l.devuelto}</td>
                    <td className="px-2 py-1 text-right font-num">{l.disponible}</td>
                    <td className="px-2 py-1 text-right">
                      <input type="number" step="any" min="0" max={l.disponible} disabled={l.disponible <= 0} value={cantidades[l.id] ?? ""} onChange={(e) => setCantidades({ ...cantidades, [l.id]: e.target.value })} className="w-24 border border-paperLine rounded-sm px-1 py-0.5 text-sm text-right font-num" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={conAjuste} onChange={(e) => setConAjuste(e.target.checked)} />
            Agregar un ajuste o descuento sin devolución de mercadería
          </label>
          {conAjuste && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div><label className={labelCls}>Concepto</label><input value={ajuste.descripcion} onChange={(e) => setAjuste({ ...ajuste, descripcion: e.target.value })} className={inputCls} placeholder="Ej. Descuento por pronto pago" /></div>
              <div><label className={labelCls}>Cuenta</label><CuentaCombobox cuentas={cuentas} value={ajuste.cuenta_id} onChange={(id) => setAjuste({ ...ajuste, cuenta_id: id })} /></div>
              <div><label className={labelCls}>Monto sin IVA</label><input type="number" step="0.01" min="0" value={ajuste.monto} onChange={(e) => setAjuste({ ...ajuste, monto: e.target.value })} className={inputCls + " font-num"} /></div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {!electronica && (
              <div>
                <label className={labelCls}>{esVenta ? "N° de la nota de crédito (opcional)" : "N° de la nota de crédito del proveedor *"}</label>
                <input value={numero} onChange={(e) => setNumero(e.target.value)} className={inputCls} />
              </div>
            )}
            <div className={electronica ? "sm:col-span-3" : "sm:col-span-2"}>
              <label className={labelCls}>Motivo</label>
              <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className={inputCls} placeholder="Ej. Producto dañado" />
            </div>
          </div>

          <fieldset className="border border-paperLine rounded-sm p-3 bg-white/60">
            <legend className="text-xs font-medium text-inkSoft px-1">¿Cómo se liquida?</legend>
            <div className="space-y-2 text-sm">
              <label className={"flex gap-2 items-start " + (origen.doc.condicion !== "credito" ? "opacity-50" : "")}>
                <input type="radio" checked={liquidacion === "cuenta"} disabled={origen.doc.condicion !== "credito"} onChange={() => setLiquidacion("cuenta")} className="mt-1" />
                <span>Rebajar {esVenta ? "Cuentas por Cobrar" : "Cuentas por Pagar"} del documento <span className="text-xs text-inkSoft">(solo si fue al crédito)</span></span>
              </label>
              <label className="flex gap-2 items-start">
                <input type="radio" checked={liquidacion === "efectivo"} onChange={() => setLiquidacion("efectivo")} className="mt-1" />
                <span>{esVenta ? "Devolver el dinero al cliente" : "Recibir el dinero del proveedor"}</span>
              </label>
              {liquidacion === "efectivo" && (
                <div className="sm:w-1/2">
                  <label className={labelCls}>{esVenta ? "¿De qué cuenta sale el dinero?" : "¿En qué cuenta se recibe?"}</label>
                  <CuentaCombobox cuentas={cuentasDinero} value={cuentaDinero} onChange={setCuentaDinero} />
                </div>
              )}
            </div>
          </fieldset>

          {calculo && (
            <div className="flex justify-end">
              <div className="w-full sm:w-72 text-sm space-y-1 font-num tabular">
                <div className="flex justify-between"><span className="font-body">Subtotal</span><span>{formatoMoneda(calculo.subtotal)}</span></div>
                <div className="flex justify-between"><span className="font-body">IVA</span><span>{formatoMoneda(calculo.iva)}</span></div>
                <div className="flex justify-between font-semibold border-t border-paperLine pt-1"><span className="font-body">Total de la devolución</span><span>{formatoMoneda(calculo.total)}</span></div>
                {calculo.costoTotal > 0 && <div className="flex justify-between text-xs text-inkSoft"><span className="font-body">Costo en el kardex</span><span>{formatoMoneda(calculo.costoTotal)}</span></div>}
              </div>
            </div>
          )}
        </>
      )}

      {error && <p className="text-sm text-rust">{error}</p>}
      {exito && <p className="text-sm text-ledger">{exito}</p>}
      <button type="submit" disabled={guardando || !origen} className="bg-brand text-onBrand px-4 py-2 rounded-sm text-sm font-medium hover:bg-brandDark disabled:opacity-60">
        {guardando ? "Registrando…" : electronica ? "Emitir nota de crédito" : "Registrar devolución"}
      </button>
    </form>
  );
}
