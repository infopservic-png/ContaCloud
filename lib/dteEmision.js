import { supabase } from "@/lib/supabaseClient";
import {
  configVC,
  registrarDocumento,
  eliminarDocumento,
  validarFormulario,
} from "@/lib/ventasCompras";
import {
  normalizarDatosFiscales,
  validarDatosFiscales,
  validarCodigoMH,
  faltantesCreditoFiscal,
} from "@/lib/datosFiscales";
import {
  TIPO_DOCUMENTO_VENTA,
  generarCodigoGeneracion,
  generarNumeroControl,
  siguienteCorrelativo,
  construirJsonDteDesdeVenta,
} from "@/lib/dte";

const norm = (s) => String(s || "").trim().toLowerCase();

// Emite un DTE con inventario: registra una VENTA completa (partida con costo de
// venta al promedio ponderado, salida del Kardex, factura en Cuentas por Cobrar si
// es al crédito) usando la misma lógica del módulo de Ventas, y luego guarda el
// documento DTE enlazado a esa venta. Si algo falla, no queda nada a medias.
//
// datos: { tipoDte, fecha, condicion, fechaVencimiento, cuentaDinero,
//          receptor, clienteId, guardarCliente, lineas }
export async function emitirDte({ empresa, empresaId, datos, productos, clientes }) {
  const cfg = configVC("venta");
  const {
    tipoDte, fecha, condicion, fechaVencimiento, cuentaDinero,
    clienteId, guardarCliente, lineas,
  } = datos;
  // Datos fiscales limpios según la normativa: sin guiones, NRC sin ceros a la izquierda
  const receptor = {
    nombre: "", correo: "", direccion: "", telefono: "",
    cod_departamento: "", cod_municipio: "", cod_distrito: "",
    ...datos.receptor,
    ...normalizarDatosFiscales(datos.receptor),
  };

  const tipoDocumento = TIPO_DOCUMENTO_VENTA[tipoDte];
  if (!tipoDocumento) return { error: "Tipo de documento no soportado." };
  if (!empresa?.nit || !empresa?.nrc) {
    return { error: "Completa los datos fiscales del emisor (NIT y NRC) antes de emitir." };
  }
  const errorCodigos =
    validarCodigoMH(empresa.cod_establecimiento, "establecimiento") ||
    validarCodigoMH(empresa.cod_punto_venta, "punto de venta");
  if (errorCodigos) return { error: errorCodigos };
  if (!receptor.nombre.trim()) return { error: "Indica el nombre del receptor." };
  const errorFiscal = validarDatosFiscales(receptor);
  if (errorFiscal) return { error: errorFiscal };
  if (tipoDte === "03" && (receptor.tipo_documento !== "nit" || !receptor.nit_dui || !receptor.nrc)) {
    return { error: "El Comprobante de Crédito Fiscal requiere el NIT y el NRC del receptor." };
  }
  if (tipoDte === "03") {
    // Para transmitir un Crédito Fiscal la normativa también pide la actividad económica y la dirección completa
    const falta = faltantesCreditoFiscal(receptor).filter((x) => x !== "NIT" && x !== "NRC");
    if (falta.length) {
      return {
        error:
          "El Comprobante de Crédito Fiscal requiere además la actividad económica y la dirección completa del receptor " +
          `(departamento, municipio, distrito y dirección complementaria). Falta: ${falta.join(", ")}.`,
      };
    }
  }

  const requiereCliente = tipoDte === "03" || condicion === "credito";
  const formBase = {
    fecha,
    tipoDocumento,
    numero: "",
    condicion,
    fechaVencimiento: fechaVencimiento || "",
    cuentaDinero: cuentaDinero || "",
    descripcion: "",
    lineas,
  };

  // Valida el formulario antes de crear nada (el cliente se resuelve después)
  const errorForm = validarFormulario(cfg, {
    ...formBase,
    entidadId: clienteId || (requiereCliente ? "pendiente" : ""),
  });
  if (errorForm) return { error: errorForm };

  // 1) Cliente: se elige uno registrado, o se crea/actualiza desde el receptor
  let entidadId = clienteId || "";
  let clienteNuevo = null;
  if (requiereCliente || guardarCliente) {
    const nombre = receptor.nombre.trim();
    const datosCliente = {
      nombre,
      tipo_documento: receptor.tipo_documento,
      nit_dui: receptor.nit_dui || null,
      nrc: receptor.nrc || null,
      nombre_comercial: receptor.nombre_comercial || null,
      cod_actividad: receptor.cod_actividad || null,
      desc_actividad: receptor.desc_actividad || null,
      cod_departamento: receptor.cod_departamento || null,
      cod_municipio: receptor.cod_municipio || null,
      cod_distrito: receptor.cod_distrito || null,
      telefono: (receptor.telefono || "").trim() || null,
      correo: (receptor.correo || "").trim() || null,
      direccion: (receptor.direccion || "").trim() || null,
    };
    // Si no eligió uno pero ya existe con el mismo nombre, lo reutiliza (sin duplicar)
    const idExistente =
      clienteId || clientes.find((c) => norm(c.nombre) === norm(nombre))?.id;
    if (idExistente) {
      entidadId = idExistente;
      if (guardarCliente) {
        const { error } = await supabase.from("clientes").update(datosCliente).eq("id", idExistente);
        if (error) return { error: "No se pudo actualizar el cliente: " + error.message };
      }
    } else {
      const { data, error } = await supabase
        .from("clientes")
        .insert({ ...datosCliente, empresa_id: empresaId })
        .select()
        .single();
      if (error) return { error: "No se pudo guardar el cliente: " + error.message };
      clienteNuevo = data;
      entidadId = data.id;
    }
  }

  // 2) Número de Control: consecutivo por establecimiento, reinicia cada año
  const { data: previos, error: errPrev } = await supabase
    .from("documentos_dte")
    .select("numero_control, fecha_emision")
    .eq("empresa_id", empresaId);
  if (errPrev) return { error: "No se pudo consultar la numeración: " + errPrev.message };
  const correlativo = siguienteCorrelativo(previos || [], empresa.cod_establecimiento, fecha.slice(0, 4));
  const numeroControl = generarNumeroControl({
    tipoDte,
    codEstablecimiento: empresa.cod_establecimiento,
    codPuntoVenta: empresa.cod_punto_venta,
    correlativo,
  });
  const codigoGeneracion = generarCodigoGeneracion();

  // 3) Venta: partida + costo de venta + Kardex + Cuentas por Cobrar (si es a crédito)
  const entidades = clienteNuevo ? [...clientes, clienteNuevo] : clientes;
  const res = await registrarDocumento(cfg, {
    empresa,
    empresaId,
    form: { ...formBase, numero: numeroControl, entidadId },
    productos,
    entidades,
  });
  if (res.error) return { error: res.error };

  // 4) Documento DTE enlazado a la venta
  const productosPorId = Object.fromEntries(productos.map((p) => [p.id, p]));
  const detalle = res.calculo.detalle.map((l) => {
    const p = l.clase === "producto" ? productosPorId[l.producto_id] : null;
    return { ...l, codigo: p?.codigo || null, descripcion: p ? p.nombre : l.descripcion.trim() };
  });
  const { subtotal, iva, total } = res.calculo;
  const jsonDte = construirJsonDteDesdeVenta({
    empresa, tipoDte, numeroControl, codigoGeneracion, fechaEmision: fecha,
    receptor, detalle, subtotal, iva, total, condicion,
  });

  const { error: errDoc } = await supabase.from("documentos_dte").insert({
    empresa_id: empresaId,
    tipo_dte: tipoDte,
    numero_control: numeroControl,
    codigo_generacion: codigoGeneracion,
    fecha_emision: fecha,
    forma_pago: condicion,
    receptor,
    items: detalle.map((l) => ({
      codigo: l.codigo,
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      precio_unitario: l.precio,
      total_item: tipoDte === "01" ? l.bruto : l.neto,
    })),
    subtotal,
    iva,
    total,
    estado: "generado",
    json_dte: jsonDte,
    transaccion_id: res.transaccionId,
    venta_id: res.docId,
  });

  if (errDoc) {
    // Deshace la venta (partida, Kardex y cuentas por cobrar) para no dejar nada a medias
    await eliminarDocumento(cfg, { id: res.docId, transaccion_id: res.transaccionId });
    const pista = /venta_id/i.test(errDoc.message)
      ? " Falta ejecutar la migración 10 (migracion_10_dte_venta.sql) en Supabase."
      : "";
    return {
      error: "No se pudo guardar el documento DTE; la venta se deshizo: " + errDoc.message + pista,
    };
  }

  return { ok: true, numeroControl, numeroPartida: res.numeroPartida, clienteNuevo };
}

// Elimina un DTE que aún no se ha firmado ni transmitido, junto con su venta:
// la partida, la salida del Kardex y la factura de Cuentas por Cobrar.
export async function eliminarDte(d) {
  if (d.estado !== "generado") {
    return { error: "Solo se pueden eliminar documentos que aún no se han firmado ni transmitido." };
  }
  if (d.venta_id) {
    return eliminarDocumento(configVC("venta"), { id: d.venta_id, transaccion_id: d.transaccion_id });
  }
  // Documento anterior a la integración con inventario: solo tiene su partida
  if (d.transaccion_id) {
    await supabase.from("transacciones").delete().eq("id", d.transaccion_id);
  }
  const { error } = await supabase.from("documentos_dte").delete().eq("id", d.id);
  if (error) return { error: "No se pudo eliminar: " + error.message };
  return { ok: true };
}
