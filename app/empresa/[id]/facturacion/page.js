"use client";

import { useEffect, useState, Fragment } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import DatosEmisor from "@/components/DatosEmisor";
import {
  TIPOS_DTE,
  calcularTotales,
  generarCodigoGeneracion,
  generarNumeroControl,
  construirJsonDte,
} from "@/lib/dte";

function lineaVacia() {
  return { descripcion: "", cantidad: "1", precio_unitario: "" };
}

export default function FacturacionPage() {
  const params = useParams();
  const empresaId = params.id;

  const [empresa, setEmpresa] = useState(null);
  const [cuentas, setCuentas] = useState([]);
  const [documentos, setDocumentos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [verJsonId, setVerJsonId] = useState(null);
  const [clientes, setClientes] = useState([]);
  const [clienteId, setClienteId] = useState("");
  const [guardarCliente, setGuardarCliente] = useState(false);
  const [aviso, setAviso] = useState(null);

  const [tipoDte, setTipoDte] = useState("01");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [formaPago, setFormaPago] = useState("contado");
  const [receptor, setReceptor] = useState({ nombre: "", nit_dui: "", nrc: "", correo: "", direccion: "" });
  const [cuentaCobro, setCuentaCobro] = useState("");
  const [cuentaIngreso, setCuentaIngreso] = useState("");
  const [cuentaIva, setCuentaIva] = useState("");
  const [items, setItems] = useState([lineaVacia()]);

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  async function cargar() {
    setCargando(true);
    const [{ data: emp }, { data: cts }, { data: docs }, { data: cls }] = await Promise.all([
      supabase.from("empresas").select("*").eq("id", empresaId).single(),
      supabase.from("cuentas").select("*").eq("empresa_id", empresaId).order("codigo"),
      supabase
        .from("documentos_dte")
        .select("*")
        .eq("empresa_id", empresaId)
        .order("created_at", { ascending: false }),
      supabase.from("clientes").select("*").eq("empresa_id", empresaId).order("nombre"),
    ]);
    setClientes(cls || []);
    setEmpresa(emp);
    setCuentas(cts || []);
    setDocumentos(docs || []);
    setCargando(false);
  }

  function elegirCliente(id) {
    setClienteId(id);
    const c = clientes.find((x) => x.id === id);
    if (!c) return;
    setReceptor({
      nombre: c.nombre || "",
      nit_dui: c.nit_dui || "",
      nrc: c.nrc || "",
      correo: c.correo || "",
      direccion: c.direccion || "",
    });
  }

  function actualizarItem(i, campo, valor) {
    const copia = [...items];
    copia[i] = { ...copia[i], [campo]: valor };
    setItems(copia);
  }

  function agregarItem() {
    setItems([...items, lineaVacia()]);
  }

  function quitarItem(i) {
    if (items.length <= 1) return;
    setItems(items.filter((_, idx) => idx !== i));
  }

  const itemsValidos = items.filter(
    (it) => it.descripcion.trim() && parseFloat(it.cantidad) > 0 && parseFloat(it.precio_unitario) >= 0
  );
  const { itemsCalculados, subtotal, iva, total } =
    itemsValidos.length > 0 ? calcularTotales(itemsValidos) : { itemsCalculados: [], subtotal: 0, iva: 0, total: 0 };

  async function emitirFactura(e) {
    e.preventDefault();
    setError(null);

    if (!empresa?.nit || !empresa?.nrc) {
      setError("Completa los datos fiscales del emisor (NIT y NRC) antes de emitir.");
      return;
    }
    if (!receptor.nombre.trim()) {
      setError("Indica el nombre del receptor.");
      return;
    }
    if (itemsValidos.length === 0) {
      setError("Agrega al menos un ítem válido (descripción, cantidad y precio).");
      return;
    }
    if (!cuentaCobro || !cuentaIngreso || !cuentaIva) {
      setError("Selecciona las tres cuentas contables (cobro, ingreso e IVA) para generar el asiento.");
      return;
    }

    setGuardando(true);

    const correlativo = documentos.filter((d) => d.tipo_dte === tipoDte).length + 1;
    const numeroControl = generarNumeroControl({
      tipoDte,
      codEstablecimiento: empresa.cod_establecimiento,
      codPuntoVenta: empresa.cod_punto_venta,
      correlativo,
    });
    const codigoGeneracion = generarCodigoGeneracion();

    const jsonDte = construirJsonDte({
      empresa,
      tipoDte,
      numeroControl,
      codigoGeneracion,
      fechaEmision: fecha,
      receptor,
      itemsCalculados,
      subtotal,
      iva,
      total,
      formaPago,
    });

    // 1) Crear el asiento contable (partida doble)
    const { data: ultimaTrans } = await supabase
      .from("transacciones")
      .select("numero_partida")
      .eq("empresa_id", empresaId)
      .order("numero_partida", { ascending: false })
      .limit(1)
      .maybeSingle();
    const numeroPartida = ultimaTrans ? ultimaTrans.numero_partida + 1 : 1;

    const { data: trans, error: errTrans } = await supabase
      .from("transacciones")
      .insert({
        empresa_id: empresaId,
        fecha,
        descripcion: `Venta según ${TIPOS_DTE[tipoDte]} ${numeroControl} — ${receptor.nombre}`,
        numero_partida: numeroPartida,
      })
      .select()
      .single();

    if (errTrans) {
      setError("No se pudo crear el asiento contable: " + errTrans.message);
      setGuardando(false);
      return;
    }

    const { error: errMov } = await supabase.from("movimientos").insert([
      { transaccion_id: trans.id, cuenta_id: cuentaCobro, debe: total, haber: 0 },
      { transaccion_id: trans.id, cuenta_id: cuentaIngreso, debe: 0, haber: subtotal },
      { transaccion_id: trans.id, cuenta_id: cuentaIva, debe: 0, haber: iva },
    ]);

    if (errMov) {
      setError("Asiento creado, pero fallaron las líneas: " + errMov.message);
      setGuardando(false);
      return;
    }

    // 2) Guardar el documento DTE, enlazado al asiento
    const { error: errDoc } = await supabase.from("documentos_dte").insert({
      empresa_id: empresaId,
      tipo_dte: tipoDte,
      numero_control: numeroControl,
      codigo_generacion: codigoGeneracion,
      fecha_emision: fecha,
      forma_pago: formaPago,
      receptor,
      items: itemsCalculados,
      subtotal,
      iva,
      total,
      estado: "generado",
      json_dte: jsonDte,
      transaccion_id: trans.id,
    });

    if (errDoc) {
      setError("El asiento se creó, pero falló al guardar el documento DTE: " + errDoc.message);
      setGuardando(false);
      return;
    }

    let avisoCliente = null;
    if (guardarCliente) {
      const datosCliente = {
        nombre: receptor.nombre.trim(),
        nit_dui: receptor.nit_dui.trim() || null,
        nrc: receptor.nrc.trim() || null,
        correo: receptor.correo.trim() || null,
        direccion: receptor.direccion.trim() || null,
      };
      // Si no eligió un cliente pero ya existe uno con el mismo nombre, lo actualiza
      // en vez de crear un duplicado.
      const idExistente =
        clienteId ||
        clientes.find(
          (c) => (c.nombre || "").trim().toLowerCase() === datosCliente.nombre.toLowerCase()
        )?.id;
      const { error: errCli } = idExistente
        ? await supabase.from("clientes").update(datosCliente).eq("id", idExistente)
        : await supabase.from("clientes").insert({ ...datosCliente, empresa_id: empresaId });
      if (errCli) {
        avisoCliente =
          "El documento se emitió, pero no se pudo guardar el cliente: " + errCli.message;
      }
    }

    setReceptor({ nombre: "", nit_dui: "", nrc: "", correo: "", direccion: "" });
    setClienteId("");
    setGuardarCliente(false);
    setAviso(avisoCliente);
    setItems([lineaVacia()]);
    setGuardando(false);
    cargar();
  }

  if (cargando) return <p className="text-inkSoft">Cargando…</p>;

  const cuentasActivo = cuentas.filter((c) => c.clase === "Activo");
  const cuentasIngreso = cuentas.filter((c) => c.clase === "Ingreso");
  const cuentasPasivo = cuentas.filter((c) => c.clase === "Pasivo");

  return (
    <div className="space-y-10">
      <DatosEmisor empresa={empresa} onGuardado={(v) => setEmpresa({ ...empresa, ...v })} />

      <section className="bg-[#F7F4EA] border border-paperLine rounded-sm p-6">
        <h2 className="font-display text-base font-semibold mb-1">Emitir documento</h2>
        <p className="text-xs text-inkSoft mb-4">
          Se genera el Código de Generación, el Número de Control y el asiento contable
          automáticamente. La firma electrónica y transmisión real a Hacienda quedan
          pendientes hasta que conectes tu certificado digital y credenciales.
        </p>

        <form onSubmit={emitirFactura} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-inkSoft mb-1">Tipo de documento</label>
              <select
                value={tipoDte}
                onChange={(e) => setTipoDte(e.target.value)}
                className="w-full border border-paperLine rounded-sm px-2 py-2 text-sm"
              >
                {Object.entries(TIPOS_DTE).map(([cod, nom]) => (
                  <option key={cod} value={cod}>{cod} — {nom}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-inkSoft mb-1">Fecha</label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full border border-paperLine rounded-sm px-2 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-inkSoft mb-1">Forma de pago</label>
              <select
                value={formaPago}
                onChange={(e) => setFormaPago(e.target.value)}
                className="w-full border border-paperLine rounded-sm px-2 py-2 text-sm"
              >
                <option value="contado">Contado</option>
                <option value="credito">Crédito</option>
              </select>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-inkSoft uppercase tracking-wide mb-2">
              Receptor
            </p>
            <div className="mb-3">
              <label className="block text-xs text-inkSoft mb-1">Cliente registrado</label>
              <select
                value={clienteId}
                onChange={(e) => elegirCliente(e.target.value)}
                className="w-full sm:w-1/2 border border-paperLine rounded-sm px-2 py-2 text-sm"
              >
                <option value="">
                  {clientes.length === 0
                    ? "No hay clientes registrados — escribe el receptor abajo"
                    : "— Escribir el receptor manualmente —"}
                </option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                    {c.nit_dui ? ` — ${c.nit_dui}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                placeholder="Nombre / Razón social"
                value={receptor.nombre}
                onChange={(e) => setReceptor({ ...receptor, nombre: e.target.value })}
                className="border border-paperLine rounded-sm px-2 py-2 text-sm sm:col-span-2"
              />
              <input
                placeholder="NIT o DUI"
                value={receptor.nit_dui}
                onChange={(e) => setReceptor({ ...receptor, nit_dui: e.target.value })}
                className="border border-paperLine rounded-sm px-2 py-2 text-sm"
              />
              <input
                placeholder="NRC (si aplica)"
                value={receptor.nrc}
                onChange={(e) => setReceptor({ ...receptor, nrc: e.target.value })}
                className="border border-paperLine rounded-sm px-2 py-2 text-sm"
              />
              <input
                placeholder="Correo"
                value={receptor.correo}
                onChange={(e) => setReceptor({ ...receptor, correo: e.target.value })}
                className="border border-paperLine rounded-sm px-2 py-2 text-sm"
              />
              <input
                placeholder="Dirección"
                value={receptor.direccion}
                onChange={(e) => setReceptor({ ...receptor, direccion: e.target.value })}
                className="border border-paperLine rounded-sm px-2 py-2 text-sm"
              />
            </div>
            <label className="flex items-center gap-2 mt-3 text-sm text-inkSoft">
              <input
                type="checkbox"
                checked={guardarCliente}
                onChange={(e) => setGuardarCliente(e.target.checked)}
              />
              {clienteId
                ? "Actualizar los datos de este cliente (NIT/DUI, NRC, correo, dirección)"
                : "Guardar este receptor en mis clientes (también aparecerá en Cuentas por Cobrar)"}
            </label>
          </div>

          <div>
            <p className="text-xs font-semibold text-inkSoft uppercase tracking-wide mb-2">
              Ítems
            </p>
            <div className="grid grid-cols-12 gap-2 text-xs text-inkSoft mb-1 px-1">
              <span className="col-span-6">Descripción</span>
              <span className="col-span-2 text-right">Cantidad</span>
              <span className="col-span-2 text-right">Precio unit.</span>
              <span className="col-span-2 text-right">Total</span>
            </div>
            <div className="space-y-2">
              {items.map((it, i) => {
                const totalLinea =
                  (parseFloat(it.cantidad) || 0) * (parseFloat(it.precio_unitario) || 0);
                return (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <input
                      value={it.descripcion}
                      onChange={(e) => actualizarItem(i, "descripcion", e.target.value)}
                      placeholder="Descripción del producto o servicio"
                      className="col-span-6 border border-paperLine rounded-sm px-2 py-2 text-sm"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={it.cantidad}
                      onChange={(e) => actualizarItem(i, "cantidad", e.target.value)}
                      className="col-span-2 border border-paperLine rounded-sm px-2 py-2 text-sm text-right font-num"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={it.precio_unitario}
                      onChange={(e) => actualizarItem(i, "precio_unitario", e.target.value)}
                      placeholder="0.00"
                      className="col-span-2 border border-paperLine rounded-sm px-2 py-2 text-sm text-right font-num"
                    />
                    <div className="col-span-2 flex items-center justify-between">
                      <span className="text-sm font-num tabular">{totalLinea.toFixed(2)}</span>
                      <button
                        type="button"
                        onClick={() => quitarItem(i)}
                        disabled={items.length <= 1}
                        className="text-xs text-rust hover:underline disabled:opacity-30 ml-2"
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={agregarItem}
              className="text-xs text-brassDark hover:underline mt-2"
            >
              + Agregar ítem
            </button>
          </div>

          <div className="flex justify-end">
            <div className="w-full sm:w-64 text-sm space-y-1 font-num tabular">
              <div className="flex justify-between"><span className="font-body">Subtotal</span><span>{subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="font-body">IVA (13%)</span><span>{iva.toFixed(2)}</span></div>
              <div className="flex justify-between font-semibold border-t border-paperLine pt-1"><span className="font-body">Total</span><span>{total.toFixed(2)}</span></div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-inkSoft uppercase tracking-wide mb-2">
              Cuentas contables para el asiento automático
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-inkSoft mb-1">Cobro (Debe)</label>
                <select value={cuentaCobro} onChange={(e) => setCuentaCobro(e.target.value)} className="w-full border border-paperLine rounded-sm px-2 py-2 text-sm">
                  <option value="">Efectivo / Cliente…</option>
                  {cuentasActivo.map((c) => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-inkSoft mb-1">Ingreso (Haber)</label>
                <select value={cuentaIngreso} onChange={(e) => setCuentaIngreso(e.target.value)} className="w-full border border-paperLine rounded-sm px-2 py-2 text-sm">
                  <option value="">Ventas / Servicios…</option>
                  {cuentasIngreso.map((c) => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-inkSoft mb-1">IVA Débito Fiscal (Haber)</label>
                <select value={cuentaIva} onChange={(e) => setCuentaIva(e.target.value)} className="w-full border border-paperLine rounded-sm px-2 py-2 text-sm">
                  <option value="">IVA por pagar…</option>
                  {cuentasPasivo.map((c) => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
                </select>
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-rust">{error}</p>}
          {aviso && <p className="text-sm text-brassDark">{aviso}</p>}

          <button
            type="submit"
            disabled={guardando}
            className="bg-ink text-paper px-4 py-2 rounded-sm text-sm font-medium hover:bg-[#2C3A52] disabled:opacity-60"
          >
            {guardando ? "Generando…" : "Generar documento y asiento contable"}
          </button>
        </form>
      </section>

      <section>
        <h2 className="font-display text-base font-semibold mb-4">Documentos emitidos</h2>
        {documentos.length === 0 ? (
          <p className="text-inkSoft text-sm">Aún no se ha emitido ningún documento.</p>
        ) : (
          <div className="bg-[#F7F4EA] border border-paperLine rounded-sm overflow-hidden">
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
                      <td className="px-4 py-2 text-right font-num tabular">{Number(d.total).toFixed(2)}</td>
                      <td className="px-4 py-2">
                        <span className="text-xs px-2 py-1 rounded-sm bg-brass/20 text-brassDark">
                          {d.estado === "generado" ? "Generado (sin firmar)" : d.estado}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => setVerJsonId(verJsonId === d.id ? null : d.id)}
                          className="text-xs text-brassDark hover:underline"
                        >
                          {verJsonId === d.id ? "Ocultar JSON" : "Ver JSON"}
                        </button>
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
