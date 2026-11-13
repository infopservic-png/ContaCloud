// Factura de Sujeto Excluido (DTE 14): la emite el contribuyente cuando COMPRA a una persona
// no inscrita en IVA. Se registra como una compra (con la marca de sujeto excluido), así que
// aparece en Compras, en el libro de compras (columna de sujetos excluidos), en el F14 si
// hay retención de renta y en la casilla 66 del F-07.
import { supabase } from "@/lib/supabaseClient";
import { configVC, calcularDocumento, registrarDocumento, eliminarDocumento, validarFormulario } from "@/lib/ventasCompras";
import { normalizarDatosFiscales, validarDatosFiscales, validarCodigoMH, soloDigitos, TIPOS_DOCUMENTO_ID } from "@/lib/datosFiscales";
import { generarCodigoGeneracion, generarNumeroControl, siguienteCorrelativo, construirEmisor, validarEmisorDte, TIPO_DTE_SUJETO_EXCLUIDO } from "@/lib/dte";
import { complementoDte } from "@/lib/catalogos";

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const norm = (s) => String(s || "").trim().toLowerCase();

export function construirJsonFse({ empresa, numeroControl, codigoGeneracion, fecha, sujeto, detalle, total, retencion, condicion, totalLetras }) {
  const numero = soloDigitos(sujeto.nit_dui) || null;
  const tipoId = sujeto.tipo_documento === "nit" ? "nit" : "dui";
  const dep = sujeto.cod_departamento || null;
  const dis = sujeto.cod_distrito || null;
  const complemento = complementoDte(sujeto.direccion, dep, dis);
  const totalPagar = r2(total - retencion);
  return {
    identificacion: {
      version: 2, // Normativa 2.0
      ambiente: null, // se completa al transmitir
      tipoDte: TIPO_DTE_SUJETO_EXCLUIDO,
      numeroControl,
      codigoGeneracion,
      tipoModelo: 1,
      tipoOperacion: 1,
      tipoContingencia: null,
      motivoContin: null,
      fecEmi: fecha,
      horEmi: new Date().toTimeString().slice(0, 8),
      tipoMoneda: "USD",
    },
    emisor: construirEmisor(empresa),
    // Normativa 2.0: el sujeto excluido es el "receptor"; la actividad económica va nula y la dirección lleva distrito
    receptor: {
      tipoDocumento: numero ? TIPOS_DOCUMENTO_ID[tipoId].codigo : null,
      numDocumento: numero,
      nombre: sujeto.nombre?.trim() || null,
      codActividad: null,
      descActividad: null,
      direccion: dep || complemento ? { departamento: dep, municipio: sujeto.cod_municipio || null, distrito: dis, complemento } : null,
      telefono: sujeto.telefono?.trim() || null,
      correo: sujeto.correo?.trim() || null,
    },
    cuerpoDocumento: detalle.map((l, i) => ({
      numItem: i + 1,
      tipoItem: 2,
      cantidad: l.cantidad,
      codigo: null,
      uniMedida: 99,
      descripcion: l.descripcion,
      precioUni: l.precio,
      montoDescu: 0,
      compra: l.neto,
    })),
    resumen: {
      totalCompra: total,
      descu: 0,
      totalDescu: 0,
      subTotal: total,
      reteRenta: retencion,
      totalPagar,
      totalLetras: totalLetras || null,
      condicionOperacion: condicion === "credito" ? 2 : 1,
      pagos: null,
      observaciones: null,
    },
    apendice: null,
    firma: null,
    selloRecibido: null,
  };
}

