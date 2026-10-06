"use client";

import { useEffect, useMemo, useState, Fragment } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useEmpresa } from "@/lib/EmpresaContext";
import DatosEmisor from "@/components/DatosEmisor";
import SelectorActividad from "@/components/SelectorActividad";
import SelectorUbicacion from "@/components/SelectorUbicacion";
import CuentaCombobox from "@/lib/CuentaCombobox";
import { obtenerProductos, obtenerKardex, saldoActual } from "@/lib/kardex";
import { configVC, calcularDocumento } from "@/lib/ventasCompras";
import { formatoMoneda } from "@/lib/contabilidad";
import { TIPOS_DTE, TIPO_DOCUMENTO_VENTA } from "@/lib/dte";
import { emitirDte, eliminarDte } from "@/lib/dteEmision";

const hoy = () => new Date().toISOString().slice(0, 10);
const receptorVacio = () => ({
  nombre: "", nombre_comercial: "", tipo_documento: "nit", nit_dui: "", nrc: "",
  cod_actividad: "", desc_actividad: "", telefono: "", correo: "", direccion: "",
  cod_departamento: "", cod_municipio: "", cod_distrito: "",
});
let contadorLineas = 0;
function lineaVacia(clase) {
  contadorLineas += 1;
  return { key: contadorLineas, clase, producto_id: "", cuenta_id: "", descripcion: "", cantidad: "1", precio: "" };
}

const inputCls =
  "w-full border border-paperLine rounded-sm px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brass";
const labelCls = "block text-xs font-medium text-inkSoft mb-1";

