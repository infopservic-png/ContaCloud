// Importación masiva de DTE en JSON (los archivos que entrega Hacienda o el sistema de facturación)
// como ventas (la empresa es la emisora) o compras (la empresa es la receptora).
// Cada documento pasa por el mismo registro que usa el formulario de Ventas/Compras:
// partida en el Diario, documento, líneas y, si es al crédito, la factura en Cuentas por Cobrar o por Pagar.
import { supabase } from "@/lib/supabaseClient";
import { configVC, registrarDocumento, r2 } from "@/lib/ventasCompras";
import { soloDigitos, normalizarNrc } from "@/lib/datosFiscales";
import { validarUbicacion } from "@/lib/catalogos";
import { siguienteCodigoCliente } from "@/lib/clientes";
import { validarDte } from "@/lib/dteValidacion";

export const TIPOS_SOPORTADOS = { "01": "Factura", "03": "Comprobante de Crédito Fiscal" };
const NOMBRES_TIPO_DTE = {
  "01": "Factura", "03": "Comprobante de Crédito Fiscal", "04": "Nota de Remisión", "05": "Nota de Crédito",
  "06": "Nota de Débito", "07": "Comprobante de Retención", "08": "Comprobante de Liquidación",
  "09": "Documento Contable de Liquidación", "11": "Factura de Exportación", "14": "Factura de Sujeto Excluido",
  "15": "Comprobante de Donación",
};

const formatoNitCorto = (n) => (n.length === 14 ? `${n.slice(0, 4)}-${n.slice(4, 10)}-${n.slice(10, 13)}-${n.slice(13)}` : n);
const num = (x) => (x === null || x === undefined || x === "" ? 0 : Number(x) || 0);
const texto = (x) => (x === null || x === undefined ? "" : String(x).trim());

// Convierte el contenido de un archivo en el DTE. Acepta el JSON "puro" o envuelto
// (por ejemplo { dteJson: {...}, selloRecibido: "..." }).
export function leerTextoDte(contenido) {
  let obj;
  try {
    obj = JSON.parse(String(contenido).replace(/^﻿/, ""));
  } catch {
    return { error: "El archivo no es un JSON válido." };
  }
  const candidatos = [obj, obj?.dteJson, obj?.documento, obj?.dte, obj?.json];
  const dte = candidatos.find((c) => c && typeof c === "object" && c.identificacion);
  if (!dte) return { error: 'No parece un DTE: no tiene la sección "identificacion".' };
  return { dte, sello: obj?.selloRecibido || dte.selloRecibido || null };
}

