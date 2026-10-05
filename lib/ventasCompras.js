import { supabase } from "@/lib/supabaseClient";
import {
  obtenerKardex,
  ordenarKardex,
  recalcularSecuencia,
  validarCostoDocumentos,
  sincronizarKardex,
} from "@/lib/kardex";

export const TASA_IVA = 0.13;

export function r2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
function r4(n) {
  return Math.round((Number(n) + Number.EPSILON) * 10000) / 10000;
}

export const TIPOS_DOCUMENTO = [
  { valor: "ccf", etiqueta: "Comprobante de Crédito Fiscal (CCF)", corto: "CCF" },
  { valor: "factura", etiqueta: "Factura (consumidor final)", corto: "Factura" },
  { valor: "sin_iva", etiqueta: "Sin IVA (exento)", corto: "Sin IVA" },
];

export function etiquetaCorta(tipoDocumento) {
  return TIPOS_DOCUMENTO.find((t) => t.valor === tipoDocumento)?.corto || tipoDocumento;
}

// Ventas y Compras funcionan igual; solo cambian tablas y dirección contable.
export function configVC(tipo) {
  if (tipo === "venta") {
    return {
      tipo,
      tabla: "ventas",
      tablaLineas: "venta_lineas",
      campoDocId: "venta_id",
      tablaEntidad: "clientes",
      campoEntidadId: "cliente_id",
      tablaFacturas: "facturas_cxc",
      campoCuentaControl: "cuenta_cxc_id",
      campoCuentaDinero: "cuenta_cobro_id",
      movKardex: "salida",
      labelModulo: "Ventas",
      labelDoc: "venta",
      labelEntidad: "Cliente",
      labelEntidadPlural: "clientes",
      labelDinero: "¿Dónde se recibió el dinero?",
      labelControl: "Cuentas por Cobrar",
    };
  }
  return {
    tipo,
    tabla: "compras",
    tablaLineas: "compra_lineas",
    campoDocId: "compra_id",
    tablaEntidad: "proveedores",
    campoEntidadId: "proveedor_id",
    tablaFacturas: "facturas_cxp",
    campoCuentaControl: "cuenta_cxp_id",
    campoCuentaDinero: "cuenta_pago_id",
    movKardex: "entrada",
    labelModulo: "Compras",
    labelDoc: "compra",
    labelEntidad: "Proveedor",
    labelEntidadPlural: "proveedores",
    labelDinero: "¿Con qué se pagó?",
    labelControl: "Cuentas por Pagar",
  };
}

// Calcula importes e IVA según el tipo de documento (reglas de El Salvador):
// - CCF: el precio se ingresa sin IVA y el 13% se suma aparte.
// - Factura: el precio ya incluye IVA. En ventas se separa el débito fiscal
//   (total ÷ 1.13); en compras no hay crédito fiscal y el IVA queda en el costo.
// - Sin IVA: operación exenta.
export function calcularDocumento(cfg, tipoDocumento, lineas) {
  const detalle = lineas.map((l) => {
    const cantidad = Number(l.cantidad) || 0;
    const precio = Number(l.precio) || 0;
    const bruto = r2(cantidad * precio);
    const neto =
      tipoDocumento === "factura" && cfg.tipo === "venta" ? r2(bruto / (1 + TASA_IVA)) : bruto;
    return { ...l, cantidad, precio, bruto, neto };
  });
  const sumaBruto = r2(detalle.reduce((s, l) => s + l.bruto, 0));
  const sumaNeto = r2(detalle.reduce((s, l) => s + l.neto, 0));

  let iva = 0;
  let total = sumaNeto;
  let ivaIncluidoEnCosto = 0;
  if (tipoDocumento === "ccf") {
    iva = r2(sumaNeto * TASA_IVA);
    total = r2(sumaNeto + iva);
  } else if (tipoDocumento === "factura") {
    total = sumaBruto;
    if (cfg.tipo === "venta") iva = r2(sumaBruto - sumaNeto);
    else ivaIncluidoEnCosto = r2(sumaBruto - sumaBruto / (1 + TASA_IVA));
  }
  return { detalle, subtotal: sumaNeto, iva, total, ivaIncluidoEnCosto };
}