export default function FacturacionPage() {
  const { empresa, cuentas, empresaId, actualizarEmpresa } = useEmpresa();
  const cfg = useMemo(() => configVC("venta"), []);

  const [productos, setProductos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [documentos, setDocumentos] = useState([]);
  const [saldos, setSaldos] = useState({});
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [exito, setExito] = useState(null);
  const [verJsonId, setVerJsonId] = useState(null);

  const [tipoDte, setTipoDte] = useState("01");
  const [fecha, setFecha] = useState(hoy());
  const [condicion, setCondicion] = useState("contado");
  const [fechaVencimiento, setFechaVencimiento] = useState("");
  const [cuentaDinero, setCuentaDinero] = useState("");
  const [receptor, setReceptor] = useState(receptorVacio());
  const [clienteId, setClienteId] = useState("");
  const [guardarCliente, setGuardarCliente] = useState(false);
  const [lineas, setLineas] = useState([lineaVacia("concepto")]);

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  async function cargar() {
    setCargando(true);
    try {
      const [prods, { data: cls }, { data: docs }] = await Promise.all([
        obtenerProductos(empresaId),
        supabase.from("clientes").select("*").eq("empresa_id", empresaId).order("nombre"),
        supabase
          .from("documentos_dte")
          .select("*")
          .eq("empresa_id", empresaId)
          .order("created_at", { ascending: false }),
      ]);
      setProductos(prods);
      setClientes(cls || []);
      setDocumentos(docs || []);
      // Si el formulario sigue intacto, la primera línea empieza como producto
      setLineas((ls) =>
        ls.length === 1 && !ls[0].producto_id && !ls[0].descripcion && !ls[0].precio
          ? [lineaVacia(prods.length ? "producto" : "concepto")]
          : ls
      );
    } catch (e) {
      setError("No se pudieron cargar los datos: " + (e.message || e));
    }
    setCargando(false);
  }

  const tipoDocumento = TIPO_DOCUMENTO_VENTA[tipoDte];
  const esFactura = tipoDte === "01";
  const requiereCliente = tipoDte === "03" || condicion === "credito";
  const calculo = useMemo(
    () => calcularDocumento(cfg, tipoDocumento, lineas),
    [cfg, tipoDocumento, lineas]
  );

  const cuentasActivo = useMemo(() => cuentas.filter((c) => c.clase === "Activo"), [cuentas]);
  const cuentasIngreso = useMemo(() => cuentas.filter((c) => c.clase === "Ingreso"), [cuentas]);

  // Cuentas que Ventas necesita tener configuradas (se configuran en la pestaña Ventas)
  const faltantes = [];
  const campoIva = esFactura ? "cuenta_iva_debito_cf_id" : "cuenta_iva_debito_ccf_id";
  if (!empresa?.[campoIva]) {
    faltantes.push(esFactura ? "IVA Débito Fiscal — Consumidores finales" : "IVA Débito Fiscal — Contribuyentes (CCF)");
  }
  if (lineas.some((l) => l.clase === "producto") && !empresa?.cuenta_ventas_id) {
    faltantes.push("Ingresos por venta de productos");
  }
  if (condicion === "credito" && !empresa?.cuenta_cxc_id) faltantes.push("Cuentas por Cobrar");

  function cambiarLinea(key, cambios) {
    setLineas((ls) => ls.map((l) => (l.key === key ? { ...l, ...cambios } : l)));
  }

  async function elegirProducto(key, id) {
    cambiarLinea(key, { producto_id: id });
    if (id && !saldos[id]) {
      try {
        const mov = await obtenerKardex(id);
        setSaldos((s) => ({ ...s, [id]: saldoActual(mov) }));
      } catch {
        /* la existencia es solo una ayuda visual */
      }
    }
  }

  function elegirCliente(id) {
    setClienteId(id);
    const c = clientes.find((x) => x.id === id);
    if (!c) return;
    setReceptor({
      nombre: c.nombre || "",
      nombre_comercial: c.nombre_comercial || "",
      tipo_documento: c.tipo_documento === "dui" ? "dui" : "nit",
      nit_dui: c.nit_dui || "",
      nrc: c.nrc || "",
      cod_actividad: c.cod_actividad || "",
      desc_actividad: c.desc_actividad || "",
      telefono: c.telefono || "",
      correo: c.correo || "",
      direccion: c.direccion || "",
      cod_departamento: c.cod_departamento || "",
      cod_municipio: c.cod_municipio || "",
      cod_distrito: c.cod_distrito || "",
    });
  }

  async function emitir(e) {
    e.preventDefault();
    setError(null);
    setExito(null);
    if (faltantes.length) {
      setError(
        "Configura primero estas cuentas en Ventas, sección Configuración de cuentas: " +
          faltantes.join(", ") + "."
      );
      return;
    }
    setGuardando(true);
    const res = await emitirDte({
      empresa,
      empresaId,
      productos,
      clientes,
      datos: { tipoDte, fecha, condicion, fechaVencimiento, cuentaDinero, receptor, clienteId, guardarCliente, lineas },
    });
    setGuardando(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setExito(
      `Documento ${res.numeroControl} emitido (partida N° ${res.numeroPartida}).` +
        (res.clienteNuevo ? ` Se registró el cliente ${res.clienteNuevo.nombre}.` : "")
    );
    setReceptor(receptorVacio());
    setClienteId("");
    setGuardarCliente(false);
    setLineas([lineaVacia(productos.length ? "producto" : "concepto")]);
    setSaldos({});
    await cargar();
  }

  function descargar(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function descargarPdf(d) {
    setError(null);
    try {
      const { generarPdfDte } = await import("@/lib/dtePdf");
      const bytes = await generarPdfDte(d.json_dte, { estado: d.estado });
      descargar(new Blob([bytes], { type: "application/pdf" }), `${d.codigo_generacion}.pdf`);
    } catch (e) {
      setError("No se pudo generar el PDF: " + (e.message || e));
    }
  }

  function descargarJson(d) {
    descargar(
      new Blob([JSON.stringify(d.json_dte, null, 2)], { type: "application/json" }),
      `${d.codigo_generacion}.json`
    );
  }

  async function eliminar(d) {
    if (
      !window.confirm(
        `¿Eliminar el documento ${d.numero_control}?\n\nSe revierten su partida contable, la salida del Kardex y la cuenta por cobrar (si es a crédito).`
      )
    ) {
      return;
    }
    setError(null);
    setExito(null);
    const res = await eliminarDte(d);
    if (res.error) {
      setError(res.error);
      return;
    }
    setExito(`Documento ${d.numero_control} eliminado; el inventario y la partida se revirtieron.`);
    setSaldos({});
    await cargar();
  }

  if (cargando) return <p className="text-inkSoft">Cargando…</p>;

  return (
    <div className="space-y-10">
      <DatosEmisor empresa={empresa} onGuardado={(v) => actualizarEmpresa(v)} />

      {faltantes.length > 0 && (
        <div className="bg-brass/10 border border-brass/40 rounded-sm px-4 py-3 text-sm">
          Para emitir este tipo de documento falta configurar: <strong>{faltantes.join(", ")}</strong>.{" "}
          <Link href={`/empresa/${empresaId}/ventas`} className="underline text-brassDark">
            Ir a Ventas, Configuración de cuentas
          </Link>
        </div>
      )}

      <section className="bg-[#F7F4EA] border border-paperLine rounded-sm p-6">
        <h2 className="font-display text-base font-semibold mb-1">Emitir documento</h2>
        <p className="text-xs text-inkSoft mb-4">
          Al emitir se registra una venta completa: partida con costo de venta, salida del Kardex y,
          si es a crédito, la cuenta por cobrar. La firma electrónica y la transmisión a Hacienda
          quedan pendientes hasta que conectes tu certificado digital y credenciales.
        </p>

        <form onSubmit={emitir} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className={labelCls}>Tipo de documento</label>
              <select
                value={tipoDte}
                onChange={(e) => {
                  setTipoDte(e.target.value);
                  // El Crédito Fiscal solo admite NIT del receptor
                  if (e.target.value === "03") setReceptor((r) => ({ ...r, tipo_documento: "nit" }));
                }}
                className={inputCls}
              >
                {Object.entries(TIPOS_DTE).map(([cod, nom]) => (
                  <option key={cod} value={cod}>{cod} — {nom}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Fecha</label>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Forma de pago</label>
              <select value={condicion} onChange={(e) => setCondicion(e.target.value)} className={inputCls}>
                <option value="contado">Contado</option>
                <option value="credito">Crédito</option>
              </select>
            </div>
            <div>
              {condicion === "contado" ? (
                <>
                  <label className={labelCls}>¿Dónde se recibió el dinero?</label>
                  <CuentaCombobox cuentas={cuentasActivo} value={cuentaDinero} onChange={setCuentaDinero} />
                </>
              ) : (
                <>
                  <label className={labelCls}>Fecha de vencimiento</label>
                  <input type="date" value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)} className={inputCls} />
                </>
              )}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-inkSoft uppercase tracking-wide mb-2">Receptor</p>
            <div className="mb-3">
              <label className={labelCls}>Cliente registrado</label>
              <select
                value={clienteId}
                onChange={(e) => elegirCliente(e.target.value)}
                className={`${inputCls} sm:w-1/2`}
              >
                <option value="">
                  {clientes.length === 0
                    ? "No hay clientes registrados — escribe el receptor abajo"
                    : "— Escribir el receptor manualmente —"}
                </option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}{c.nit_dui ? ` — ${c.nit_dui}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className={labelCls}>Nombre / Razón social</label>
                <input placeholder="Nombre / Razón social" value={receptor.nombre}
                  onChange={(e) => setReceptor({ ...receptor, nombre: e.target.value })} className={inputCls} />
              </div>
              {!esFactura && (
                <div>
                  <label className={labelCls}>Nombre comercial (opcional)</label>
                  <input value={receptor.nombre_comercial}
                    onChange={(e) => setReceptor({ ...receptor, nombre_comercial: e.target.value })} className={inputCls} />
                </div>
              )}
              <div>
                <label className={labelCls}>Tipo de documento</label>
                <select value={receptor.tipo_documento}
                  onChange={(e) => setReceptor({ ...receptor, tipo_documento: e.target.value })} className={inputCls}>
                  <option value="nit">NIT</option>
                  <option value="dui" disabled={!esFactura}>DUI</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>
                  {receptor.tipo_documento === "dui" ? "DUI (9 dígitos)" : "NIT (sin guiones)"}{!esFactura ? " *" : ""}
                </label>
                <input placeholder={receptor.tipo_documento === "dui" ? "DUI" : "NIT"} value={receptor.nit_dui}
                  onChange={(e) => setReceptor({ ...receptor, nit_dui: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>NRC (sin guion){!esFactura ? " *" : ""}</label>
                <input placeholder="NRC" value={receptor.nrc}
                  onChange={(e) => setReceptor({ ...receptor, nrc: e.target.value })} className={inputCls} />
              </div>
              {!esFactura && (
                <>
                  <SelectorActividad
                    codigo={receptor.cod_actividad}
                    descripcion={receptor.desc_actividad}
                    onChange={(v) => setReceptor({ ...receptor, ...v })}
                    requerido
                    className="sm:col-span-3"
                  />
                </>
              )}
              <div>
                <label className={labelCls}>Teléfono</label>
                <input value={receptor.telefono}
                  onChange={(e) => setReceptor({ ...receptor, telefono: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Correo</label>
                <input placeholder="Correo" value={receptor.correo}
                  onChange={(e) => setReceptor({ ...receptor, correo: e.target.value })} className={inputCls} />
              </div>
              <SelectorUbicacion
                departamento={receptor.cod_departamento}
                municipio={receptor.cod_municipio}
                distrito={receptor.cod_distrito}
                onChange={(v) => setReceptor({ ...receptor, ...v })}
                requerido={!esFactura}
              />
              <div className="sm:col-span-3">
                <label className={labelCls}>Dirección complementaria (calle, colonia, número){!esFactura ? " *" : ""}</label>
                <input placeholder="Dirección complementaria" value={receptor.direccion}
                  onChange={(e) => setReceptor({ ...receptor, direccion: e.target.value })} className={inputCls} />
              </div>
            </div>
            {clienteId ? (
              <label className="flex items-center gap-2 mt-3 text-sm text-inkSoft">
                <input type="checkbox" checked={guardarCliente} onChange={(e) => setGuardarCliente(e.target.checked)} />
                Actualizar los datos de este cliente (NIT/DUI, NRC, correo, dirección)
              </label>
            ) : requiereCliente ? (
              <p className="mt-3 text-xs text-inkSoft">
                Este receptor se registrará como cliente automáticamente (es obligatorio en el
                Crédito Fiscal y en las ventas a crédito) y aparecerá en Cuentas por Cobrar.
              </p>
            ) : (
              <label className="flex items-center gap-2 mt-3 text-sm text-inkSoft">
                <input type="checkbox" checked={guardarCliente} onChange={(e) => setGuardarCliente(e.target.checked)} />
                Guardar este receptor en mis clientes (también aparecerá en Cuentas por Cobrar)
              </label>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold text-inkSoft uppercase tracking-wide mb-2">Ítems</p>
            <div className="space-y-2">
              {lineas.map((l) => {
                const existencia = l.clase === "producto" && l.producto_id ? saldos[l.producto_id] : null;
                const importe = (Number(l.cantidad) || 0) * (Number(l.precio) || 0);
                return (
                  <div key={l.key} className="grid grid-cols-12 gap-2 items-start border border-paperLine rounded-sm p-2 bg-paper/40">
                    <div className="col-span-12 md:col-span-2">
                      <label className={labelCls}>Tipo</label>
                      <select
                        value={l.clase}
                        onChange={(e) => cambiarLinea(l.key, { clase: e.target.value, producto_id: "", cuenta_id: "" })}
                        className={inputCls}
                      >
                        <option value="producto" disabled={productos.length === 0}>Producto</option>
                        <option value="concepto">Servicio / otro</option>
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      {l.clase === "producto" ? (
                        <>
                          <label className={labelCls}>Producto (Kardex)</label>
                          <select value={l.producto_id} onChange={(e) => elegirProducto(l.key, e.target.value)} className={inputCls}>
                            <option value="">Selecciona…</option>
                            {productos.map((p) => (
                              <option key={p.id} value={p.id}>{p.codigo ? `${p.codigo} — ` : ""}{p.nombre}</option>
                            ))}
                          </select>
                          {existencia && (
                            <p className="text-xs text-inkSoft mt-1">
                              Existencia: <span className="font-num">{existencia.cantidad}</span>
                              {" · "}Costo prom.: <span className="font-num">{formatoMoneda(existencia.costoUnitario)}</span>
                            </p>
                          )}
                        </>
                      ) : (
                        <>
                          <label className={labelCls}>Cuenta de ingreso</label>
                          <CuentaCombobox cuentas={cuentasIngreso} value={l.cuenta_id} onChange={(id) => cambiarLinea(l.key, { cuenta_id: id })} />
                          <input value={l.descripcion} onChange={(e) => cambiarLinea(l.key, { descripcion: e.target.value })}
                            placeholder="Descripción (ej. Asesoría contable)" className={`${inputCls} mt-1`} />
                        </>
                      )}
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <label className={labelCls}>Cantidad</label>
                      <input type="number" step="any" min="0" value={l.cantidad}
                        onChange={(e) => cambiarLinea(l.key, { cantidad: e.target.value })} className={`${inputCls} font-num text-right`} />
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <label className={labelCls}>{esFactura ? "Precio con IVA" : "Precio sin IVA"}</label>
                      <input type="number" step="any" min="0" value={l.precio}
                        onChange={(e) => cambiarLinea(l.key, { precio: e.target.value })} className={`${inputCls} font-num text-right`} />
                    </div>
                    <div className="col-span-3 md:col-span-1">
                      <label className={labelCls}>Importe</label>
                      <p className="font-num text-sm text-right py-1.5">{formatoMoneda(importe)}</p>
                    </div>
                    <div className="col-span-1 md:col-span-1 pt-5 text-right">
                      <button type="button" disabled={lineas.length <= 1}
                        onClick={() => setLineas((ls) => ls.filter((x) => x.key !== l.key))}
                        className="text-xs text-rust hover:underline disabled:opacity-30">
                        Quitar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <button type="button" onClick={() => setLineas((ls) => [...ls, lineaVacia(productos.length ? "producto" : "concepto")])}
              className="text-xs text-brassDark hover:underline mt-2">
              + Agregar ítem
            </button>
          </div>

          <div className="flex justify-end">
            <div className="w-full sm:w-72 text-sm space-y-1 font-num tabular">
              <div className="flex justify-between"><span className="font-body">Subtotal (sin IVA)</span><span>{formatoMoneda(calculo.subtotal)}</span></div>
              <div className="flex justify-between"><span className="font-body">{esFactura ? "IVA (13%) incluido" : "IVA (13%)"}</span><span>{formatoMoneda(calculo.iva)}</span></div>
              <div className="flex justify-between font-semibold border-t border-paperLine pt-1"><span className="font-body">Total</span><span>{formatoMoneda(calculo.total)}</span></div>
            </div>
          </div>

          {error && <p className="text-sm text-rust">{error}</p>}
          {exito && <p className="text-sm text-ledger">{exito}</p>}

          <button type="submit" disabled={guardando}
            className="bg-ink text-paper px-4 py-2 rounded-sm text-sm font-medium hover:bg-[#2C3A52] disabled:opacity-60">
            {guardando ? "Emitiendo…" : "Emitir documento"}
          </button>
        </form>
      </section>

      <section>
        <h2 className="font-display text-base font-semibold mb-4">Documentos emitidos</h2>
        {documentos.length === 0 ? (
          <p className="text-inkSoft text-sm">Aún no se ha emitido ningún documento.</p>
        ) : (
          <div className="bg-[#F7F4EA] border border-paperLine rounded-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-inkSoft border-b border-paperLine">
                  <th className="px-4 py-3 font-medium">N° de Control</th>
                  <th className="px-4 py-3 font-medium">Receptor</th>
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium text-right">Total</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {documentos.map((d) => (
                  <Fragment key={d.id}>
                    <tr className="border-b border-paperLine">
                      <td className="px-4 py-2 font-num text-xs">{d.numero_control}</td>
                      <td className="px-4 py-2">{d.receptor?.nombre}</td>
                      <td className="px-4 py-2 font-num">{d.fecha_emision}</td>
                      <td className="px-4 py-2 text-right font-num tabular">{formatoMoneda(d.total)}</td>
                      <td className="px-4 py-2">
                        <span className="text-xs px-2 py-1 rounded-sm bg-brass/20 text-brassDark">
                          {d.estado === "generado" ? "Generado (sin firmar)" : d.estado}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        <button onClick={() => descargarPdf(d)} className="text-xs text-ledgerDark font-medium hover:underline mr-3">
                          PDF
                        </button>
                        <button onClick={() => descargarJson(d)} className="text-xs text-brassDark hover:underline mr-3">
                          Descargar JSON
                        </button>
                        <button onClick={() => setVerJsonId(verJsonId === d.id ? null : d.id)}
                          className="text-xs text-brassDark hover:underline mr-3">
                          {verJsonId === d.id ? "Ocultar JSON" : "Ver JSON"}
                        </button>
                        {d.estado === "generado" && (
                          <button onClick={() => eliminar(d)} className="text-xs text-rust hover:underline">
                            Eliminar
                          </button>
                        )}
                      </td>
                    </tr>
                    {verJsonId === d.id && (
                      <tr>
                        <td colSpan={6} className="px-4 py-3 bg-ink">
                          <pre className="text-xs text-paper overflow-x-auto font-num">
                            {JSON.stringify(d.json_dte, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
