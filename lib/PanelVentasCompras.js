"use client";

import { useEffect, useMemo, useState, Fragment } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useEmpresa } from "@/lib/EmpresaContext";
import { obtenerProductos, obtenerKardex, saldoActual } from "@/lib/kardex";
import { formatoMoneda } from "@/lib/contabilidad";
import CuentaCombobox from "@/lib/CuentaCombobox";
import { exportarAExcel } from "@/lib/exportarExcel";
import {
  TIPOS_DOCUMENTO,
  etiquetaCorta,
  configVC,
  calcularDocumento,
  simularKardex,
  construirPartida,
  obtenerDocumentos,
  obtenerLineas,
  registrarDocumento,
  eliminarDocumento,
} from "@/lib/ventasCompras";

const hoy = () => new Date().toISOString().slice(0, 10);
let contadorLineas = 0;

function lineaVacia(clase, cuentaId = "") {
  contadorLineas += 1;
  return {
    key: contadorLineas,
    clase,
    producto_id: "",
    cuenta_id: cuentaId,
    descripcion: "",
    cantidad: "",
    precio: "",
  };
}

function formularioVacio(claseInicial) {
  return {
    fecha: hoy(),
    tipoDocumento: "ccf",
    numero: "",
    entidadId: "",
    condicion: "contado",
    fechaVencimiento: "",
    cuentaDinero: "",
    descripcion: "",
    lineas: [lineaVacia(claseInicial)],
  };
}

// Campos de configuración de cuentas y la cuenta sugerida del catálogo base
function camposConfiguracion(tipo, empresaTipo) {
  if (tipo === "venta") {
    return [
      {
        campo: "cuenta_ventas_id",
        label: "Ingresos por venta de productos",
        sugerida: empresaTipo === "servicio" ? "510102" : "510101",
      },
      { campo: "cuenta_iva_debito_ccf_id", label: "IVA Débito Fiscal — Contribuyentes (CCF)", sugerida: "210501" },
      { campo: "cuenta_iva_debito_cf_id", label: "IVA Débito Fiscal — Consumidores finales", sugerida: "210502" },
      { campo: "cuenta_cxc_id", label: "Cuentas por Cobrar (ventas al crédito)", sugerida: null },
    ];
  }
  return [
    { campo: "cuenta_iva_credito_id", label: "IVA Crédito Fiscal (compras con CCF)", sugerida: "110601" },
    { campo: "cuenta_cxp_id", label: "Cuentas por Pagar (compras al crédito)", sugerida: null },
  ];
}

const inputCls =
  "w-full border border-paperLine rounded-sm px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brass";
const labelCls = "block text-xs font-medium text-inkSoft mb-1";