// datos: { fecha, condicion, fechaVencimiento, cuentaDinero, proveedorId, sujeto, lineas,
//          retencionRenta, codigoIngreso, cuentaRetencion }
export async function emitirFse({ empresa, empresaId, datos, proveedores }) {
  const cfg = configVC("compra");
  const { fecha, condicion, fechaVencimiento, cuentaDinero, proveedorId, lineas, retencionRenta, codigoIngreso, cuentaRetencion } = datos;
  const sujeto = { nombre: "", correo: "", direccion: "", telefono: "", cod_departamento: "", cod_municipio: "", cod_distrito: "", ...datos.sujeto, ...normalizarDatosFiscales(datos.sujeto) };

  const faltaEmisor = validarEmisorDte(empresa);
  if (faltaEmisor) return { error: faltaEmisor };
  const errorCodigos = validarCodigoMH(empresa.cod_establecimiento, "establecimiento") || validarCodigoMH(empresa.cod_punto_venta, "punto de venta");
  if (errorCodigos) return { error: errorCodigos };
  if (!sujeto.nombre.trim()) return { error: "Indica el nombre del sujeto excluido." };
  if (!sujeto.nit_dui) return { error: "Indica el DUI o NIT del sujeto excluido (es obligatorio en la FSE)." };
  const errorFiscal = validarDatosFiscales(sujeto);
  if (errorFiscal) return { error: errorFiscal };

  const retencion = r2(Number(retencionRenta) || 0);
  const formBase = {
    fecha,
    tipoDocumento: "sin_iva",
    numero: "",
    condicion,
    fechaVencimiento: fechaVencimiento || "",
    cuentaDinero: cuentaDinero || "",
    descripcion: "Factura de sujeto excluido",
    lineas,
    retencionRenta: retencion > 0 ? String(retencion) : "",
    codigoIngreso: retencion > 0 ? codigoIngreso : "",
    cuentaRetencion: retencion > 0 ? cuentaRetencion : "",
    sujetoExcluido: true,
  };
  const errorForm = validarFormulario(cfg, { ...formBase, entidadId: "pendiente" });
  if (errorForm) return { error: errorForm };
  if (retencion > 0 && !cuentaRetencion) return { error: "Elige la cuenta de renta retenida por pagar." };
  const calculoPrevio = calcularDocumento(cfg, "sin_iva", lineas);
  if (retencion > calculoPrevio.total + 0.005) return { error: "La retención no puede ser mayor que el total de la compra." };

  // Proveedor: se reutiliza si ya existe (por nombre o documento) y, si no, se crea como persona natural
  let proveedorIdFinal = proveedorId || "";
  let proveedorNuevo = null;
  const datosProv = {
    nombre: sujeto.nombre.trim(),
    tipo_persona: "natural",
    tipo_documento: sujeto.tipo_documento === "nit" ? "nit" : "dui",
    nit_dui: sujeto.nit_dui || null,
  };
  if (!proveedorIdFinal) {
    const existente = proveedores.find((p) => norm(p.nombre) === norm(datosProv.nombre) || (p.nit_dui && soloDigitos(p.nit_dui) === soloDigitos(sujeto.nit_dui)));
    if (existente) proveedorIdFinal = existente.id;
    else {
      const { data, error } = await supabase.from("proveedores").insert({ ...datosProv, empresa_id: empresaId }).select().single();
      if (error) return { error: "No se pudo guardar el proveedor: " + error.message };
      proveedorNuevo = data;
      proveedorIdFinal = data.id;
    }
  }

  // Número de Control (consecutivo por establecimiento) y código de generación
  const { data: previos, error: errPrev } = await supabase.from("documentos_dte").select("numero_control, fecha_emision").eq("empresa_id", empresaId);
  if (errPrev) return { error: "No se pudo consultar la numeración: " + errPrev.message };
  const correlativo = siguienteCorrelativo(previos || [], empresa.cod_establecimiento, fecha.slice(0, 4));
  const numeroControl = generarNumeroControl({ tipoDte: TIPO_DTE_SUJETO_EXCLUIDO, codEstablecimiento: empresa.cod_establecimiento, codPuntoVenta: empresa.cod_punto_venta, correlativo });
  const codigoGeneracion = generarCodigoGeneracion();

  const detalle = calculoPrevio.detalle.map((l) => ({ ...l, descripcion: l.descripcion.trim() }));
  const { montoEnLetras } = await import("@/lib/dtePdf");
  const jsonDte = construirJsonFse({ totalLetras: montoEnLetras(r2(calculoPrevio.total - retencion)), empresa, numeroControl, codigoGeneracion, fecha, sujeto, detalle, total: calculoPrevio.total, retencion, condicion });

  const entidades = proveedorNuevo ? [...proveedores, proveedorNuevo] : proveedores;
  const res = await registrarDocumento(cfg, {
    empresa,
    empresaId,
    form: { ...formBase, numero: numeroControl, entidadId: proveedorIdFinal, codigoGeneracion, jsonDte },
    productos: [],
    entidades,
  });
  if (res.error) return { error: res.error };

  const { error: errDoc } = await supabase.from("documentos_dte").insert({
    empresa_id: empresaId,
    tipo_dte: TIPO_DTE_SUJETO_EXCLUIDO,
    numero_control: numeroControl,
    codigo_generacion: codigoGeneracion,
    fecha_emision: fecha,
    forma_pago: condicion,
    receptor: sujeto,
    items: detalle.map((l) => ({ codigo: null, descripcion: l.descripcion, cantidad: l.cantidad, precio_unitario: l.precio, total_item: l.neto })),
    subtotal: calculoPrevio.total,
    iva: 0,
    total: calculoPrevio.total,
    estado: "generado",
    json_dte: jsonDte,
    transaccion_id: res.transaccionId,
    compra_id: res.docId,
  });
  if (errDoc) {
    await eliminarDocumento(cfg, { id: res.docId, transaccion_id: res.transaccionId, empresa_id: empresaId });
    const pista = /compra_id/i.test(errDoc.message) ? " Falta ejecutar la migración 30 (migracion_30_sujeto_excluido.sql) en Supabase." : "";
    return { error: "No se pudo guardar el documento DTE; la compra se deshizo: " + errDoc.message + pista };
  }
  return { ok: true, numeroControl, numeroPartida: res.numeroPartida, proveedorNuevo };
}
