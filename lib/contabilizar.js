// Contabilización diaria (modo «contabilizar después»): toma las ventas y compras que aún no tienen
// partida y genera UNA partida por día y por tipo (ventas → Ingresos, compras → Egresos, por defecto).
import { supabase } from "@/lib/supabaseClient";
import { configVC, r2 } from "@/lib/ventasCompras";
import { obtenerProductos } from "@/lib/kardex";
import { siguienteNumeroPartida, etiquetaPartida } from "@/lib/partidas";

export async function documentosPendientes(tipo, empresaId, desde, hasta) {
  const cfg = configVC(tipo);
  let q = supabase
    .from(cfg.tabla)
    .select(`*, entidad:${cfg.campoEntidadId} ( nombre )`)
    .eq("empresa_id", empresaId)
    .is("transaccion_id", null)
    .order("fecha")
    .order("created_at");
  if (desde) q = q.gte("fecha", desde);
  if (hasta) q = q.lte("fecha", hasta);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function lineasDe(cfg, ids) {
  if (!ids.length) return {};
  const { data, error } = await supabase.from(cfg.tablaLineas).select("*").in(cfg.campoDocId, ids);
  if (error) throw error;
  const porDoc = {};
  for (const l of data || []) (porDoc[l[cfg.campoDocId]] ||= []).push(l);
  return porDoc;
}

// Renglones Debe/Haber de un documento, a partir de lo que quedó guardado.
export function renglonesDocumento(cfg, empresa, doc, lineas, productosPorId) {
  const debe = new Map();
  const haber = new Map();
  const detalles = new Map(); // cuenta → [{ texto, monto }]
  const quien = (doc.entidad?.nombre || "").toUpperCase();
  const comprobante = doc.codigo_generacion || doc.numero_documento || "";
  const textoDoc = [quien, comprobante ? `COMPROB. No. ${comprobante}` : ""].filter(Boolean).join(", ");
  const sumar = (m, cuenta, monto, texto) => {
    if (!cuenta || !monto) return;
    m.set(cuenta, r2((m.get(cuenta) || 0) + Number(monto)));
    const arr = detalles.get(cuenta) || [];
    arr.push({ texto: texto || textoDoc, monto: r2(Number(monto)) });
    detalles.set(cuenta, arr);
  };
  const cuentaDinero = doc.condicion === "credito" ? empresa?.[cfg.campoCuentaControl] : doc[cfg.campoCuentaDinero];
  const cuentaIva =
    doc.cuenta_iva_id ||
    (cfg.tipo === "venta"
      ? doc.tipo_documento === "ccf"
        ? empresa?.cuenta_iva_debito_ccf_id
        : empresa?.cuenta_iva_debito_cf_id
      : empresa?.cuenta_iva_credito_id);
  const errores = [];
  if (!cuentaDinero) errores.push("falta la cuenta de " + (doc.condicion === "credito" ? cfg.labelControl : "cobro/pago"));
  if (Number(doc.iva) > 0 && !cuentaIva) errores.push("falta la cuenta de IVA");

  for (const l of lineas) {
    if (!l.cuenta_id) errores.push("una línea no tiene cuenta");
    sumar(cfg.tipo === "venta" ? haber : debe, l.cuenta_id, l.subtotal, l.descripcion ? `${l.descripcion} — ${textoDoc}` : textoDoc);
  }
  if (cfg.tipo === "venta") {
    sumar(debe, cuentaDinero, doc.total);
    sumar(haber, cuentaIva, doc.iva);
    for (const l of lineas) {
      if (!l.producto_id || !Number(l.costo_total)) continue;
      const p = productosPorId[l.producto_id];
      sumar(debe, p?.cuenta_costo_venta_id, l.costo_total);
      sumar(haber, p?.cuenta_inventario_id, l.costo_total);
    }
  } else {
    sumar(debe, cuentaIva, doc.iva);
    sumar(haber, cuentaDinero, doc.total);
  }
  return { debe, haber, errores, detalles };
}

// Junta los renglones de varios documentos en líneas de partida (una por cuenta).
export function partidaDelDia(cfg, empresa, docs, lineasPorDoc, productosPorId) {
  const debe = new Map();
  const haber = new Map();
  const detalle = new Map(); // cuenta → Map(texto → monto)
  const errores = [];
  for (const d of docs) {
    const r = renglonesDocumento(cfg, empresa, d, lineasPorDoc[d.id] || [], productosPorId);
    if (r.errores.length) errores.push(`${d.numero_documento || d.id.slice(0, 8)}: ${[...new Set(r.errores)].join(", ")}`);
    for (const [c, m] of r.debe) debe.set(c, r2((debe.get(c) || 0) + m));
    for (const [c, m] of r.haber) haber.set(c, r2((haber.get(c) || 0) + m));
    for (const [c, arr] of r.detalles) {
      const mapa = detalle.get(c) || new Map();
      for (const x of arr) mapa.set(x.texto, r2((mapa.get(x.texto) || 0) + x.monto));
      detalle.set(c, mapa);
    }
  }
  const det = (c) => [...(detalle.get(c) || [])].map(([texto, monto]) => ({ texto, monto }));
  const lineas = [
    ...[...debe].map(([cuenta_id, monto]) => ({ cuenta_id, debe: monto, haber: 0, detalle: det(cuenta_id) })),
    ...[...haber].map(([cuenta_id, monto]) => ({ cuenta_id, debe: 0, haber: monto, detalle: det(cuenta_id) })),
  ];
  const totalDebe = r2(lineas.reduce((s, l) => s + l.debe, 0));
  const totalHaber = r2(lineas.reduce((s, l) => s + l.haber, 0));
  if (Math.abs(totalDebe - totalHaber) > 0.005) errores.push(`la partida no cuadra (Debe ${totalDebe} ≠ Haber ${totalHaber})`);
  return { lineas, totalDebe, totalHaber, errores };
}

function fechaLarga(f) {
  const [a, m, d] = String(f).split("-");
  return `${d}/${m}/${a}`;
}

// Contabiliza los documentos pendientes del rango. config: { venta: {tipo}|null, compra: {tipo}|null }
// (tipo de partida para cada clase; null = no contabilizar esa clase). Devuelve un resumen por partida creada.
export async function contabilizar({ empresa, empresaId, desde, hasta, tipos }) {
  const productos = await obtenerProductos(empresaId);
  const productosPorId = Object.fromEntries(productos.map((p) => [p.id, p]));
  const resultados = [];

  for (const clase of ["venta", "compra"]) {
    const tipoPartida = tipos?.[clase];
    if (!tipoPartida) continue;
    const cfg = configVC(clase);
    const docs = await documentosPendientes(clase, empresaId, desde, hasta);
    const lineasPorDoc = await lineasDe(cfg, docs.map((d) => d.id));
    const porDia = {};
    for (const d of docs) (porDia[d.fecha] ||= []).push(d);

    for (const fecha of Object.keys(porDia).sort()) {
      const grupo = porDia[fecha];
      const p = partidaDelDia(cfg, empresa, grupo, lineasPorDoc, productosPorId);
      if (p.errores.length) {
        resultados.push({ clase, fecha, docs: grupo.length, error: p.errores.join(" · ") });
        continue;
      }
      const numero = await siguienteNumeroPartida(empresaId, tipoPartida);
      const glosa = `Registro de las operaciones contables de este día — ${clase === "venta" ? "ventas" : "compras"} del ${fechaLarga(fecha)} (${grupo.length} ${grupo.length === 1 ? "documento" : "documentos"})`;
      const { data: tx, error: errTx } = await supabase
        .from("transacciones")
        .insert({ empresa_id: empresaId, fecha, descripcion: glosa, numero_partida: numero, tipo: tipoPartida, agrupada: true })
        .select()
        .single();
      if (errTx) {
        resultados.push({ clase, fecha, docs: grupo.length, error: errTx.message });
        continue;
      }
      const { error: errMov } = await supabase.from("movimientos").insert(p.lineas.map((l) => ({ ...l, transaccion_id: tx.id })));
      if (errMov) {
        await supabase.from("transacciones").delete().eq("id", tx.id);
        resultados.push({ clase, fecha, docs: grupo.length, error: errMov.message });
        continue;
      }
      const ids = grupo.map((d) => d.id);
      const { error: errDoc } = await supabase.from(cfg.tabla).update({ transaccion_id: tx.id }).in("id", ids);
      if (errDoc) {
        await supabase.from("transacciones").delete().eq("id", tx.id);
        resultados.push({ clase, fecha, docs: grupo.length, error: errDoc.message });
        continue;
      }
      await supabase.from(cfg.tablaFacturas).update({ transaccion_id: tx.id }).in(cfg.campoDocId, ids);
      resultados.push({ clase, fecha, docs: grupo.length, tipo: tipoPartida, numero, etiqueta: etiquetaPartida(tipoPartida, numero), total: p.totalDebe });
    }
  }
  return resultados;
}

// Cambia el tipo de las partidas de ventas y compras (diarias e individuales): tipos = { venta, compra } (null = no tocar).
// Las partidas pasan al final de la numeración del tipo destino, en orden de fecha. Con aplicar=false solo calcula el plan.
export async function reclasificarPartidasDiarias({ empresaId, tipos, aplicar = true }) {
  const plan = [];
  for (const clase of ["venta", "compra"]) {
    const destino = tipos?.[clase];
    if (!destino) continue;
    const cfg = configVC(clase);
    const { data: docs, error } = await supabase
      .from(cfg.tabla)
      .select("transaccion_id")
      .eq("empresa_id", empresaId)
      .not("transaccion_id", "is", null);
    if (error) throw error;
    const ids = [...new Set((docs || []).map((d) => d.transaccion_id))];
    const txs = [];
    for (let i = 0; i < ids.length; i += 80) {
      const { data, error: e2 } = await supabase
        .from("transacciones")
        .select("id, fecha, tipo, numero_partida, agrupada")
        .in("id", ids.slice(i, i + 80))
        .neq("tipo", destino);
      if (e2) throw e2;
      txs.push(...(data || []));
    }
    txs.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)) || (a.numero_partida || 0) - (b.numero_partida || 0));
    let siguiente = await siguienteNumeroPartida(empresaId, destino);
    for (const t of txs) {
      plan.push({ id: t.id, clase, fecha: t.fecha, de: etiquetaPartida(t.tipo, t.numero_partida), tipoDestino: destino, numero: siguiente });
      siguiente += 1;
    }
  }
  if (aplicar) {
    for (const p of plan) {
      const { error } = await supabase.from("transacciones").update({ tipo: p.tipoDestino, numero_partida: p.numero }).eq("id", p.id);
      if (error) throw error;
    }
  }
  return plan;
}