export default function PanelVentasCompras({ tipo }) {
  const { empresa, cuentas, empresaId, actualizarEmpresa } = useEmpresa();
  const cfg = configVC(tipo);
  const esVenta = tipo === "venta";

  const [productos, setProductos] = useState([]);
  const [entidades, setEntidades] = useState([]);
  const [documentos, setDocumentos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [kardexCache, setKardexCache] = useState({});

  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState(() => formularioVacio("producto"));
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null);

  const [nuevaEntidad, setNuevaEntidad] = useState("");
  const [mostrarNuevaEntidad, setMostrarNuevaEntidad] = useState(false);

  const [docAbiertoId, setDocAbiertoId] = useState(null);
  const [lineasAbiertas, setLineasAbiertas] = useState([]);

  // --- Configuración de cuentas -----------------------------------------
  const campos = camposConfiguracion(tipo, empresa?.tipo);
  const sugerencias = useMemo(() => {
    const s = {};
    for (const c of campos) {
      if (!c.sugerida) continue;
      const cuenta = cuentas.find((x) => x.codigo === c.sugerida);
      if (cuenta) s[c.campo] = cuenta.id;
    }
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuentas, tipo, empresa?.tipo]);

  const [config, setConfig] = useState({});
  const [mostrarConfig, setMostrarConfig] = useState(false);
  const [guardandoConfig, setGuardandoConfig] = useState(false);

  useEffect(() => {
    const inicial = {};
    for (const c of campos) inicial[c.campo] = empresa?.[c.campo] || sugerencias[c.campo] || "";
    setConfig(inicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresa, sugerencias]);

  const configIncompleta = campos
    .filter((c) => c.campo !== cfg.campoCuentaControl)
    .some((c) => !empresa?.[c.campo]);

  async function guardarConfig() {
    setGuardandoConfig(true);
    const cambios = {};
    for (const c of campos) cambios[c.campo] = config[c.campo] || null;
    await actualizarEmpresa(cambios);
    setGuardandoConfig(false);
    setMostrarConfig(false);
  }

  // --- Carga de datos -----------------------------------------------------
  async function cargarTodo() {
    setCargando(true);
    try {
      const [prods, ents, docs] = await Promise.all([
        obtenerProductos(empresaId),
        supabase.from(cfg.tablaEntidad).select("*").eq("empresa_id", empresaId).order("nombre"),
        obtenerDocumentos(cfg, empresaId),
      ]);
      setProductos(prods);
      setEntidades(ents.data || []);
      setDocumentos(docs);
      return prods;
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarTodo().then((prods) => {
      setForm(formularioVacio(prods.length ? "producto" : "concepto"));
    });
    setKardexCache({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, tipo]);

  // Trae el kardex de los productos que se van usando en el formulario
  const productosEnForm = form.lineas
    .filter((l) => l.clase === "producto" && l.producto_id)
    .map((l) => l.producto_id);
  const claveProductos = [...new Set(productosEnForm)].sort().join(",");
  useEffect(() => {
    const faltantes = [...new Set(productosEnForm)].filter((id) => !kardexCache[id]);
    if (faltantes.length === 0) return;
    Promise.all(faltantes.map((id) => obtenerKardex(id).then((m) => [id, m]))).then((pares) => {
      setKardexCache((c) => ({ ...c, ...Object.fromEntries(pares) }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveProductos]);

  // --- Cálculos en vivo (vista previa) -----------------------------------
  const productosPorId = useMemo(
    () => Object.fromEntries(productos.map((p) => [p.id, p])),
    [productos]
  );
  const cuentasPorId = useMemo(() => Object.fromEntries(cuentas.map((c) => [c.id, c])), [cuentas]);

  const lineasValidas = form.lineas.filter(
    (l) =>
      Number(l.cantidad) > 0 &&
      Number(l.precio) > 0 &&
      (l.clase === "producto" ? l.producto_id : l.cuenta_id)
  );
  const calculo = useMemo(
    () => calcularDocumento(cfg, form.tipoDocumento, form.lineas),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form.tipoDocumento, form.lineas, tipo]
  );
  const simulacion = useMemo(
    () => simularKardex(cfg, form.fecha, calculo.detalle, kardexCache, productosPorId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [calculo, form.fecha, kardexCache, productosPorId, tipo]
  );
  const partida = useMemo(
    () =>
      construirPartida(cfg, empresa, form, calculo, simulacion.costos || {}, productosPorId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [calculo, simulacion, empresa, form.condicion, form.cuentaDinero, form.tipoDocumento, tipo]
  );

  // --- Edición del formulario ---------------------------------------------
  function cambiar(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }
  function cambiarLinea(key, cambios) {
    setForm((f) => ({
      ...f,
      lineas: f.lineas.map((l) => (l.key === key ? { ...l, ...cambios } : l)),
    }));
  }
  function agregarLinea() {
    setForm((f) => ({
      ...f,
      lineas: [...f.lineas, lineaVacia(productos.length ? "producto" : "concepto")],
    }));
  }
  function quitarLinea(key) {
    setForm((f) => ({ ...f, lineas: f.lineas.filter((l) => l.key !== key) }));
  }

  async function agregarEntidad() {
    const nombre = nuevaEntidad.trim();
    if (!nombre) return;
    const { data, error: err } = await supabase
      .from(cfg.tablaEntidad)
      .insert({ empresa_id: empresaId, nombre })
      .select()
      .single();
    if (err) {
      setError("No se pudo agregar: " + err.message);
      return;
    }
    setEntidades((e) => [...e, data].sort((a, b) => a.nombre.localeCompare(b.nombre)));
    cambiar("entidadId", data.id);
    setNuevaEntidad("");
    setMostrarNuevaEntidad(false);
  }

  async function registrar(e) {
    e.preventDefault();
    setError(null);
    setAviso(null);
    setGuardando(true);
    const res = await registrarDocumento(cfg, { empresa, empresaId, form, productos, entidades });
    setGuardando(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setAviso(
      `${esVenta ? "Venta" : "Compra"} registrada. Se generó la partida N° ${res.numeroPartida} en el Diario.`
    );
    setForm(formularioVacio(productos.length ? "producto" : "concepto"));
    setKardexCache({});
    setMostrarForm(false);
    cargarTodo();
  }

  async function abrirDocumento(doc) {
    if (docAbiertoId === doc.id) {
      setDocAbiertoId(null);
      return;
    }
    setDocAbiertoId(doc.id);
    setLineasAbiertas([]);
    setLineasAbiertas(await obtenerLineas(cfg, doc.id));
  }

  async function eliminar(doc) {
    const confirmado = confirm(
      `¿Eliminar esta ${cfg.labelDoc}? También se eliminarán su partida contable, sus movimientos de kardex` +
        (doc.condicion === "credito" ? ` y su factura en ${cfg.labelControl}.` : ".")
    );
    if (!confirmado) return;
    const res = await eliminarDocumento(cfg, doc);
    if (res.error) {
      alert("No se puede eliminar: " + res.error);
      return;
    }
    if (docAbiertoId === doc.id) setDocAbiertoId(null);
    setKardexCache({});
    cargarTodo();
  }

  function exportar() {
    const filas = [
      [cfg.labelModulo],
      [],
      ["Fecha", "Documento", "Número", cfg.labelEntidad, "Condición", "Subtotal", "IVA", "Total", "Partida N°"],
      ...documentos.map((d) => [
        d.fecha,
        etiquetaCorta(d.tipo_documento),
        d.numero_documento || "",
        d.entidad?.nombre || "",
        d.condicion === "credito" ? "Crédito" : "Contado",
        Number(d.subtotal),
        Number(d.iva),
        Number(d.total),
        d.partida?.numero_partida ?? "",
      ]),
    ];
    exportarAExcel(cfg.labelModulo.toLowerCase(), [{ nombre: cfg.labelModulo, filas }]);
  }

  // --- Textos que dependen del tipo de documento --------------------------
  const etiquetaPrecio =
    form.tipoDocumento === "ccf"
      ? "Precio unit. (sin IVA)"
      : form.tipoDocumento === "factura"
      ? "Precio unit. (IVA incluido)"
      : "Precio unit.";

  const totalDocumentos = documentos.reduce((s, d) => s + Number(d.total), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 no-print">
        <h2 className="font-display text-lg font-semibold">{cfg.labelModulo}</h2>
        <div className="flex gap-3 items-center">
          <button
            onClick={() => setMostrarConfig((v) => !v)}
            className="text-xs text-brassDark hover:underline"
          >
            Configuración de cuentas
          </button>
          {documentos.length > 0 && (
            <button onClick={exportar} className="text-xs text-brassDark hover:underline">
              Exportar a Excel
            </button>
          )}
        </div>
      </div>

      {/* Configuración de cuentas */}
      {(mostrarConfig || configIncompleta) && (
        <div className="bg-[#F7F4EA] border border-paperLine rounded-sm p-4 mb-6 no-print">
          <p className="text-sm font-medium mb-1">Configuración de cuentas</p>
          <p className="text-xs text-inkSoft mb-4">
            Cuentas que se usarán automáticamente al generar la partida de cada {cfg.labelDoc}.
            {Object.keys(sugerencias).length > 0 &&
              " Se sugieren las del catálogo base; puedes cambiarlas."}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {campos.map((c) => (
              <div key={c.campo}>
                <label className={labelCls}>{c.label}</label>
                <CuentaCombobox
                  cuentas={cuentas}
                  value={config[c.campo] || ""}
                  onChange={(id) => setConfig((cf) => ({ ...cf, [c.campo]: id }))}
                />
              </div>
            ))}
          </div>
          <button
            onClick={guardarConfig}
            disabled={guardandoConfig}
            className="mt-4 bg-ink text-paper px-4 py-1.5 rounded-sm text-sm font-medium hover:bg-[#2C3A52] disabled:opacity-60"
          >
            {guardandoConfig ? "Guardando…" : "Guardar configuración"}
          </button>
        </div>
      )}

      {aviso && <p className="text-sm text-ledger mb-4 no-print">{aviso}</p>}

      {!mostrarForm ? (
        <button
          onClick={() => {
            setMostrarForm(true);
            setAviso(null);
          }}
          disabled={configIncompleta}
          className="mb-6 bg-ink text-paper px-4 py-2 rounded-sm text-sm font-medium hover:bg-[#2C3A52] disabled:opacity-50 no-print"
          title={configIncompleta ? "Primero guarda la configuración de cuentas" : ""}
        >
          + Registrar {cfg.labelDoc}
        </button>
      ) : (
        <form
          onSubmit={registrar}
          className="bg-[#F7F4EA] border border-paperLine rounded-sm p-4 mb-8 space-y-5 no-print"
        >
          <div className="flex items-center justify-between">
            <p className="font-medium">Nueva {cfg.labelDoc}</p>
            <button
              type="button"
              onClick={() => {
                setMostrarForm(false);
                setError(null);
              }}
              className="text-xs text-inkSoft hover:underline"
            >
              Cancelar
            </button>
          </div>

          {/* Encabezado del documento */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Fecha</label>
              <input
                type="date"
                value={form.fecha}
                onChange={(e) => cambiar("fecha", e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Tipo de documento</label>
              <select
                value={form.tipoDocumento}
                onChange={(e) => cambiar("tipoDocumento", e.target.value)}
                className={inputCls}
              >
                {TIPOS_DOCUMENTO.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.etiqueta}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Número de documento</label>
              <input
                value={form.numero}
                onChange={(e) => cambiar("numero", e.target.value)}
                className={inputCls}
                placeholder="Opcional"
              />
            </div>

            <div>
              <label className={labelCls}>
                {cfg.labelEntidad}
                {form.tipoDocumento === "ccf" || form.condicion === "credito" ? "" : " (opcional)"}
              </label>
              <select
                value={form.entidadId}
                onChange={(e) => cambiar("entidadId", e.target.value)}
                className={inputCls}
              >
                <option value="">
                  {esVenta ? "Consumidor final / sin cliente" : "Sin proveedor"}
                </option>
                {entidades.map((en) => (
                  <option key={en.id} value={en.id}>
                    {en.nombre}
                  </option>
                ))}
              </select>
              {mostrarNuevaEntidad ? (
                <div className="flex gap-2 mt-1">
                  <input
                    value={nuevaEntidad}
                    onChange={(e) => setNuevaEntidad(e.target.value)}
                    placeholder={`Nombre del ${cfg.labelEntidad.toLowerCase()}`}
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={agregarEntidad}
                    className="text-xs text-brassDark font-medium hover:underline"
                  >
                    Agregar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setMostrarNuevaEntidad(true)}
                  className="text-xs text-brassDark hover:underline mt-1"
                >
                  + Nuevo {cfg.labelEntidad.toLowerCase()}
                </button>
              )}
            </div>
            <div>
              <label className={labelCls}>Condición</label>
              <select
                value={form.condicion}
                onChange={(e) => cambiar("condicion", e.target.value)}
                className={inputCls}
              >
                <option value="contado">Al contado</option>
                <option value="credito">Al crédito</option>
              </select>
            </div>
            <div>
              {form.condicion === "contado" ? (
                <>
                  <label className={labelCls}>{cfg.labelDinero}</label>
                  <CuentaCombobox
                    cuentas={cuentas}
                    value={form.cuentaDinero}
                    onChange={(id) => cambiar("cuentaDinero", id)}
                    placeholder="Caja, Bancos…"
                  />
                </>
              ) : (
                <>
                  <label className={labelCls}>Fecha de vencimiento</label>
                  <input
                    type="date"
                    value={form.fechaVencimiento}
                    onChange={(e) => cambiar("fechaVencimiento", e.target.value)}
                    className={inputCls}
                  />
                  {!empresa?.[cfg.campoCuentaControl] && (
                    <p className="text-xs text-rust mt-1">
                      Falta configurar la cuenta de {cfg.labelControl}.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          <div>
            <label className={labelCls}>Descripción (opcional)</label>
            <input
              value={form.descripcion}
              onChange={(e) => cambiar("descripcion", e.target.value)}
              className={inputCls}
              placeholder={esVenta ? "Ej. Venta de mercadería" : "Ej. Compra de mercadería para reventa"}
            />
          </div>

          {/* Líneas */}
          <div>
            <p className="text-sm font-medium mb-2">Detalle</p>
            <div className="space-y-2">
              {form.lineas.map((l, i) => {
                const detalle = calculo.detalle[i];
                const existencia =
                  l.clase === "producto" && l.producto_id && kardexCache[l.producto_id]
                    ? saldoActual(kardexCache[l.producto_id])
                    : null;
                return (
                  <div
                    key={l.key}
                    className="grid grid-cols-12 gap-2 items-start border border-paperLine rounded-sm p-2 bg-paper/40"
                  >
                    <div className="col-span-12 md:col-span-2">
                      <label className={labelCls}>Tipo</label>
                      <select
                        value={l.clase}
                        onChange={(e) =>
                          cambiarLinea(l.key, {
                            clase: e.target.value,
                            producto_id: "",
                            cuenta_id: "",
                          })
                        }
                        className={inputCls}
                      >
                        <option value="producto" disabled={productos.length === 0}>
                          Producto
                        </option>
                        <option value="concepto">{esVenta ? "Servicio / otro" : "Gasto / otro"}</option>
                      </select>
                    </div>

                    <div className="col-span-12 md:col-span-4">
                      {l.clase === "producto" ? (
                        <>
                          <label className={labelCls}>Producto</label>
                          <select
                            value={l.producto_id}
                            onChange={(e) => cambiarLinea(l.key, { producto_id: e.target.value })}
                            className={inputCls}
                          >
                            <option value="">Selecciona…</option>
                            {productos.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.codigo ? `${p.codigo} — ` : ""}
                                {p.nombre}
                              </option>
                            ))}
                          </select>
                          {existencia && (
                            <p className="text-xs text-inkSoft mt-1">
                              Existencia: <span className="font-num">{existencia.cantidad}</span>
                              {" · "}Costo prom.:{" "}
                              <span className="font-num">{formatoMoneda(existencia.costoUnitario)}</span>
                            </p>
                          )}
                        </>
                      ) : (
                        <>
                          <label className={labelCls}>
                            {esVenta ? "Cuenta de ingreso" : "Cuenta de gasto o activo"}
                          </label>
                          <CuentaCombobox
                            cuentas={cuentas}
                            value={l.cuenta_id}
                            onChange={(id) => cambiarLinea(l.key, { cuenta_id: id })}
                          />
                          <input
                            value={l.descripcion}
                            onChange={(e) => cambiarLinea(l.key, { descripcion: e.target.value })}
                            placeholder={esVenta ? "Descripción (ej. Asesoría contable)" : "Descripción (ej. Papelería)"}
                            className={`${inputCls} mt-1`}
                          />
                        </>
                      )}
                    </div>

                    <div className="col-span-4 md:col-span-2">
                      <label className={labelCls}>Cantidad</label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={l.cantidad}
                        onChange={(e) => cambiarLinea(l.key, { cantidad: e.target.value })}
                        className={`${inputCls} font-num text-right`}
                      />
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <label className={labelCls}>{etiquetaPrecio}</label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={l.precio}
                        onChange={(e) => cambiarLinea(l.key, { precio: e.target.value })}
                        className={`${inputCls} font-num text-right`}
                      />
                    </div>
                    <div className="col-span-3 md:col-span-1">
                      <label className={labelCls}>Importe</label>
                      <p className="font-num text-sm text-right py-1">
                        {formatoMoneda(detalle?.bruto || 0)}
                      </p>
                    </div>
                    <div className="col-span-1 flex justify-end pt-5">
                      {form.lineas.length > 1 && (
                        <button
                          type="button"
                          onClick={() => quitarLinea(l.key)}
                          className="text-rust text-sm hover:underline"
                          aria-label="Quitar línea"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={agregarLinea}
              className="text-xs text-brassDark hover:underline mt-2"
            >
              + Agregar línea
            </button>
            {productos.length === 0 && (
              <p className="text-xs text-inkSoft mt-1">
                Para vender o comprar productos con inventario, créalos primero en{" "}
                <Link href={`/empresa/${empresaId}/kardex`} className="underline">
                  Kardex
                </Link>
                .
              </p>
            )}
          </div>

          {/* Totales */}
          <div className="flex justify-end">
            <table className="text-sm">
              <tbody>
                {form.tipoDocumento === "ccf" && (
                  <>
                    <tr>
                      <td className="pr-6 text-inkSoft">Sumas</td>
                      <td className="font-num text-right">{formatoMoneda(calculo.subtotal)}</td>
                    </tr>
                    <tr>
                      <td className="pr-6 text-inkSoft">
                        IVA 13% ({esVenta ? "débito fiscal" : "crédito fiscal"})
                      </td>
                      <td className="font-num text-right">{formatoMoneda(calculo.iva)}</td>
                    </tr>
                  </>
                )}
                {form.tipoDocumento === "factura" && esVenta && (
                  <>
                    <tr>
                      <td className="pr-6 text-inkSoft">Venta neta (total ÷ 1.13)</td>
                      <td className="font-num text-right">{formatoMoneda(calculo.subtotal)}</td>
                    </tr>
                    <tr>
                      <td className="pr-6 text-inkSoft">IVA incluido (débito fiscal)</td>
                      <td className="font-num text-right">{formatoMoneda(calculo.iva)}</td>
                    </tr>
                  </>
                )}
                <tr className="border-t border-paperLine">
                  <td className="pr-6 font-medium pt-1">Total</td>
                  <td className="font-num text-right font-medium pt-1">
                    {formatoMoneda(calculo.total)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          {form.tipoDocumento === "factura" && !esVenta && calculo.total > 0 && (
            <p className="text-xs text-inkSoft text-right -mt-3">
              La factura de consumidor final no da derecho a crédito fiscal: el IVA incluido (
              {formatoMoneda(calculo.ivaIncluidoEnCosto)}) forma parte del costo.
            </p>
          )}

          {/* Vista previa de la partida */}
          {lineasValidas.length > 0 && (
            <div className="border border-paperLine rounded-sm bg-paper/60">
              <p className="text-sm font-medium px-3 pt-3">Partida que se generará</p>
              <p className="text-xs text-inkSoft px-3 mb-2">
                {esVenta
                  ? "El costo de venta se calcula con el costo promedio del Kardex."
                  : "Las entradas al Kardex recalculan el costo promedio de cada producto."}
              </p>
              {simulacion.pendiente ? (
                <p className="text-sm text-inkSoft px-3 pb-3">Consultando existencias…</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-inkSoft border-b border-paperLine">
                      <th className="text-left font-normal px-3 py-1">Cuenta</th>
                      <th className="text-right font-normal px-3 py-1">Debe</th>
                      <th className="text-right font-normal px-3 py-1">Haber</th>
                    </tr>
                  </thead>
                  <tbody>
                    {partida.lineas.map((pl, k) => {
                      const c = cuentasPorId[pl.cuenta_id];
                      return (
                        <tr key={k} className="border-b border-paperLine/60">
                          <td className={`px-3 py-1 ${pl.haber > 0 ? "pl-10" : ""}`}>
                            {c ? (
                              <>
                                <span className="font-num">{c.codigo}</span> — {c.nombre}
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-3 py-1 text-right font-num">
                            {pl.debe ? formatoMoneda(pl.debe) : ""}
                          </td>
                          <td className="px-3 py-1 text-right font-num">
                            {pl.haber ? formatoMoneda(pl.haber) : ""}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="font-medium">
                      <td className="px-3 py-1 text-right text-xs text-inkSoft">Sumas iguales</td>
                      <td className="px-3 py-1 text-right font-num">
                        {formatoMoneda(partida.totalDebe)}
                      </td>
                      <td className="px-3 py-1 text-right font-num">
                        {formatoMoneda(partida.totalHaber)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}
              {(simulacion.error || partida.errores.length > 0) && (
                <ul className="px-3 py-2 text-xs text-rust space-y-0.5">
                  {simulacion.error && <li>{simulacion.error}</li>}
                  {partida.errores.map((er) => (
                    <li key={er}>{er}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {error && <p className="text-sm text-rust">{error}</p>}

          <button
            type="submit"
            disabled={guardando}
            className="bg-ink text-paper px-5 py-2 rounded-sm text-sm font-medium hover:bg-[#2C3A52] disabled:opacity-60"
          >
            {guardando ? "Registrando…" : `Registrar ${cfg.labelDoc}`}
          </button>
        </form>
      )}

      {/* Listado */}
      {cargando ? (
        <p className="text-sm text-inkSoft">Cargando…</p>
      ) : documentos.length === 0 ? (
        <p className="text-sm text-inkSoft">
          Todavía no hay {cfg.labelModulo.toLowerCase()} registradas.
        </p>
      ) : (
        <div className="overflow-x-auto bg-[#F7F4EA] border border-paperLine rounded-sm">
          <table className="w-full text-sm">
            <thead className="bg-ink text-paper text-xs">
              <tr>
                <th className="text-left font-normal px-3 py-2">Fecha</th>
                <th className="text-left font-normal px-3 py-2">Documento</th>
                <th className="text-left font-normal px-3 py-2">{cfg.labelEntidad}</th>
                <th className="text-left font-normal px-3 py-2">Condición</th>
                <th className="text-right font-normal px-3 py-2">Total</th>
                <th className="text-right font-normal px-3 py-2">Partida</th>
                <th className="px-3 py-2 no-print"></th>
              </tr>
            </thead>
            <tbody>
              {documentos.map((d) => (
                <Fragment key={d.id}>
                  <tr className="border-t border-paperLine">
                    <td className="px-3 py-1.5 whitespace-nowrap">{d.fecha}</td>
                    <td className="px-3 py-1.5">
                      {etiquetaCorta(d.tipo_documento)}
                      {d.numero_documento ? ` N° ${d.numero_documento}` : ""}
                    </td>
                    <td className="px-3 py-1.5">
                      {d.entidad?.nombre || (
                        <span className="text-inkSoft">
                          {esVenta ? "Consumidor final" : "—"}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      {d.condicion === "credito" ? (
                        <>
                          Crédito
                          {d.factura && (
                            <span className="text-xs text-inkSoft">
                              {" · "}
                              {Number(d.factura.saldo_pendiente) <= 0.005
                                ? "pagada"
                                : `saldo ${formatoMoneda(d.factura.saldo_pendiente)}`}
                            </span>
                          )}
                        </>
                      ) : (
                        "Contado"
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right font-num">{formatoMoneda(d.total)}</td>
                    <td className="px-3 py-1.5 text-right font-num">
                      {d.partida?.numero_partida ?? "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right no-print whitespace-nowrap">
                      <button
                        onClick={() => abrirDocumento(d)}
                        className="text-brassDark text-xs font-medium hover:underline mr-3"
                      >
                        {docAbiertoId === d.id ? "Cerrar" : "Ver"}
                      </button>
                      <button
                        onClick={() => eliminar(d)}
                        className="text-rust text-xs hover:underline"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                  {docAbiertoId === d.id && (
                    <tr className="bg-paper/60">
                      <td colSpan={7} className="px-3 py-3">
                        {d.descripcion && <p className="text-xs text-inkSoft mb-2">{d.descripcion}</p>}
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-inkSoft">
                              <th className="text-left font-normal py-1">Descripción</th>
                              <th className="text-left font-normal py-1">Cuenta</th>
                              <th className="text-right font-normal py-1">Cant.</th>
                              <th className="text-right font-normal py-1">Precio</th>
                              <th className="text-right font-normal py-1">
                                {d.tipo_documento === "factura" && esVenta ? "Neto" : "Importe"}
                              </th>
                              {esVenta && <th className="text-right font-normal py-1">Costo</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {lineasAbiertas.map((ln) => (
                              <tr key={ln.id} className="border-t border-paperLine/60">
                                <td className="py-1">
                                  {ln.producto?.nombre || ln.descripcion}
                                  {ln.producto_id && (
                                    <span className="text-inkSoft"> (inventario)</span>
                                  )}
                                </td>
                                <td className="py-1">
                                  {ln.cuenta ? `${ln.cuenta.codigo} — ${ln.cuenta.nombre}` : ""}
                                </td>
                                <td className="py-1 text-right font-num">{Number(ln.cantidad)}</td>
                                <td className="py-1 text-right font-num">
                                  {formatoMoneda(ln.precio_unitario)}
                                </td>
                                <td className="py-1 text-right font-num">
                                  {formatoMoneda(ln.subtotal)}
                                </td>
                                {esVenta && (
                                  <td className="py-1 text-right font-num">
                                    {ln.producto_id ? formatoMoneda(ln.costo_total) : ""}
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <p className="text-xs text-inkSoft mt-2">
                          Subtotal {formatoMoneda(d.subtotal)} · IVA {formatoMoneda(d.iva)} · Total{" "}
                          {formatoMoneda(d.total)}
                          {esVenta && Number(d.costo_total) > 0 &&
                            ` · Costo de venta ${formatoMoneda(d.costo_total)}`}
                          {d.partida?.numero_partida && (
                            <>
                              {" · "}
                              <Link
                                href={`/empresa/${empresaId}/transacciones`}
                                className="underline"
                              >
                                Partida N° {d.partida.numero_partida} en el Diario
                              </Link>
                            </>
                          )}
                        </p>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              <tr className="border-t border-paperLine font-medium">
                <td colSpan={4} className="px-3 py-1.5 text-right text-xs text-inkSoft">
                  Total {cfg.labelModulo.toLowerCase()}
                </td>
                <td className="px-3 py-1.5 text-right font-num">{formatoMoneda(totalDocumentos)}</td>
                <td colSpan={2}></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
