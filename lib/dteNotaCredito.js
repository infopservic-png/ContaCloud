// Nota de crédito electrónica (DTE 05) emitida por la empresa sobre un Comprobante de Crédito Fiscal propio.
// Se registra como devolución de venta: reversa ingreso e IVA, reingresa la mercadería al kardex al costo
// de la venta original y rebaja la cuenta por cobrar (o devuelve el dinero).
import { supabase } from "@/lib/supabaseClient";
import { registrarDevolucion, eliminarDevolucion, calcularDevolucion } from "@/lib/devoluciones";
import { validarCodigoMH } from "@/lib/datosFiscales";
import { generarCodigoGeneracion, generarNumeroControl, siguienteCorrelativo, validarEmisorDte } from "@/lib/dte";
import { construirNotaCredito } from "@/lib/dteV2";
import { soloDigitos } from "@/lib/datosFiscales";
import { complementoDte } from "@/lib/catalogos";

// Normativa 2.0: Nota de crédito versión 4. La estructura y las validaciones las define lib/dteV2.js.
export function construirJsonNotaCredito({ empresa, numeroControl, codigoGeneracion, fecha, doc, receptor, detalle, subtotal, iva, total, condicion, totalLetras }) {
  const codGen = String(doc.codigo_generacion || "");
  const dep = receptor?.cod_departamento || null;
  const dis = receptor?.cod_distrito || null;
  return construirNotaCredito({
    empresa, numeroControl, codigoGeneracion, fecha,
    // El documento que se corrige: el CCF original (tipoGeneracion 2 = electrónico)
    documentos: [{ tipoDocumento: "03", tipoGeneracion: 2, numeroDocumento: codGen, fechaEmision: doc.fecha }],
    receptor: {
      tipoDocumento: "36", // el CCF se identifica con NIT
      numDocumento: soloDigitos(receptor?.nit_dui),
      nrc: receptor?.nrc,
      nombre: receptor?.nombre,
      nombreComercial: receptor?.nombre_comercial,
      codActividad: receptor?.cod_actividad,
      descActividad: receptor?.desc_actividad,
      direccion: { departamento: dep, municipio: receptor?.cod_municipio, distrito: dis, complemento: complementoDte(receptor?.direccion, dep, dis) },
      telefono: receptor?.telefono,
      correo: receptor?.correo,
    },
    items: detalle.map((l) => ({
      tipoItem: l.producto_id ? 1 : 2,
      codigo: l.codigo || null,
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      precio: l.precio,
      descuento: Math.max(0, Math.round((l.precio * l.cantidad - l.neto) * 1e8) / 1e8),
      numeroDocumento: codGen,
    })),
    condicion: condicion === "credito" ? 2 : 1,
    totalLetras,
    ivaOverride: iva,
  });
}

// datos: { fecha, motivo, liquidacion, cuentaDinero }
export async function emitirNotaCredito({ empresa, empresaId, doc, items, productos, datos }) {
  if (doc.tipo_documento !== "ccf" || !doc.codigo_generacion) {
    return { error: "La nota de crédito electrónica solo se emite sobre un Comprobante de Crédito Fiscal electrónico (con código de generación)." };
  }
  const faltaEmisor = validarEmisorDte(empresa);
  if (faltaEmisor) return { error: faltaEmisor };
  const errorCodigos = validarCodigoMH(empresa.cod_establecimiento, "establecimiento") || validarCodigoMH(empresa.cod_punto_venta, "punto de venta");
  if (errorCodigos) return { error: errorCodigos };
  if (!datos.fecha) return { error: "Indica la fecha." };
  if (datos.fecha < doc.fecha) return { error: "La nota de crédito no puede ser anterior al documento que corrige." };

  const calculoPrevio = calcularDevolucion("venta", doc, items);
  if (calculoPrevio.detalle.length === 0) return { error: "Indica qué se devuelve (cantidades o un ajuste con monto)." };

  const { data: previos, error: errPrev } = await supabase.from("documentos_dte").select("numero_control, fecha_emision").eq("empresa_id", empresaId);
  if (errPrev) return { error: "No se pudo consultar la numeración: " + errPrev.message };
  const correlativo = siguienteCorrelativo(previos || [], empresa.cod_establecimiento, datos.fecha.slice(0, 4));
  const numeroControl = generarNumeroControl({ tipoDte: "05", codEstablecimiento: empresa.cod_establecimiento, codPuntoVenta: empresa.cod_punto_venta, correlativo });
  const codigoGeneracion = generarCodigoGeneracion();

  const productosPorId = Object.fromEntries((productos || []).map((p) => [p.id, p]));
  const detalle = calculoPrevio.detalle.map((l) => ({ ...l, codigo: l.producto_id ? productosPorId[l.producto_id]?.codigo || null : null }));
  const { montoEnLetras } = await import("@/lib/dtePdf");
  const receptor = { ...(doc.entidad || {}), nit_dui: doc.entidad?.nit_dui, tipo_documento: doc.entidad?.tipo_documento || "nit" };
  const { data: clienteCompleto } = doc.cliente_id ? await supabase.from("clientes").select("*").eq("id", doc.cliente_id).maybeSingle() : { data: null };
  const receptorCompleto = clienteCompleto || receptor;
  const jsonDte = construirJsonNotaCredito({
    empresa, numeroControl, codigoGeneracion, fecha: datos.fecha, doc, receptor: receptorCompleto, detalle,
    subtotal: calculoPrevio.subtotal, iva: calculoPrevio.iva, total: calculoPrevio.total,
    condicion: doc.condicion, totalLetras: montoEnLetras(calculoPrevio.total),
  });

  const res = await registrarDevolucion({
    tipo: "venta", empresa, empresaId, doc, items, productos,
    datos: { ...datos, numero: numeroControl, codigoGeneracion, jsonDte },
  });
  if (res.error) return { error: res.error };

  const { error: errDoc } = await supabase.from("documentos_dte").insert({
    empresa_id: empresaId,
    tipo_dte: "05",
    numero_control: numeroControl,
    codigo_generacion: codigoGeneracion,
    fecha_emision: datos.fecha,
    forma_pago: doc.condicion,
    receptor: receptorCompleto,
    items: detalle.map((l) => ({ codigo: l.codigo, descripcion: l.descripcion, cantidad: l.cantidad, precio_unitario: l.precio, total_item: l.neto })),
    subtotal: calculoPrevio.subtotal,
    iva: calculoPrevio.iva,
    total: calculoPrevio.total,
    estado: "generado",
    json_dte: jsonDte,
    transaccion_id: res.transaccionId,
    devolucion_id: res.devolucionId,
  });
  if (errDoc) {
    const { data: dev } = await supabase.from("devoluciones").select("*").eq("id", res.devolucionId).maybeSingle();
    if (dev) await eliminarDevolucion(dev);
    const pista = /devolucion_id/i.test(errDoc.message) ? " Falta ejecutar la migración 33 (migracion_33_devoluciones.sql) en Supabase." : "";
    return { error: "No se pudo guardar el documento DTE; la devolución se deshizo: " + errDoc.message + pista };
  }
  return { ok: true, numeroControl, numeroPartida: res.numeroPartida };
}