// Simula en el kardex las salidas (ventas) o entradas (compras) del documento
// para obtener su costo al promedio ponderado y validar existencias.
// kardexPorProducto: { productoId: [movimientos existentes] }
export function simularKardex(cfg, fecha, detalle, kardexPorProducto, productosPorId) {
  const indicesPorProducto = {};
  detalle.forEach((l, idx) => {
    if (l.clase !== "producto" || !l.producto_id || !(l.cantidad > 0)) return;
    (indicesPorProducto[l.producto_id] ||= []).push(idx);
  });

  const base = Date.now();
  let secuencia = 0;
  const costos = {};
  const planes = [];

  for (const [productoId, indices] of Object.entries(indicesPorProducto)) {
    const existentes = kardexPorProducto[productoId];
    if (!existentes) return { pendiente: true };
    const nombre = productosPorId[productoId]?.nombre || "Producto";

    const candidatos = indices.map((idx) => {
      const l = detalle[idx];
      return {
        id: `NUEVO-${idx}`,
        _idx: idx,
        tipo: cfg.movKardex,
        fecha,
        cantidad: l.cantidad,
        costo_unitario: cfg.movKardex === "entrada" ? r4(l.neto / l.cantidad) : 0,
        created_at: new Date(base + secuencia++).toISOString(),
      };
    });

    const lista = [...existentes, ...candidatos].sort(ordenarKardex);
    const { error, resultado } = recalcularSecuencia(lista);
    if (error) return { error: `${nombre}: ${error}` };
    const errorDoc = validarCostoDocumentos(resultado, existentes);
    if (errorDoc) return { error: `${nombre}: ${errorDoc}` };

    for (const r of resultado) {
      if (r._idx === undefined) continue;
      costos[r._idx] = {
        productoId,
        created_at: r.created_at,
        costo_unitario: r.costo_unitario,
        costo_total: r2(r.costo_total),
        saldo_cantidad: r.saldo_cantidad,
        saldo_costo_unitario: r.saldo_costo_unitario,
        saldo_costo_total: r2(r.saldo_costo_total),
      };
    }
    planes.push({
      existentes,
      resultado: resultado.filter((r) => r._idx === undefined),
    });
  }
  return { costos, planes };
}

// Cuenta a la que va cada línea: en ventas, el ingreso; en compras, el
// inventario del producto o la cuenta de gasto/activo elegida.
export function cuentaDeLinea(cfg, empresa, linea, productosPorId) {
  if (linea.clase === "producto") {
    if (cfg.tipo === "venta") return empresa?.cuenta_ventas_id || "";
    return productosPorId[linea.producto_id]?.cuenta_inventario_id || "";
  }
  return linea.cuenta_id || "";
}

// Arma las líneas de la partida (agrupadas por cuenta) y la lista de
// problemas que impiden registrarla.
export function construirPartida(cfg, empresa, form, calculo, costos, productosPorId) {
  const errores = [];
  const debe = new Map();
  const haber = new Map();
  const sumar = (mapa, cuenta, monto) => {
    if (!cuenta || !monto) return;
    mapa.set(cuenta, r2((mapa.get(cuenta) || 0) + monto));
  };

  const cuentaDinero =
    form.condicion === "credito" ? empresa?.[cfg.campoCuentaControl] : form.cuentaDinero;
  if (!cuentaDinero) {
    errores.push(
      form.condicion === "credito"
        ? `Configura la cuenta de ${cfg.labelControl} (en Configuración de cuentas).`
        : `Selecciona ${cfg.tipo === "venta" ? "dónde se recibió el dinero" : "con qué se pagó"}.`
    );
  }

  const cuentaIva =
    cfg.tipo === "venta"
      ? form.tipoDocumento === "ccf"
        ? empresa?.cuenta_iva_debito_ccf_id
        : empresa?.cuenta_iva_debito_cf_id
      : empresa?.cuenta_iva_credito_id;
  if (calculo.iva > 0 && !cuentaIva) {
    errores.push("Configura la cuenta de IVA (en Configuración de cuentas).");
  }

  calculo.detalle.forEach((l) => {
    const cuenta = cuentaDeLinea(cfg, empresa, l, productosPorId);
    if (!cuenta) {
      errores.push(
        l.clase === "producto" && cfg.tipo === "venta"
          ? "Configura la cuenta de ingresos por ventas (en Configuración de cuentas)."
          : "Cada concepto necesita su cuenta contable."
      );
    }
    sumar(cfg.tipo === "venta" ? haber : debe, cuenta, l.neto);
  });

  if (cfg.tipo === "venta") {
    sumar(debe, cuentaDinero, calculo.total);
    sumar(haber, cuentaIva, calculo.iva);
    calculo.detalle.forEach((l, idx) => {
      const c = costos?.[idx];
      if (!c || l.clase !== "producto") return;
      const p = productosPorId[l.producto_id];
      sumar(debe, p?.cuenta_costo_venta_id, c.costo_total);
      sumar(haber, p?.cuenta_inventario_id, c.costo_total);
    });
  } else {
    sumar(debe, cuentaIva, calculo.iva);
    sumar(haber, cuentaDinero, calculo.total);
  }

  const lineas = [
    ...[...debe.entries()].map(([cuenta_id, monto]) => ({ cuenta_id, debe: monto, haber: 0 })),
    ...[...haber.entries()].map(([cuenta_id, monto]) => ({ cuenta_id, debe: 0, haber: monto })),
  ];
  const totalDebe = r2(lineas.reduce((s, l) => s + l.debe, 0));
  const totalHaber = r2(lineas.reduce((s, l) => s + l.haber, 0));
  return { lineas, errores: [...new Set(errores)], totalDebe, totalHaber };
}