function fechaMasDias(fecha, dias) {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// Vencimiento de un documento al crédito: plazo indicado en "pagos" o, si no hay, 30 días.
function vencimiento(fecha, resumen) {
  const pago = Array.isArray(resumen?.pagos) ? resumen.pagos.find((p) => num(p?.plazo) > 0) : null;
  if (!pago) return fechaMasDias(fecha, 30);
  const plazo = num(pago.plazo);
  const dias = pago.periodo === "02" ? plazo * 30 : pago.periodo === "03" ? plazo * 365 : plazo;
  return fechaMasDias(fecha, dias);
}

function datosContraparte(parte, tipoDte, esEmisor) {
  if (!parte) return null;
  let tipoDoc = null;
  let numero = "";
  if (esEmisor || tipoDte === "03") {
    numero = soloDigitos(parte.nit ?? parte.numDocumento);
    tipoDoc = numero ? "nit" : null;
  } else {
    numero = soloDigitos(parte.numDocumento);
    tipoDoc = !numero ? null : parte.tipoDocumento === "13" ? "dui" : parte.tipoDocumento === "36" ? "nit" : null;
    if (!tipoDoc) numero = "";
  }
  const dir = parte.direccion || {};
  const dep = texto(dir.departamento);
  const mun = texto(dir.municipio);
  const dis = texto(dir.distrito);
  const ubicacionValida = dep && mun && dis && !validarUbicacion(dep, mun, dis);
  return {
    nombre: texto(parte.nombre) || texto(parte.nombreComercial),
    nit_dui: numero,
    tipo_documento: tipoDoc || "nit",
    nrc: normalizarNrc(parte.nrc),
    nombre_comercial: texto(parte.nombreComercial),
    cod_actividad: texto(parte.codActividad),
    desc_actividad: texto(parte.descActividad),
    telefono: texto(parte.telefono),
    correo: texto(parte.correo),
    direccion: texto(dir.complemento),
    cod_departamento: ubicacionValida ? dep : "",
    cod_municipio: ubicacionValida ? mun : "",
    cod_distrito: ubicacionValida ? dis : "",
  };
}

// Lee un DTE y devuelve lo que se registrará, o el motivo por el que no se puede importar.
export function analizarDte(dte, modo, empresa, { permitirOtroNit = false } = {}) {
  const esVenta = modo === "venta";
  const id = dte.identificacion || {};
  const tipoDte = texto(id.tipoDte);
  if (!TIPOS_SOPORTADOS[tipoDte]) {
    const nombre = NOMBRES_TIPO_DTE[tipoDte] ? `${NOMBRES_TIPO_DTE[tipoDte]} (${tipoDte})` : `tipo ${tipoDte || "desconocido"}`;
    return { error: `${nombre} todavía no se importa; solo Factura (01) y Crédito Fiscal (03).` };
  }
  const codigoGeneracion = texto(id.codigoGeneracion).toUpperCase();
  const numeroControl = texto(id.numeroControl);
  const fecha = texto(id.fecEmi);
  if (!codigoGeneracion) return { error: "Falta el código de generación." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: "La fecha de emisión no es válida." };

  const avisos = [];
  const nitEmpresa = soloDigitos(empresa?.nit);
  // La empresa debe ser la emisora (ventas) o la receptora (compras)
  const lado = esVenta ? dte.emisor : dte.receptor;
  const nitLado = soloDigitos(lado?.nit ?? lado?.numDocumento);
  if (nitEmpresa && nitLado && nitEmpresa !== nitLado) {
    const detalle = `Este documento ${esVenta ? "fue emitido por" : "está a nombre de"} ${lado?.nombre ? `${lado.nombre} (NIT ${formatoNitCorto(nitLado)})` : `el NIT ${formatoNitCorto(nitLado)}`}, y esta empresa tiene el NIT ${formatoNitCorto(nitEmpresa)}.`;
    if (!permitirOtroNit) {
      return { error: detalle + " Si es correcto, marca «Importar aunque el NIT no coincida» o corrige el NIT de la empresa." };
    }
    avisos.push(detalle);
  }
  if (!nitEmpresa) avisos.push("La empresa no tiene NIT configurado: no se pudo comprobar que el documento le corresponda.");
  else if (!nitLado) avisos.push(`El documento no trae el NIT del ${esVenta ? "emisor" : "receptor"}: no se pudo comprobar que le corresponda.`);

  const r = dte.resumen || {};
  const gravada = num(r.totalGravada);
  const exenta = num(r.totalExenta);
  const noSuj = num(r.totalNoSuj);
  if (gravada > 0 && exenta + noSuj > 0) {
    return { error: "Documento con operaciones gravadas y exentas/no sujetas a la vez; regístralo manualmente." };
  }
  const tipoDocumento = gravada > 0 ? (tipoDte === "03" ? "ccf" : "factura") : "sin_iva";

  let subtotal;
  let iva;
  let total;
  if (tipoDocumento === "sin_iva") {
    subtotal = r2(exenta + noSuj - num(r.descuExenta) - num(r.descuNoSuj));
    iva = 0;
    total = subtotal;
  } else if (tipoDte === "03") {
    const tributos = Array.isArray(r.tributos) ? r.tributos : [];
    const otros = tributos.filter((t) => texto(t.codigo) !== "20" && num(t.valor) !== 0);
    if (otros.length) return { error: "El documento trae tributos distintos al IVA; regístralo manualmente." };
    iva = r2(tributos.filter((t) => texto(t.codigo) === "20").reduce((s, t) => s + num(t.valor), 0)) || r2(num(r.totalIva));
    subtotal = r2(gravada - num(r.descuGravada));
    total = r2(subtotal + iva);
    const declarado = num(r.montoTotalOperacion);
    if (declarado && Math.abs(declarado - total) > 0.02) {
      return { error: "El total del documento no coincide con subtotal más IVA." };
    }
  } else {
    // Factura de consumidor final: precios con IVA incluido
    total = r2(num(r.montoTotalOperacion) || gravada - num(r.descuGravada));
    iva = r2(num(r.totalIva));
    subtotal = r2(total - iva);
  }
  if (!(total > 0)) return { error: "El documento no tiene un total mayor que cero." };

  // Compra con factura de consumidor final: no da crédito fiscal, el IVA queda en el costo
  const fijos = !esVenta && tipoDocumento === "factura"
    ? { subtotal: total, iva: 0, total }
    : { subtotal, iva, total };

  const lineas = [];
  (Array.isArray(dte.cuerpoDocumento) ? dte.cuerpoDocumento : []).forEach((it, i) => {
    const monto = r2(num(it.ventaGravada) + num(it.ventaExenta) + num(it.ventaNoSuj));
    const cantidad = num(it.cantidad);
    if (!(monto > 0) || !(cantidad > 0)) return;
    lineas.push({
      descripcion: texto(it.descripcion) || `Ítem ${i + 1}`,
      cantidad,
      precio: Math.round((monto / cantidad) * 1e6) / 1e6,
    });
  });
  if (lineas.length === 0) return { error: "El documento no tiene líneas con importe." };

  const condicion = num(r.condicionOperacion) === 2 ? "credito" : "contado";
  const contraparte = datosContraparte(esVenta ? dte.receptor : dte.emisor, tipoDte, !esVenta);
  if (r.ivaRete1 && num(r.ivaRete1) > 0) avisos.push("Trae retención de IVA: no se refleja en la partida.");
  if (r.reteRenta && num(r.reteRenta) > 0) avisos.push("Trae retención de renta: no se refleja en la partida.");

  return {
    tipoDte,
    tipoDocumento,
    codigoGeneracion,
    numeroControl,
    fecha,
    condicion,
    fechaVencimiento: condicion === "credito" ? vencimiento(fecha, r) : "",
    contraparte,
    lineas,
    totalesFijos: fijos,
    total,
    avisos,
  };
}

function buscarEntidad(entidades, c) {
  if (!c) return null;
  if (c.nit_dui) {
    const e = entidades.find((x) => soloDigitos(x.nit_dui) === c.nit_dui);
    if (e) return e;
  }
  if (c.nrc) {
    const e = entidades.find((x) => normalizarNrc(x.nrc) === c.nrc);
    if (e) return e;
  }
  if (!c.nit_dui && !c.nrc && c.nombre) {
    const n = c.nombre.toLowerCase();
    return entidades.find((x) => String(x.nombre || "").trim().toLowerCase() === n) || null;
  }
  return null;
}

async function crearEntidad(cfg, empresaId, c, entidades) {
  const fila = {
    empresa_id: empresaId,
    nombre: c.nombre || "Sin nombre",
    codigo: siguienteCodigoCliente(entidades),
    tipo_persona: c.tipo_documento === "dui" ? "natural" : "juridica",
    tipo_documento: c.tipo_documento,
    nit_dui: c.nit_dui || null,
    nrc: c.nrc || null,
    nombre_comercial: c.nombre_comercial || null,
    cod_actividad: c.cod_actividad || null,
    desc_actividad: c.desc_actividad || null,
    cod_departamento: c.cod_departamento || null,
    cod_municipio: c.cod_municipio || null,
    cod_distrito: c.cod_distrito || null,
    direccion: c.direccion || null,
    telefono: c.telefono || null,
    correo: c.correo || null,
    ambiente: "real",
  };
  const { data, error } = await supabase.from(cfg.tablaEntidad).insert(fila).select().single();
  if (error) throw new Error(`No se pudo crear el ${cfg.labelEntidad.toLowerCase()}: ${error.message}`);
  return data;
}

async function yaExiste(cfg, empresaId, codigoGeneracion) {
  const { data } = await supabase
    .from(cfg.tabla)
    .select("id, fecha, numero_documento")
    .eq("empresa_id", empresaId)
    .eq("codigo_generacion", codigoGeneracion)
    .maybeSingle();
  return data || null;
}

// Registra un documento ya analizado. `entidades` se actualiza si se crea una contraparte nueva.
export async function importarDocumento({ analisis, modo, empresa, empresaId, entidades, cuentaConcepto, cuentaDinero, registrar = registrarDocumento }) {
  const cfg = configVC(modo);
  const existente = await yaExiste(cfg, empresaId, analisis.codigoGeneracion);
  if (existente) {
    return { estado: "duplicado", detalle: `Ya está registrado (${existente.numero_documento || "sin número"}, ${existente.fecha}).` };
  }

  const c = analisis.contraparte;
  let entidad = buscarEntidad(entidades, c);
  let entidadNueva = false;
  const tieneDatos = c && (c.nit_dui || c.nrc || c.nombre);
  if (!entidad && tieneDatos && (c.nit_dui || c.nrc || modo === "compra" || analisis.condicion === "credito")) {
    entidad = await crearEntidad(cfg, empresaId, c, entidades);
    entidades.push(entidad);
    entidadNueva = true;
  }
  if (!entidad && (analisis.tipoDocumento === "ccf" || analisis.condicion === "credito")) {
    return { estado: "error", detalle: `El documento no identifica al ${cfg.labelEntidad.toLowerCase()}.` };
  }

  const form = {
    fecha: analisis.fecha,
    tipoDocumento: analisis.tipoDocumento,
    numero: analisis.numeroControl,
    entidadId: entidad?.id || "",
    condicion: analisis.condicion,
    fechaVencimiento: analisis.fechaVencimiento,
    cuentaDinero: analisis.condicion === "contado" ? cuentaDinero : "",
    descripcion: "Importado de DTE",
    codigoGeneracion: analisis.codigoGeneracion,
    totalesFijos: analisis.totalesFijos,
    lineas: analisis.lineas.map((l, i) => ({
      key: i + 1,
      clase: "concepto",
      producto_id: "",
      cuenta_id: cuentaConcepto,
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      precio: l.precio,
    })),
  };
  const res = await registrar(cfg, { empresa, empresaId, form, productos: [], entidades });
  if (res.error) return { estado: "error", detalle: res.error };
  return { estado: "importado", numeroPartida: res.numeroPartida, entidadNueva, entidadNombre: entidad?.nombre || "" };
}

// Procesa varios archivos: [{ nombre, contenido }]. En orden cronológico para que las partidas queden en orden.
// opciones: { modo, empresa, empresaId, entidades, cuentaConcepto, cuentaDinero, soloValidar, permitirNoValidos }
export async function procesarLote(archivos, opciones, alAvanzar = () => {}) {
  const { modo, empresa, soloValidar, permitirNoValidos, permitirOtroNit } = opciones;
  const items = archivos.map((a) => {
    const base = { archivo: a.nombre };
    const leido = leerTextoDte(a.contenido);
    if (leido.error) return { ...base, estado: "error", detalle: leido.error };
    const esquema = validarDte(leido.dte);
    const analisis = analizarDte(leido.dte, modo, empresa, { permitirOtroNit });
    return {
      ...base,
      dte: leido.dte,
      esquema,
      analisis: analisis.error ? null : analisis,
      errorAnalisis: analisis.error || null,
      numeroControl: texto(leido.dte.identificacion?.numeroControl),
      fecha: texto(leido.dte.identificacion?.fecEmi),
      total: num(leido.dte.resumen?.montoTotalOperacion ?? leido.dte.resumen?.totalPagar),
    };
  });

  const orden = items
    .filter((x) => x.dte)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.numeroControl.localeCompare(b.numeroControl));
  const vistos = new Set();
  const resultados = items.filter((x) => !x.dte);
  let hechos = resultados.length;
  alAvanzar(hechos, items.length);

  for (const it of orden) {
    const fila = {
      archivo: it.archivo, numeroControl: it.numeroControl, fecha: it.fecha, total: it.total,
      contraparte: it.analisis?.contraparte?.nombre || "", esquema: it.esquema,
      avisos: it.analisis?.avisos || [],
    };
    const cg = it.analisis?.codigoGeneracion;
    if (it.errorAnalisis) {
      Object.assign(fila, { estado: "error", detalle: it.errorAnalisis });
    } else if (it.esquema.estado === "invalido" && !permitirNoValidos) {
      Object.assign(fila, { estado: "invalido", detalle: `No cumple el esquema oficial (${it.esquema.errores.length} problema(s)).` });
    } else if (vistos.has(cg)) {
      Object.assign(fila, { estado: "duplicado", detalle: "Está repetido en los archivos seleccionados." });
    } else if (soloValidar) {
      Object.assign(fila, { estado: "valido", detalle: it.esquema.estado === "sin_esquema" ? "Estructura correcta (sin esquema oficial cargado)." : "Cumple el esquema oficial." });
    } else {
      vistos.add(cg);
      try {
        Object.assign(fila, await importarDocumento({ ...opciones, analisis: it.analisis, entidades: opciones.entidades }));
      } catch (e) {
        Object.assign(fila, { estado: "error", detalle: e.message });
      }
    }
    resultados.push(fila);
    hechos += 1;
    alAvanzar(hechos, items.length);
  }
  return resultados;
}
