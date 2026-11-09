// Devoluciones sobre ventas y compras (notas de crédito).
// - Venta: el cliente devuelve mercadería o se le da un ajuste. Reversa ingreso, IVA y (si hay mercadería) costo de ventas;
//   los productos reingresan al kardex al costo con el que salieron en esa venta.
// - Compra: devolución al proveedor (nota de crédito del proveedor). Reversa compra e IVA crédito; los productos salen
//   del kardex al costo de la compra original.
// En ambos casos la partida es propia (siempre se contabiliza en el Diario) y la devolución queda ligada al documento original.
import { supabase } from "@/lib/supabaseClient";
import { siguienteNumeroPartida } from "@/lib/partidas";
import { obtenerKardex, ordenarKardex, recalcularSecuencia, obtenerMetodoCosteo, validarCostoDocumentos, sincronizarKardex } from "@/lib/kardex";
import { r2 } from "@/lib/ventasCompras";

export function configDev(tipo) {
  return tipo === "venta"
    ? { tipo, tabla: "ventas", lineas: "venta_lineas", campoDoc: "venta_id", entidad: "cliente_id", tablaEntidad: "clientes", facturas: "facturas_cxc", cuentaControl: "cuenta_cxc_id", labelEntidad: "Cliente", labelDoc: "venta", movKardex: "entrada" }
    : { tipo, tabla: "compras", lineas: "compra_lineas", campoDoc: "compra_id", entidad: "proveedor_id", tablaEntidad: "proveedores", facturas: "facturas_cxp", cuentaControl: "cuenta_cxp_id", labelEntidad: "Proveedor", labelDoc: "compra", movKardex: "salida" };
}