export function validarFormulario(cfg, form) {
  if (!form.fecha) return "Indica la fecha.";
  if (form.lineas.length === 0) return "Agrega al menos una línea.";
  for (const [i, l] of form.lineas.entries()) {
    const n = i + 1;
    if (l.clase === "producto" && !l.producto_id) return `Línea ${n}: selecciona el producto.`;
    if (l.clase === "concepto" && !l.cuenta_id) return `Línea ${n}: selecciona la cuenta contable.`;
    if (l.clase === "concepto" && !l.descripcion.trim()) return `Línea ${n}: escribe la descripción.`;
    if (!(Number(l.cantidad) > 0)) return `Línea ${n}: la cantidad debe ser mayor que cero.`;
    if (!(Number(l.precio) > 0)) return `Línea ${n}: el precio debe ser mayor que cero.`;
  }
  if (form.tipoDocumento === "ccf" && !form.entidadId) {
    return `El Crédito Fiscal requiere indicar el ${cfg.labelEntidad.toLowerCase()}.`;
  }
  if (form.condicion === "credito" && !form.entidadId) {
    return `Para una ${cfg.labelDoc} al crédito indica el ${cfg.labelEntidad.toLowerCase()}.`;
  }
  return null;
}

export function glosaDocumento(cfg, form, entidadNombre) {
  const condicion = form.condicion === "credito" ? "al crédito" : "al contado";
  let g = `${cfg.tipo === "venta" ? "Venta" : "Compra"} ${condicion} — ${etiquetaCorta(form.tipoDocumento)}`;
  if (form.numero.trim()) g += ` N° ${form.numero.trim()}`;
  if (entidadNombre) g += ` — ${entidadNombre}`;
  if (form.descripcion.trim()) g += `: ${form.descripcion.trim()}`;
  return g;
}

export async function siguienteNumeroPartida(empresaId) {
  const { data } = await supabase
    .from("transacciones")
    .select("numero_partida")
    .eq("empresa_id", empresaId)
    .order("numero_partida", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.numero_partida || 0) + 1;
}

export async function obtenerDocumentos(cfg, empresaId) {
  const { data, error } = await supabase
    .from(cfg.tabla)
    .select(`*, entidad:${cfg.campoEntidadId} ( nombre ), partida:transaccion_id ( numero_partida )`)
    .eq("empresa_id", empresaId)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;

  const { data: facturas } = await supabase
    .from(cfg.tablaFacturas)
    .select(`id, monto, saldo_pendiente, ${cfg.campoDocId}`)
    .eq("empresa_id", empresaId)
    .not(cfg.campoDocId, "is", null);
  const facturaPorDoc = Object.fromEntries((facturas || []).map((f) => [f[cfg.campoDocId], f]));
  return (data || []).map((d) => ({ ...d, factura: facturaPorDoc[d.id] || null }));
}

export async function obtenerLineas(cfg, docId) {
  const { data, error } = await supabase
    .from(cfg.tablaLineas)
    .select("*, producto:producto_id ( nombre ), cuenta:cuenta_id ( codigo, nombre )")
    .eq(cfg.campoDocId, docId)
    .order("created_at");
  if (error) throw error;
  return data || [];
}

// Registra el documento completo: partida en el Diario, documento y líneas,
// renglones del kardex y, si es al crédito, la factura en CxC / CxP.
export async function registrarDocumento(cfg, { empresa, empresaId, form, productos, entidades }) {
  const errorForm = validarFormulario(cfg, form);
  if (errorForm) return { error: errorForm };

  const productosPorId = Object.fromEntries(productos.map((p) => [p.id, p]));
  const calculo = calcularDocumento(cfg, form.tipoDocumento, form.lineas);

  // Kardex actualizado desde la base de datos (no la copia en pantalla)
  const kardex = {};
  for (const l of calculo.detalle) {
    if (l.clase === "producto" && l.producto_id && !kardex[l.producto_id]) {
      kardex[l.producto_id] = await obtenerKardex(l.producto_id);
    }
  }
  const sim = simularKardex(cfg, form.fecha, calculo.detalle, kardex, productosPorId);
  if (sim.error) return { error: sim.error };

  const partida = construirPartida(cfg, empresa, form, calculo, sim.costos, productosPorId);
  if (partida.errores.length) return { error: partida.errores[0] };
  if (Math.abs(partida.totalDebe - partida.totalHaber) > 0.005) {
    return { error: "La partida no cuadra (Debe ≠ Haber). Revisa los importes." };
  }

  const entidadNombre = entidades.find((e) => e.id === form.entidadId)?.nombre || "";
  const glosa = glosaDocumento(cfg, form, entidadNombre);
  const numeroPartida = await siguienteNumeroPartida(empresaId);

  const { data: tx, error: errTx } = await supabase
    .from("transacciones")
    .insert({
      empresa_id: empresaId,
      fecha: form.fecha,
      descripcion: glosa,
      numero_partida: numeroPartida,
    })
    .select()
    .single();
  if (errTx) return { error: "No se pudo registrar la partida: " + errTx.message };

  let docId = null;
  try {
    const { error: errMov } = await supabase
      .from("movimientos")
      .insert(partida.lineas.map((l) => ({ ...l, transaccion_id: tx.id })));
    if (errMov) throw new Error("Fallaron las líneas de la partida: " + errMov.message);

    const costoVenta = r2(
      Object.values(sim.costos).reduce((s, c) => s + (cfg.tipo === "venta" ? c.costo_total : 0), 0)
    );
    const encabezado = {
      empresa_id: empresaId,
      [cfg.campoEntidadId]: form.entidadId || null,
      fecha: form.fecha,
      tipo_documento: form.tipoDocumento,
      numero_documento: form.numero.trim() || null,
      condicion: form.condicion,
      fecha_vencimiento: form.condicion === "credito" ? form.fechaVencimiento || null : null,
      [cfg.campoCuentaDinero]: form.condicion === "contado" ? form.cuentaDinero : null,
      descripcion: form.descripcion.trim() || null,
      subtotal: calculo.subtotal,
      iva: calculo.iva,
      total: calculo.total,
      transaccion_id: tx.id,
    };
    if (cfg.tipo === "venta") encabezado.costo_total = costoVenta;

    const { data: doc, error: errDoc } = await supabase
      .from(cfg.tabla)
      .insert(encabezado)
      .select()
      .single();
    if (errDoc) throw new Error(`No se pudo guardar la ${cfg.labelDoc}: ` + errDoc.message);
    docId = doc.id;

    const base = Date.now();
    const filasLineas = calculo.detalle.map((l, idx) => {
      const fila = {
        [cfg.campoDocId]: doc.id,
        producto_id: l.clase === "producto" ? l.producto_id : null,
        cuenta_id: cuentaDeLinea(cfg, empresa, l, productosPorId),
        descripcion:
          l.clase === "producto"
            ? productosPorId[l.producto_id]?.nombre || null
            : l.descripcion.trim(),
        cantidad: l.cantidad,
        precio_unitario: l.precio,
        subtotal: l.neto,
        created_at: new Date(base + idx).toISOString(),
      };
      if (cfg.tipo === "venta") fila.costo_total = sim.costos[idx]?.costo_total || 0;
      return fila;
    });
    const { error: errLineas } = await supabase.from(cfg.tablaLineas).insert(filasLineas);
    if (errLineas) throw new Error("No se pudieron guardar las líneas: " + errLineas.message);

    const filasKardex = Object.entries(sim.costos).map(([idx, c]) => ({
      producto_id: c.productoId,
      fecha: form.fecha,
      tipo: cfg.movKardex,
      descripcion: glosa,
      cantidad: calculo.detalle[idx].cantidad,
      costo_unitario: c.costo_unitario,
      costo_total: c.costo_total,
      saldo_cantidad: c.saldo_cantidad,
      saldo_costo_unitario: c.saldo_costo_unitario,
      saldo_costo_total: c.saldo_costo_total,
      created_at: c.created_at,
      [cfg.campoDocId]: doc.id,
    }));
    if (filasKardex.length) {
      const { error: errK } = await supabase.from("kardex_movimientos").insert(filasKardex);
      if (errK) throw new Error("No se pudo registrar en el kardex: " + errK.message);
    }

    for (const plan of sim.planes) {
      await sincronizarKardex(plan.resultado, plan.existentes);
    }

    if (form.condicion === "credito") {
      const { error: errFac } = await supabase.from(cfg.tablaFacturas).insert({
        empresa_id: empresaId,
        [cfg.campoEntidadId]: form.entidadId,
        numero_factura: form.numero.trim() || null,
        fecha: form.fecha,
        fecha_vencimiento: form.fechaVencimiento || null,
        descripcion: glosa,
        monto: calculo.total,
        saldo_pendiente: calculo.total,
        cuenta_contraria_id: filasLineas[0].cuenta_id,
        transaccion_id: tx.id,
        [cfg.campoDocId]: doc.id,
      });
      if (errFac) throw new Error(`No se pudo crear la factura en ${cfg.labelControl}: ` + errFac.message);
    }
  } catch (e) {
    // Deshace lo que alcanzó a guardarse para no dejar nada a medias
    if (docId) await supabase.from(cfg.tabla).delete().eq("id", docId);
    await supabase.from("transacciones").delete().eq("id", tx.id);
    return { error: e.message };
  }

  return { ok: true, numeroPartida };
}