// Documentos entre los que se elige el original (los más recientes primero)
export async function obtenerDocumentosOrigen(tipo, empresaId, { soloCcfElectronico = false } = {}) {
  const cfg = configDev(tipo);
  let q = supabase
    .from(cfg.tabla)
    .select(`id, fecha, tipo_documento, numero_documento, codigo_generacion, subtotal, iva, total, condicion, entidad:${cfg.entidad} ( nombre )`)
    .eq("empresa_id", empresaId)
    .order("fecha", { ascending: false })
    .limit(300);
  if (soloCcfElectronico) q = q.eq("tipo_documento", "ccf").not("codigo_generacion", "is", null);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// Documento original con sus líneas y lo que ya se devolvió de cada una
export async function cargarOrigen(tipo, docId) {
  const cfg = configDev(tipo);
  const { data: doc, error } = await supabase
    .from(cfg.tabla)
    .select(`*, entidad:${cfg.entidad} ( id, nombre, nit_dui, nrc, tipo_documento )`)
    .eq("id", docId)
    .single();
  if (error) throw error;
  const { data: lineas } = await supabase.from(cfg.lineas).select("*").eq(cfg.campoDoc, docId).order("created_at");
  const { data: devs } = await supabase.from("devoluciones").select("id").eq(cfg.campoDoc, docId);
  const devueltoPorLinea = {};
  if ((devs || []).length) {
    const { data: dl } = await supabase.from("devolucion_lineas").select("linea_origen_id, cantidad").in("devolucion_id", devs.map((d) => d.id));
    for (const x of dl || []) if (x.linea_origen_id) devueltoPorLinea[x.linea_origen_id] = r2((devueltoPorLinea[x.linea_origen_id] || 0) + Number(x.cantidad));
  }
  return {
    doc,
    lineas: (lineas || []).map((l) => {
      const devuelto = devueltoPorLinea[l.id] || 0;
      return { ...l, devuelto, disponible: Math.max(0, r2(Number(l.cantidad) - devuelto)) };
    }),
  };
}

// items: [{ linea, cantidad }]  (parte de una línea del original)  o  [{ ajuste: true, descripcion, cuenta_id, monto }]
export function calcularDevolucion(tipo, doc, items) {
  const ratioIva = Number(doc.subtotal) > 0 ? Number(doc.iva) / Number(doc.subtotal) : 0;
  const detalle = [];
  for (const it of items) {
    if (it.ajuste) {
      const neto = r2(Number(it.monto) || 0);
      if (neto <= 0) continue;
      detalle.push({ ajuste: true, linea_origen_id: null, producto_id: null, cuenta_id: it.cuenta_id, descripcion: (it.descripcion || "Ajuste / descuento").trim(), cantidad: 1, precio: neto, neto, costo: 0 });
      continue;
    }
    const l = it.linea;
    const cantidad = Number(it.cantidad) || 0;
    if (cantidad <= 0) continue;
    const neto = r2(Number(l.subtotal) * (cantidad / Number(l.cantidad)));
    const costoUnit = tipo === "venta" ? Number(l.costo_total || 0) / Number(l.cantidad) : Number(l.subtotal) / Number(l.cantidad);
    detalle.push({
      ajuste: false, linea_origen_id: l.id, producto_id: l.producto_id || null, cuenta_id: l.cuenta_id,
      descripcion: l.descripcion || "", cantidad, precio: Number(l.precio_unitario), neto,
      costoUnit, costo: l.producto_id ? r2(costoUnit * cantidad) : 0, disponible: l.disponible,
    });
  }
  const subtotal = r2(detalle.reduce((t, d) => t + d.neto, 0));
  const iva = r2(subtotal * ratioIva);
  return { detalle, subtotal, iva, total: r2(subtotal + iva), costoTotal: r2(detalle.reduce((t, d) => t + d.costo, 0)) };
}

function cuentaIvaOrigen(tipo, empresa, doc) {
  if (doc.cuenta_iva_id) return doc.cuenta_iva_id;
  if (tipo === "venta") return doc.tipo_documento === "ccf" ? empresa?.cuenta_iva_debito_ccf_id : empresa?.cuenta_iva_debito_cf_id;
  return empresa?.cuenta_iva_credito_id;
}

// datos: { fecha, numero, motivo, liquidacion: 'cuenta'|'efectivo', cuentaDinero, codigoGeneracion, jsonDte }
export async function registrarDevolucion({ tipo, empresa, empresaId, doc, items, productos, datos }) {
  const cfg = configDev(tipo);
  const productosPorId = Object.fromEntries((productos || []).map((p) => [p.id, p]));
  const calculo = calcularDevolucion(tipo, doc, items);
  if (!datos.fecha) return { error: "Indica la fecha." };
  if (calculo.detalle.length === 0 || calculo.total <= 0) return { error: "Indica qué se devuelve (cantidades o un ajuste con monto)." };
  for (const d of calculo.detalle) {
    if (!d.ajuste && d.cantidad > d.disponible + 0.0001) return { error: `«${d.descripcion}»: solo quedan ${d.disponible} por devolver de ese documento.` };
    if (!d.cuenta_id) return { error: `«${d.descripcion}» no tiene cuenta contable.` };
    if (d.producto_id && !productosPorId[d.producto_id]) return { error: `No se encontró el producto de «${d.descripcion}».` };
  }
  if (calculo.total > Number(doc.total) + 0.005) return { error: "La devolución no puede superar el total del documento original." };

  // Liquidación: rebajar la cuenta por cobrar/pagar del documento o devolver/recibir el dinero
  let factura = null;
  if (datos.liquidacion === "cuenta") {
    const { data } = await supabase.from(cfg.facturas).select("id, monto, saldo_pendiente").eq(cfg.campoDoc, doc.id).maybeSingle();
    factura = data;
    if (!factura) return { error: `Este documento no está al crédito en ${tipo === "venta" ? "Cuentas por Cobrar" : "Cuentas por Pagar"}: elige «${tipo === "venta" ? "Devolver el dinero" : "Recibir el dinero"}».` };
    if (calculo.total > Number(factura.saldo_pendiente) + 0.005) return { error: `La devolución (${calculo.total.toFixed(2)}) supera el saldo pendiente de la factura (${Number(factura.saldo_pendiente).toFixed(2)}). Elige devolver/recibir el dinero.` };
  } else if (!datos.cuentaDinero) {
    return { error: tipo === "venta" ? "Elige de qué cuenta sale el dinero devuelto." : "Elige en qué cuenta se recibe el dinero." };
  }

  // Kardex: solo las líneas con producto
  const metodo = await obtenerMetodoCosteo(empresaId);
  const base = Date.now();
  let seq = 0;
  const porProducto = {};
  calculo.detalle.forEach((d, idx) => {
    if (d.producto_id) (porProducto[d.producto_id] ||= []).push(idx);
  });
  const filasKardex = [];
  const planes = [];
  for (const [productoId, indices] of Object.entries(porProducto)) {
    const existentes = await obtenerKardex(productoId);
    const candidatos = indices.map((idx) => ({
      id: `NUEVO-${idx}`, _idx: idx, tipo: cfg.movKardex, fecha: datos.fecha, cantidad: calculo.detalle[idx].cantidad,
      costo_unitario: Math.round(calculo.detalle[idx].costoUnit * 10000) / 10000, costo_fijo: true,
      created_at: new Date(base + seq++).toISOString(),
    }));
    const lista = [...existentes, ...candidatos].sort(ordenarKardex);
    const { error, resultado } = recalcularSecuencia(lista, metodo);
    const nombre = productosPorId[productoId]?.nombre || "Producto";
    if (error) return { error: `${nombre}: ${error}` };
    const errorDoc = validarCostoDocumentos(resultado, existentes);
    if (errorDoc) return { error: `${nombre}: ${errorDoc}` };
    for (const r of resultado) {
      if (r._idx === undefined) continue;
      filasKardex.push({
        producto_id: productoId, fecha: datos.fecha, tipo: cfg.movKardex, cantidad: r.cantidad,
        costo_unitario: r.costo_unitario, costo_total: r2(r.costo_total), costo_fijo: true,
        saldo_cantidad: r.saldo_cantidad, saldo_costo_unitario: r.saldo_costo_unitario, saldo_costo_total: r2(r.saldo_costo_total),
        created_at: r.created_at,
      });
    }
    planes.push({ existentes, resultado: resultado.filter((r) => r._idx === undefined) });
  }

  // Partida
  const debe = new Map();
  const haber = new Map();
  const sumar = (m, cuenta, monto) => { if (cuenta && monto) m.set(cuenta, r2((m.get(cuenta) || 0) + monto)); };
  const errores = [];
  const cuentaIva = cuentaIvaOrigen(tipo, empresa, doc);
  if (calculo.iva > 0 && !cuentaIva) errores.push("Configura la cuenta de IVA (en Configuración de cuentas).");
  const cuentaContra = datos.liquidacion === "cuenta" ? empresa?.[cfg.cuentaControl] : datos.cuentaDinero;
  if (!cuentaContra) errores.push(`Configura la cuenta de ${tipo === "venta" ? "Cuentas por Cobrar" : "Cuentas por Pagar"} (en Configuración de cuentas).`);
  if (tipo === "venta") {
    calculo.detalle.forEach((d) => sumar(debe, d.cuenta_id, d.neto));
    sumar(debe, cuentaIva, calculo.iva);
    sumar(haber, cuentaContra, calculo.total);
    calculo.detalle.forEach((d) => {
      if (!d.producto_id) return;
      const p = productosPorId[d.producto_id];
      if (!p?.cuenta_inventario_id || !p?.cuenta_costo_venta_id) errores.push(`El producto «${p?.nombre}» no tiene cuentas de inventario y costo de ventas.`);
      sumar(debe, p?.cuenta_inventario_id, d.costo);
      sumar(haber, p?.cuenta_costo_venta_id, d.costo);
    });
  } else {
    sumar(debe, cuentaContra, calculo.total);
    calculo.detalle.forEach((d) => sumar(haber, d.cuenta_id, d.neto));
    sumar(haber, cuentaIva, calculo.iva);
  }
  if (errores.length) return { error: errores[0] };
  const lineasPartida = [
    ...[...debe.entries()].map(([cuenta_id, monto]) => ({ cuenta_id, debe: monto, haber: 0 })),
    ...[...haber.entries()].map(([cuenta_id, monto]) => ({ cuenta_id, debe: 0, haber: monto })),
  ];
  const td = r2(lineasPartida.reduce((s, l) => s + l.debe, 0));
  const th = r2(lineasPartida.reduce((s, l) => s + l.haber, 0));
  if (Math.abs(td - th) > 0.005) return { error: "La partida no cuadra (Debe ≠ Haber). Revisa los importes." };

  const etiquetaDoc = doc.numero_documento || doc.fecha;
  const glosa = `Devolución sobre ${cfg.labelDoc} ${etiquetaDoc}${doc.entidad?.nombre ? " — " + doc.entidad.nombre : ""}${datos.motivo ? " (" + datos.motivo.trim() + ")" : ""}`;

  const numeroPartida = await siguienteNumeroPartida(empresaId, "diario");
  const { data: tx, error: errTx } = await supabase
    .from("transacciones")
    .insert({ empresa_id: empresaId, fecha: datos.fecha, descripcion: glosa, numero_partida: numeroPartida, tipo: "diario" })
    .select()
    .single();
  if (errTx) return { error: "No se pudo registrar la partida: " + errTx.message };

  let devId = null;
  let facturaTocada = false;
  try {
    const { error: errMov } = await supabase.from("movimientos").insert(lineasPartida.map((l) => ({ ...l, transaccion_id: tx.id })));
    if (errMov) throw new Error("Fallaron las líneas de la partida: " + errMov.message);

    const { data: dev, error: errDev } = await supabase
      .from("devoluciones")
      .insert({
        empresa_id: empresaId, tipo, fecha: datos.fecha,
        [cfg.campoDoc]: doc.id, [cfg.entidad]: doc[cfg.entidad] || null,
        numero_documento: datos.numero?.trim() || null, codigo_generacion: datos.codigoGeneracion || null,
        motivo: datos.motivo?.trim() || null, liquidacion: datos.liquidacion,
        cuenta_dinero_id: datos.liquidacion === "efectivo" ? datos.cuentaDinero : null,
        factura_id: factura?.id || null, monto_factura: factura ? calculo.total : 0,
        subtotal: calculo.subtotal, iva: calculo.iva, total: calculo.total, costo_total: calculo.costoTotal,
        transaccion_id: tx.id, json_dte: datos.jsonDte || null,
      })
      .select()
      .single();
    if (errDev) throw new Error("No se pudo guardar la devolución: " + errDev.message);
    devId = dev.id;

    const { error: errL } = await supabase.from("devolucion_lineas").insert(
      calculo.detalle.map((d, i) => ({
        devolucion_id: dev.id, linea_origen_id: d.linea_origen_id, producto_id: d.producto_id, cuenta_id: d.cuenta_id,
        descripcion: d.descripcion, cantidad: d.cantidad, precio_unitario: d.precio, subtotal: d.neto, costo_total: d.costo,
        created_at: new Date(base + i).toISOString(),
      }))
    );
    if (errL) throw new Error("No se pudieron guardar las líneas: " + errL.message);

    if (filasKardex.length) {
      const glosaK = glosa.length > 200 ? glosa.slice(0, 200) : glosa;
      const { error: errK } = await supabase.from("kardex_movimientos").insert(filasKardex.map((f) => ({ ...f, descripcion: glosaK, devolucion_id: dev.id })));
      if (errK) throw new Error("No se pudo registrar en el kardex: " + errK.message);
    }
    for (const plan of planes) await sincronizarKardex(plan.resultado, plan.existentes);

    if (factura) {
      const { error: errF } = await supabase.from(cfg.facturas).update({ saldo_pendiente: r2(Number(factura.saldo_pendiente) - calculo.total) }).eq("id", factura.id);
      if (errF) throw new Error("No se pudo rebajar la cuenta por " + (tipo === "venta" ? "cobrar" : "pagar") + ": " + errF.message);
      facturaTocada = true;
    }
  } catch (e) {
    if (facturaTocada && factura) await supabase.from(cfg.facturas).update({ saldo_pendiente: factura.saldo_pendiente }).eq("id", factura.id);
    if (devId) await supabase.from("devoluciones").delete().eq("id", devId);
    await supabase.from("transacciones").delete().eq("id", tx.id);
    return { error: e.message };
  }
  return { ok: true, devolucionId: devId, numeroPartida, calculo, transaccionId: tx.id };
}

export async function obtenerDevoluciones(empresaId) {
  const { data, error } = await supabase
    .from("devoluciones")
    .select("*, cliente:cliente_id ( nombre ), proveedor:proveedor_id ( nombre ), venta:venta_id ( numero_documento ), compra:compra_id ( numero_documento )")
    .eq("empresa_id", empresaId)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

// Elimina la devolución: revierte su partida, sus renglones del kardex y lo rebajado en Cuentas por Cobrar/Pagar.
export async function eliminarDevolucion(dev) {
  const cfg = configDev(dev.tipo);
  if (dev.transaccion_id) {
    const { data: tx } = await supabase.from("transacciones").select("agrupada").eq("id", dev.transaccion_id).maybeSingle();
    if (tx?.agrupada) return { error: "La partida de esta devolución está agrupada; elimínala desde el Libro diario." };
  }
  const { data: filas } = await supabase.from("kardex_movimientos").select("producto_id").eq("devolucion_id", dev.id);
  const productoIds = [...new Set((filas || []).map((f) => f.producto_id))];
  const metodo = await obtenerMetodoCosteo(dev.empresa_id);
  const planes = [];
  for (const productoId of productoIds) {
    const existentes = await obtenerKardex(productoId);
    const lista = existentes.filter((m) => m.devolucion_id !== dev.id);
    const { error, resultado } = recalcularSecuencia(lista, metodo);
    if (error) return { error };
    const errorDoc = validarCostoDocumentos(resultado, existentes);
    if (errorDoc) return { error: errorDoc };
    planes.push({ existentes, resultado });
  }
  if (dev.factura_id) {
    const { data: f } = await supabase.from(cfg.facturas).select("saldo_pendiente").eq("id", dev.factura_id).maybeSingle();
    if (f) await supabase.from(cfg.facturas).update({ saldo_pendiente: r2(Number(f.saldo_pendiente) + Number(dev.monto_factura)) }).eq("id", dev.factura_id);
  }
  if (dev.transaccion_id) await supabase.from("transacciones").delete().eq("id", dev.transaccion_id);
  const { error } = await supabase.from("devoluciones").delete().eq("id", dev.id);
  if (error) return { error: "No se pudo eliminar: " + error.message };
  for (const plan of planes) await sincronizarKardex(plan.resultado, plan.existentes);
  return { ok: true };
}