// Elimina el documento con su partida, líneas, renglones del kardex y
// factura de CxC/CxP (si no tiene abonos).
export async function eliminarDocumento(cfg, doc) {
  const { data: facturas } = await supabase
    .from(cfg.tablaFacturas)
    .select("id, monto, saldo_pendiente")
    .eq(cfg.campoDocId, doc.id);
  if ((facturas || []).some((f) => Number(f.saldo_pendiente) !== Number(f.monto))) {
    return {
      error: `Esta ${cfg.labelDoc} tiene abonos registrados en ${cfg.labelControl}. Elimina primero los abonos.`,
    };
  }

  const { data: filas } = await supabase
    .from("kardex_movimientos")
    .select("producto_id")
    .eq(cfg.campoDocId, doc.id);
  const productoIds = [...new Set((filas || []).map((f) => f.producto_id))];

  const planes = [];
  for (const productoId of productoIds) {
    const existentes = await obtenerKardex(productoId);
    const lista = existentes.filter((m) => m[cfg.campoDocId] !== doc.id);
    const { error, resultado } = recalcularSecuencia(lista);
    if (error) return { error };
    const errorDoc = validarCostoDocumentos(resultado, existentes);
    if (errorDoc) return { error: errorDoc };
    planes.push({ existentes, resultado });
  }

  if (doc.transaccion_id) {
    await supabase.from("transacciones").delete().eq("id", doc.transaccion_id);
  }
  const { error } = await supabase.from(cfg.tabla).delete().eq("id", doc.id);
  if (error) return { error: "No se pudo eliminar: " + error.message };

  for (const plan of planes) {
    await sincronizarKardex(plan.resultado, plan.existentes);
  }
  return { ok: true };
}
