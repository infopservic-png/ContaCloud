// Documentos Tributarios Electrónicos según la Normativa de Cumplimiento de los DTE, versión 2.0
// (Ministerio de Hacienda, 25 de mayo de 2026). Anexo II (estructura de datos) y Anexo IV (validaciones).
//
// Cubre los documentos que ContaCloud aún no emitía:
//   01 Factura (v2), 03 CCF (v4), 05 Nota de crédito (v4) y 14 Sujeto excluido (v2): se validan aquí (los arman lib/dte*.js)
//   04 Nota de remisión (v4)            06 Nota de débito (v4)           07 Comprobante de retención (v2)
//   08 Comprobante de liquidación (v2)  09 Doc. contable de liquidación (v2)
//   11 Factura de exportación (v3)      15 Comprobante de donación (v2)
//
// Cada constructor devuelve el JSON del DTE (sin firma ni sello). El campo identificacion.ambiente se
// completa al transmitir. validarDteV2() revisa las reglas de campos y las fórmulas con la holgura de ±0.01.
// Cuando se carguen los JSON-schema oficiales en lib/schemas, la validación contra el esquema oficial
// (lib/dteValidacion.js) es la verificación definitiva de nombres de campo y tipos.
import { generarCodigoGeneracion, generarNumeroControl } from "@/lib/dte";
import { soloDigitos, normalizarNrc } from "@/lib/datosFiscales";

export const TIPOS_DTE_V2 = {
  "01": { nombre: "Factura Electrónica", sigla: "FE", version: 2 },
  "03": { nombre: "Comprobante de Crédito Fiscal Electrónico", sigla: "CCFE", version: 4 },
  "04": { nombre: "Nota de Remisión Electrónica", sigla: "NRE", version: 4 },
  "05": { nombre: "Nota de Crédito Electrónica", sigla: "NCE", version: 4 },
  "06": { nombre: "Nota de Débito Electrónica", sigla: "NDE", version: 4 },
  "07": { nombre: "Comprobante de Retención Electrónico", sigla: "CRE", version: 2 },
  "08": { nombre: "Comprobante de Liquidación Electrónico", sigla: "CLE", version: 2 },
  "09": { nombre: "Documento Contable de Liquidación Electrónico", sigla: "DCLE", version: 2 },
  "11": { nombre: "Factura de Exportación Electrónica", sigla: "FEXE", version: 3 },
  "14": { nombre: "Factura de Sujeto Excluido Electrónica", sigla: "FSEE", version: 2 },
  "15": { nombre: "Comprobante de Donación Electrónico", sigla: "CDE", version: 2 },
};

export const IVA = 0.13;
export const HOLGURA = 0.01;

// CAT-006 Retención IVA MH: porcentaje legal por código (C9 = otros casos: se indica el monto)
export const RETENCION_IVA = { "22": 0.01, C4: 0.13, C9: null };
// CAT-015 Tributos (los que usan estos documentos)
export const TRIBUTO_IVA = { codigo: "20", descripcion: "Impuesto al Valor Agregado 13%" };
export const TRIBUTO_EXPORTACION = { codigo: "C3", descripcion: "Impuesto al Valor Agregado (exportaciones) 0%" };

const r = (n, d = 2) => {
  const f = 10 ** d;
  return Math.round((Number(n || 0) + Number.EPSILON) * f) / f;
};
const r2 = (n) => r(n, 2);
const r8 = (n) => r(n, 8);
const nul = (v) => (v === undefined || v === "" ? null : v);
const txt = (v) => {
  const s = String(v ?? "").trim();
  return s || null;
};

// ───────────────────────── Secciones comunes ─────────────────────────

export function fechaHoraSV(d = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/El_Salvador", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(d).map((x) => [x.type, x.value])
  );
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}:${p.second}` };
}

// Sección 1 · Identificación. "fusion" solo existe en NCE, NDE, CRE y CLE.
export function identificacionV2(tipoDte, { numeroControl, codigoGeneracion, fecha, hora, ambiente = null } = {}) {
  const t = TIPOS_DTE_V2[tipoDte];
  const fh = fechaHoraSV();
  const id = {
    version: t.version,
    ambiente,
    tipoDte,
    numeroControl,
    codigoGeneracion: codigoGeneracion || generarCodigoGeneracion(),
    tipoModelo: 1,
    tipoOperacion: 1,
    tipoContingencia: null,
    motivoContin: null,
    fecEmi: fecha || fh.fecha,
    horEmi: hora || fh.hora,
    tipoMoneda: "USD",
  };
  if (["05", "06", "07", "08"].includes(tipoDte)) id.fusion = null;
  // DCLE, CLE y CDE no llevan tipo de contingencia (Anexo II, campos 8 y 9)
  if (["08", "09", "15"].includes(tipoDte)) {
    delete id.tipoContingencia;
    delete id.motivoContin;
  }
  return id;
}

export function numeroControlV2(tipoDte, empresa, correlativo) {
  return generarNumeroControl({
    tipoDte,
    codEstablecimiento: empresa?.cod_establecimiento,
    codPuntoVenta: empresa?.cod_punto_venta,
    correlativo,
  });
}

// Dirección completa de la v2: departamento, municipio, distrito y complemento (que incluye el nombre del distrito)
export function direccionV2(d) {
  if (!d) return null;
  return {
    departamento: txt(d.departamento),
    municipio: txt(d.municipio),
    distrito: txt(d.distrito),
    complemento: txt(d.complemento),
  };
}

// Sección 3 · Emisor. v2 ya no lleva tipoEstablecimiento, codEstableMH ni codPuntoVentaMH.
// extra: campos propios de cada documento (FEXE: tipoItemExpor, recintoFiscal, tipoRegimen, regimen).
export function emisorV2(tipoDte, empresa, extra = {}) {
  const base = {
    nit: soloDigitos(empresa?.nit) || null,
    nrc: normalizarNrc(empresa?.nrc) || null,
    nombre: txt(empresa?.nombre),
    codActividad: txt(empresa?.cod_actividad),
    descActividad: txt(empresa?.desc_actividad),
    nombreComercial: txt(empresa?.nombre_comercial),
    direccion: direccionV2({
      departamento: empresa?.cod_departamento,
      municipio: empresa?.cod_municipio,
      distrito: empresa?.cod_distrito,
      complemento: empresa?.direccion,
    }),
    telefono: txt(empresa?.telefono_emisor),
    correo: txt(empresa?.correo_emisor),
  };
  if (tipoDte === "15") {
    // Donatario: se identifica con el NIT (tipo de documento 36)
    base.tipoDocumento = "36";
    base.numDocumento = base.nit;
  }
  // Código interno de establecimiento / punto de venta (opcional; no los del Ministerio)
  base.codEstable = txt(empresa?.cod_estable_interno);
  base.codPuntoVenta = txt(empresa?.cod_punto_venta_interno);
  if (tipoDte === "11") {
    base.tipoItemExpor = extra.tipoItemExpor ?? 1; // CAT-011 (1 bienes, 2 servicios; 3 y 4 no aplican)
    base.recintoFiscal = nul(extra.recintoFiscal); // CAT-027 (null si tipoItemExpor = 2)
    base.tipoRegimen = nul(extra.tipoRegimen); // CAT-033
    base.regimen = nul(extra.regimen); // CAT-028
  }
  return base;
}

// Sección 4 · Receptor. Cada documento usa un subconjunto distinto de campos (Anexo II, columna "Documento").
// r: { tipoDocumento, numDocumento, nit, nrc, nombre, nombreComercial, codActividad, descActividad,
//      direccion:{departamento,municipio,distrito,complemento}, telefono, correo,
//      bienTitulo, codDomiciliado, codPais, nombrePais, tipoPersona, tipoEstablecimiento }
export function receptorV2(tipoDte, r = {}) {
  const dir = direccionV2(r.direccion);
  const comun = { telefono: txt(r.telefono), correo: txt(r.correo) };
  switch (tipoDte) {
    case "05": // NCE
    case "06": // NDE: tipo de documento del DTE que se ajusta (CCFE → 36 NIT)
    case "07": // CRE: sujeto de retención
    case "04": // NRE
      return {
        tipoDocumento: txt(r.tipoDocumento) || "36",
        numDocumento: soloDigitos(r.numDocumento) || null,
        nrc: normalizarNrc(r.nrc) || null,
        nombre: txt(r.nombre),
        nombreComercial: txt(r.nombreComercial),
        codActividad: txt(r.codActividad),
        descActividad: txt(r.descActividad),
        ...(tipoDte === "04" ? { bienTitulo: txt(r.bienTitulo) } : {}),
        direccion: dir,
        ...comun,
      };
    case "08": // CLE: mandante
      return {
        tipoDocumento: txt(r.tipoDocumento) || "36",
        numDocumento: soloDigitos(r.numDocumento) || null,
        nrc: normalizarNrc(r.nrc) || null,
        nombre: txt(r.nombre),
        nombreComercial: txt(r.nombreComercial),
        codActividad: txt(r.codActividad),
        descActividad: txt(r.descActividad),
        codDomiciliado: r.codDomiciliado ?? 1, // CAT-032
        direccion: dir,
        ...comun,
      };
    case "09": // DCLE: afiliado
      return {
        nit: soloDigitos(r.nit || r.numDocumento) || null,
        nrc: normalizarNrc(r.nrc) || null,
        nombre: txt(r.nombre),
        nombreComercial: txt(r.nombreComercial),
        tipoEstablecimiento: txt(r.tipoEstablecimiento) || "02", // CAT-009
        codActividad: txt(r.codActividad),
        descActividad: txt(r.descActividad),
        direccion: dir,
        ...comun,
      };
    case "11": // FEXE: cliente del exterior
      return {
        tipoDocumento: txt(r.tipoDocumento),
        numDocumento: txt(r.numDocumento),
        nombre: txt(r.nombre),
        nombreComercial: txt(r.nombreComercial),
        descActividad: txt(r.descActividad),
        codPais: txt(r.codPais), // CAT-020
        nombrePais: txt(r.nombrePais),
        direccion: { complemento: txt(r.direccion?.complemento ?? r.complemento) },
        tipoPersona: r.tipoPersona ?? 1, // CAT-029
        ...comun,
      };
    case "15": // CDE: donante
      return {
        tipoDocumento: txt(r.tipoDocumento),
        numDocumento: txt(r.numDocumento),
        nrc: normalizarNrc(r.nrc) || null,
        nombre: txt(r.nombre),
        codActividad: txt(r.codActividad),
        descActividad: txt(r.descActividad),
        direccion: dir,
        codPais: txt(r.codPais),
        codDomiciliado: r.codDomiciliado ?? 1,
        ...comun,
      };
    default:
      throw new Error(`Tipo de DTE no soportado en v2: ${tipoDte}`);
  }
}

// Sección 2 · Documentos relacionados (máx. 50, todos del mismo tipo)
export function documentosRelacionadosV2(lista) {
  if (!lista?.length) return null;
  return lista.map((d) => ({
    tipoDocumento: String(d.tipoDocumento).padStart(2, "0"), // CAT-002
    tipoGeneracion: Number(d.tipoGeneracion ?? 2), // CAT-007: 1 físico, 2 electrónico
    numeroDocumento: String(d.numeroDocumento),
    fechaEmision: d.fechaEmision,
  }));
}

// Sección 5 · Documentos asociados (otrosDocumentos). Solo CDE lo exige.
export function otrosDocumentosV2(lista) {
  if (!lista?.length) return null;
  return lista.map((d) => ({
    codDocAsociado: d.codDocAsociado ?? null, // CAT-021
    descDocumento: txt(d.descDocumento),
    detalleDocumento: txt(d.detalleDocumento),
    medico: d.medico ?? null,
    modoTransp: d.modoTransp ?? null,
    placaTrans: txt(d.placaTrans),
    numConductor: txt(d.numConductor),
    nombreConductor: txt(d.nombreConductor),
  }));
}

export function apendiceV2(lista) {
  if (!lista?.length) return null;
  return lista.slice(0, 10).map((a) => ({ campo: txt(a.campo), etiqueta: txt(a.etiqueta), valor: txt(a.valor) }));
}

// ───────────────────── Cuerpo de documentos con ítems de venta ─────────────────────
// Ítem de venta (NDE, NRE, FEXE): { tipoItem, codigo, descripcion, cantidad, uniMedida, precio (sin IVA),
//   descuento, tipoVenta: "gravada"|"exenta"|"nosujeta", numeroDocumento, noGravado }
function itemsVenta(tipoDte, items) {
  return items.map((it, i) => {
    const cantidad = Number(it.cantidad ?? 1);
    const precio = Number(it.precio ?? 0);
    const desc = r8(it.descuento ?? 0);
    const neto = r8(precio * cantidad - desc);
    const venta = it.tipoVenta || "gravada";
    const base = {
      numItem: i + 1,
      tipoItem: it.tipoItem ?? 1, // CAT-011
      ...(tipoDte === "05" || tipoDte === "06" || tipoDte === "04" ? { numeroDocumento: nul(it.numeroDocumento) } : {}),
      cantidad,
      codigo: txt(it.codigo),
      codTributo: null,
      uniMedida: Number(it.uniMedida ?? 99), // CAT-014
      descripcion: txt(it.descripcion),
      precioUni: r8(precio),
      montoDescu: desc,
      ventaNoSuj: venta === "nosujeta" ? neto : 0,
      ventaExenta: venta === "exenta" ? neto : 0,
      ventaGravada: venta === "gravada" ? neto : 0,
    };
    if (tipoDte === "11") {
      // Exportación: todo es venta gravada a tasa 0 (tributo C3); no hay exentas ni no sujetas
      base.ventaGravada = neto;
      delete base.ventaNoSuj;
      delete base.ventaExenta;
      delete base.numeroDocumento;
      base.tributos = ["C3"];
      base.noGravado = r8(it.noGravado ?? 0);
    } else if (tipoDte === "05" || tipoDte === "06") {
      base.tributos = base.ventaGravada > 0 ? ["20"] : null;
      base.noGravado = r8(it.noGravado ?? 0);
      base.ivaPerci = it.ivaPerci ? r8(base.ventaGravada * 0.01) : 0;
      base.totaliva = it.ajustaCR ? r8(base.ventaGravada * IVA) : 0;
      base.ivaRete = it.ivaRete ? r8(base.ventaGravada * 0.01) : 0;
    } else if (tipoDte === "04") {
      base.tributos = base.ventaGravada > 0 ? ["20"] : null;
    }
    return base;
  });
}

const suma = (arr, k) => r2(arr.reduce((s, x) => s + Number(x[k] || 0), 0));

function resumenTributos(tipoDte, totalGravada, esExportacion) {
  if (esExportacion) return [{ codigo: "C3", descripcion: TRIBUTO_EXPORTACION.descripcion, valor: 0 }];
  if (totalGravada > 0) return [{ codigo: "20", descripcion: TRIBUTO_IVA.descripcion, valor: r2(totalGravada * IVA) }];
  return null;
}

// ───────────────────────── 05 · Nota de crédito / 06 · Nota de débito ─────────────────────────
// Ambas comparten estructura (Anexo II: columnas NCE y NDE). documentos: DTE que se ajustan (CCFE o CRE), del mismo tipo.
// ivaOverride: IVA ya calculado por el sistema contable (si difiere en centavos del 13% recalculado).
function construirAjuste(tipoDte, { empresa, numeroControl, codigoGeneracion, fecha, hora, receptor, documentos, items, condicion = 1, observaciones = null, totalLetras = null, apendice = null, ivaOverride = null }) {
  const cuerpo = itemsVenta(tipoDte, items);
  const totalNoSuj = suma(cuerpo, "ventaNoSuj");
  const totalExenta = suma(cuerpo, "ventaExenta");
  const totalGravada = suma(cuerpo, "ventaGravada");
  const subTotalVentas = r2(totalNoSuj + totalExenta + totalGravada);
  const tributos = resumenTributos(tipoDte, totalGravada, false);
  if (tributos && ivaOverride != null) tributos[0].valor = r2(ivaOverride);
  const iva = tributos ? tributos[0].valor : 0;
  const montoTotalOperacion = r2(subTotalVentas + iva);
  const ivaPerci = suma(cuerpo, "ivaPerci");
  const ivaRete = suma(cuerpo, "ivaRete");
  const totalNoGravado = suma(cuerpo, "noGravado");
  const totalPagar = r2(montoTotalOperacion + ivaPerci - ivaRete + totalNoGravado);
  const resumen = {
    totalNoSuj, totalExenta, totalGravada, subTotalVentas,
    totalDescu: suma(cuerpo, "montoDescu"),
    tributos,
    ivaPerci, codigoRetencionMH: null, ivaRete,
    totaliva: suma(cuerpo, "totaliva"),
    montoTotalOperacion,
    totalNoGravado,
    totalPagar,
    totalLetras: totalLetras || null,
    condicionOperacion: condicion, // CAT-016
  };
  if (tipoDte === "06") resumen.numPagoElectronico = null; // solo la nota de débito
  resumen.observaciones = txt(observaciones);
  return {
    identificacion: identificacionV2(tipoDte, { numeroControl, codigoGeneracion, fecha, hora }),
    documentoRelacionado: documentosRelacionadosV2(documentos),
    emisor: emisorV2(tipoDte, empresa),
    receptor: receptorV2(tipoDte, receptor),
    ventaTercero: null,
    cuerpoDocumento: cuerpo,
    resumen,
    apendice: apendiceV2(apendice),
  };
}

export const construirNotaDebito = (args) => construirAjuste("06", args);
export const construirNotaCredito = (args) => construirAjuste("05", args);

// ───────────────────────── 11 · Factura de exportación ─────────────────────────
export function construirFacturaExportacion({
  empresa, numeroControl, codigoGeneracion, fecha, hora, emisorExtra, receptor, documentos, items,
  descuentoGlobal = 0, seguro = 0, flete = 0, noOnerosas = 0, condicion = 1, pagos = null,
  codIncoterms = null, descIncoterms = null, otrosDocumentos = null, observaciones = null, totalLetras = null, apendice = null,
}) {
  const cuerpo = itemsVenta("11", items);
  const totalGravada = suma(cuerpo, "ventaGravada");
  const descuGravada = r2(descuentoGlobal);
  const totalNoGravado = suma(cuerpo, "noGravado");
  const base = r2(totalGravada - descuGravada + Number(seguro) + Number(flete));
  const totalDescu = r2(suma(cuerpo, "montoDescu") + descuGravada);
  const montoTotalOperacion = base; // tributo C3 = 0
  const totalPagar = r2(montoTotalOperacion + totalNoGravado);
  const resumen = {
    totalGravada,
    descuGravada,
    porcentajeDescuento: 0,
    totalDescu,
    tributos: resumenTributos("11", totalGravada, true),
    seguro: r2(seguro),
    flete: r2(flete),
    montoTotalOperacion,
    totalNoGravado,
    totalPagar,
    totalLetras: totalLetras || null,
    totalNoOnerosas: r2(noOnerosas),
    saldoFavor: 0,
    condicionOperacion: condicion,
    pagos: pagos || null,
    numPagoElectronico: null,
    codIncoterms: nul(codIncoterms), // CAT-031
    descIncoterms: nul(descIncoterms),
    observaciones: txt(observaciones),
  };
  return {
    identificacion: identificacionV2("11", { numeroControl, codigoGeneracion, fecha, hora }),
    documentoRelacionado: documentosRelacionadosV2(documentos),
    emisor: emisorV2("11", empresa, emisorExtra),
    receptor: receptorV2("11", receptor),
    otrosDocumentos: otrosDocumentosV2(otrosDocumentos),
    ventaTercero: null,
    cuerpoDocumento: cuerpo,
    resumen,
    apendice: apendiceV2(apendice),
  };
}

// ───────────────────────── 04 · Nota de remisión ─────────────────────────
export function construirNotaRemision({ empresa, numeroControl, codigoGeneracion, fecha, hora, receptor, documentos, items, descuentoGlobal = {}, observaciones = null, totalLetras = null, apendice = null }) {
  const cuerpo = itemsVenta("04", items);
  const totalNoSuj = suma(cuerpo, "ventaNoSuj");
  const totalExenta = suma(cuerpo, "ventaExenta");
  const totalGravada = suma(cuerpo, "ventaGravada");
  const descuNoSuj = r2(descuentoGlobal.noSuj || 0);
  const descuExenta = r2(descuentoGlobal.exenta || 0);
  const descuGravada = r2(descuentoGlobal.gravada || 0);
  const subTotalVentas = r2(totalNoSuj + totalExenta + totalGravada);
  const subTotal = r2(subTotalVentas - descuNoSuj - descuExenta - descuGravada);
  const gravadaNeta = r2(totalGravada - descuGravada);
  const tributos = resumenTributos("04", gravadaNeta, false);
  const iva = tributos ? tributos[0].valor : 0;
  return {
    identificacion: identificacionV2("04", { numeroControl, codigoGeneracion, fecha, hora }),
    documentoRelacionado: documentosRelacionadosV2(documentos),
    emisor: emisorV2("04", empresa),
    receptor: receptorV2("04", receptor),
    ventaTercero: null,
    cuerpoDocumento: cuerpo,
    resumen: {
      totalNoSuj, totalExenta, totalGravada, subTotalVentas,
      descuNoSuj, descuExenta, descuGravada,
      porcentajeDescuento: 0,
      totalDescu: r2(suma(cuerpo, "montoDescu") + descuNoSuj + descuExenta + descuGravada),
      tributos,
      subTotal,
      montoTotalOperacion: r2(subTotal + iva),
      totalLetras: totalLetras || null,
      observaciones: txt(observaciones),
    },
    apendice: apendiceV2(apendice),
  };
}

// ───────────────────────── 07 · Comprobante de retención ─────────────────────────
// retenciones: [{ tipoDte, tipoGeneracion, numeroDocumento, fechaEmision, montoSujetoGrav, codigoRetencionMH, ivaRetenido? }]
// Una fila por documento retenido (máx. 500), todos del mismo tipo de documento.
export function construirComprobanteRetencion({ empresa, numeroControl, codigoGeneracion, fecha, hora, receptor, retenciones, totalIva13 = null, observaciones = null, totalLetras = null, apendice = null }) {
  const cuerpo = retenciones.map((x, i) => {
    const codigo = String(x.codigoRetencionMH);
    const pct = RETENCION_IVA[codigo];
    const monto = r2(x.montoSujetoGrav);
    const ivaRetenido = pct == null ? r2(x.ivaRetenido) : r2(monto * pct);
    return {
      numItem: i + 1,
      tipoDte: String(x.tipoDte).padStart(2, "0"),
      tipoDoc: Number(x.tipoGeneracion ?? 2),
      numDocumento: String(x.numeroDocumento),
      fechaEmision: x.fechaEmision,
      montoSujetoGrav: monto,
      codigoRetencionMH: codigo,
      ivaRetenido,
      descripcion: null,
    };
  });
  const totalSujetoRetencion = suma(cuerpo, "montoSujetoGrav");
  const totalIVAretenido = suma(cuerpo, "ivaRetenido");
  return {
    identificacion: identificacionV2("07", { numeroControl, codigoGeneracion, fecha, hora }),
    emisor: emisorV2("07", empresa),
    receptor: receptorV2("07", receptor),
    cuerpoDocumento: cuerpo,
    resumen: {
      totalSujetoRetencion,
      totalIVAretenido,
      totalLetras: totalLetras || null,
      // IVA 13% de uso informativo; se envía 0.00 cuando la operación no está afecta (art. 162 inc. 7° CT)
      totalIva: totalIva13 == null ? r2(totalSujetoRetencion * IVA) : r2(totalIva13),
    },
    apendice: apendiceV2(apendice),
  };
}

// ───────────────────────── 08 · Comprobante de liquidación ─────────────────────────
// liquidados: [{ tipoDte, tipoGeneracion, numeroDocumento, fechaEmision, ventaNoSuj, ventaExenta, ventaGravada,
//                exportaciones, ivaItem, obsItem, tributos }]  (anulados/invalidados con valores negativos)
export function construirComprobanteLiquidacion({ empresa, numeroControl, codigoGeneracion, fecha, hora, receptor, liquidados, ivaPercibido = 0, condicion = 1, observaciones = null, totalLetras = null, apendice = null }) {
  const cuerpo = liquidados.map((x, i) => ({
    numItem: i + 1,
    tipoDte: String(x.tipoDte).padStart(2, "0"),
    tipoGeneracion: Number(x.tipoGeneracion ?? 2),
    numeroDocumento: String(x.numeroDocumento),
    fechaGeneracion: x.fechaEmision,
    ventaNoSuj: r2(x.ventaNoSuj),
    ventaExenta: r2(x.ventaExenta),
    ventaGravada: r2(x.ventaGravada),
    exportaciones: r2(x.exportaciones),
    tributos: x.tributos || (r2(x.ventaGravada) !== 0 ? ["20"] : null),
    ivaItem: x.ivaItem == null ? r2(x.ventaGravada * IVA) : r2(x.ivaItem),
    obsItem: txt(x.obsItem),
  }));
  const totalNoSuj = suma(cuerpo, "ventaNoSuj");
  const totalExenta = suma(cuerpo, "ventaExenta");
  const totalGravada = suma(cuerpo, "ventaGravada");
  const totalExportacion = suma(cuerpo, "exportaciones");
  const subTotalVentas = r2(totalNoSuj + totalExenta + totalGravada + totalExportacion);
  const iva = suma(cuerpo, "ivaItem");
  const tributos = totalGravada !== 0 ? [{ codigo: "20", descripcion: TRIBUTO_IVA.descripcion, valor: r2(totalGravada * IVA) }] : null;
  const montoTotalOperacion = r2(subTotalVentas + (tributos ? tributos[0].valor : 0));
  return {
    identificacion: identificacionV2("08", { numeroControl, codigoGeneracion, fecha, hora }),
    emisor: emisorV2("08", empresa),
    receptor: receptorV2("08", receptor),
    cuerpoDocumento: cuerpo,
    resumen: {
      totalNoSuj, totalExenta, totalGravada, totalExportacion, subTotalVentas,
      tributos,
      montoTotalOperacion,
      ivaPerci: r2(ivaPercibido),
      total: r2(montoTotalOperacion + Number(ivaPercibido || 0)),
      totalLetras: totalLetras || null,
      condicionOperacion: condicion,
      observaciones: txt(observaciones),
    },
    apendice: apendiceV2(apendice),
  };
}

// ───────────────────────── 09 · Documento contable de liquidación ─────────────────────────
// liquidacion: { fechaInicio, fechaFin, codLiquidacion, cantidadDoc, valorOperaciones, montoSinPercepcion,
//                descripSinPercepcion, comision, porcentComision, observaciones }
// responsable: { nombEntrega, docuEntrega, codEmpleado }
export function construirDocContableLiquidacion({ empresa, numeroControl, codigoGeneracion, fecha, hora, receptor, liquidacion: l, responsable, totalLetras = null, apendice = null }) {
  const valorOperaciones = r2(l.valorOperaciones);
  const montoSinPercepcion = r2(l.montoSinPercepcion || 0);
  const subTotal = r2(valorOperaciones - montoSinPercepcion);
  const iva = r2(subTotal * IVA);
  const montoSujetoPercepcion = subTotal;
  const ivaPercibido = r2(montoSujetoPercepcion * 0.02);
  const comision = r2(l.comision || 0);
  const ivaComision = r2(comision * IVA);
  const liquidoApagar = r2(valorOperaciones - comision - ivaPercibido - ivaComision);
  return {
    identificacion: identificacionV2("09", { numeroControl, codigoGeneracion, fecha, hora }),
    emisor: emisorV2("09", empresa),
    receptor: receptorV2("09", receptor),
    cuerpoDocumento: {
      periodoLiquidacionFechaInicio: l.fechaInicio,
      periodoLiquidacionFechaFin: l.fechaFin,
      codLiquidacion: txt(l.codLiquidacion),
      cantidadDoc: l.cantidadDoc ?? null,
      valorOperaciones,
      montoSinPercepcion,
      descripSinPercepcion: txt(l.descripSinPercepcion),
      subTotal,
      iva,
      montoSujetoPercepcion,
      ivaPercibido,
      comision,
      porcentComision: l.porcentComision == null ? null : String(l.porcentComision),
      ivaComision,
      liquidoApagar,
      totalLetras: totalLetras || null,
      observaciones: txt(l.observaciones),
    },
    extension: {
      nombEntrega: txt(responsable?.nombEntrega),
      docuEntrega: txt(responsable?.docuEntrega),
      codEmpleado: txt(responsable?.codEmpleado),
    },
    apendice: apendiceV2(apendice),
  };
}

// ───────────────────────── 15 · Comprobante de donación ─────────────────────────
// donaciones: [{ tipoDonacion (CAT-026: 1 efectivo, 2 bien, 3 servicio), codigo, descripcion, cantidad, uniMedida,
//                valorUni, depreciacion }]
// pagos: solo cuando hay donación en efectivo (tipoDonacion 1).
export function construirComprobanteDonacion({ empresa, numeroControl, codigoGeneracion, fecha, hora, donante, donaciones, pagos = null, resolucion, totalLetras = null, apendice = null }) {
  const cuerpo = donaciones.map((d, i) => {
    const efectivo = Number(d.tipoDonacion) === 1;
    const cantidad = efectivo ? 1 : Number(d.cantidad ?? 1);
    const valorUni = r8(d.valorUni);
    const depreciacion = Number(d.tipoDonacion) === 2 ? r8(d.depreciacion || 0) : 0;
    return {
      numItem: i + 1,
      tipoDonacion: Number(d.tipoDonacion),
      cantidad,
      codigo: txt(d.codigo),
      uniMedida: efectivo ? 99 : Number(d.uniMedida ?? 99),
      descripcion: txt(d.descripcion),
      depreciacion,
      valorUni,
      valor: r8(valorUni * cantidad - depreciacion),
    };
  });
  const valorTotal = suma(cuerpo, "valor");
  return {
    identificacion: identificacionV2("15", { numeroControl, codigoGeneracion, fecha, hora }),
    emisor: emisorV2("15", empresa),
    receptor: receptorV2("15", donante),
    // Obligatorio: datos de la resolución de conformidad con el art. 6 LISR del donatario
    otrosDocumentos: otrosDocumentosV2([{ codDocAsociado: 1, descDocumento: resolucion?.descripcion, detalleDocumento: resolucion?.detalle }]),
    cuerpoDocumento: cuerpo,
    resumen: {
      valorTotal,
      totalLetras: totalLetras || null,
      pagos: pagos || null,
    },
    apendice: apendiceV2(apendice),
  };
}

// ───────────────────────── Validación ─────────────────────────
const UUID = /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/;
const NUM_CONTROL = /^DTE-\d{2}-[A-Z0-9]{8}-\d{15}$/;
const cerca = (a, b) => Math.abs(Number(a) - Number(b)) <= HOLGURA + 1e-9;

// Devuelve una lista de textos con lo que incumple (vacía si todo está en orden).
export function validarDteV2(dte) {
  const e = [];
  const id = dte?.identificacion || {};
  const t = TIPOS_DTE_V2[id.tipoDte];
  if (!t) return [`Tipo de documento no soportado: ${id.tipoDte}.`];
  const falta = (ruta, v) => {
    if (v === null || v === undefined || v === "") e.push(`Falta ${ruta}.`);
  };

  if (id.version !== t.version) e.push(`La versión del ${t.sigla} debe ser ${t.version}.`);
  if (!["00", "01", null].includes(id.ambiente)) e.push("Ambiente inválido (00 pruebas, 01 producción).");
  if (!UUID.test(String(id.codigoGeneracion))) e.push("El código de generación debe ser UUID v4 en mayúsculas.");
  if (!NUM_CONTROL.test(String(id.numeroControl)) || !String(id.numeroControl).startsWith(`DTE-${id.tipoDte}-`))
    e.push("Número de control inválido (DTE-tipo-8 caracteres-15 dígitos).");
  if (id.tipoMoneda !== "USD") e.push("El tipo de moneda debe ser USD.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(id.fecEmi))) e.push("Fecha de generación inválida (YYYY-MM-DD).");
  if (!/^\d{2}:\d{2}:\d{2}$/.test(String(id.horEmi))) e.push("Hora de generación inválida (HH:MM:SS).");

  const em = dte.emisor || {};
  const nitOk = (v) => /^\d{9}$|^\d{14}$/.test(String(v ?? ""));
  if (!nitOk(em.nit)) e.push("NIT del emisor: 9 o 14 dígitos sin guiones.");
  if (["01", "03", "05", "06", "08", "09"].includes(id.tipoDte) && !em.nrc) e.push("Falta el NRC del emisor.");
  if (/^0/.test(String(em.nrc ?? ""))) e.push("El NRC del emisor no lleva ceros a la izquierda.");
  for (const k of ["nombre", "codActividad", "descActividad", "telefono", "correo"]) falta(`emisor.${k}`, em[k]);
  for (const k of ["departamento", "municipio", "distrito", "complemento"]) falta(`emisor.direccion.${k}`, em.direccion?.[k]);
  if (em.telefono && String(em.telefono).length < 8) e.push("El teléfono del emisor debe tener al menos 8 caracteres.");
  if ("tipoEstablecimiento" in em || "codEstableMH" in em || "codPuntoVentaMH" in em)
    e.push("La versión 2.0 ya no usa tipoEstablecimiento, codEstableMH ni codPuntoVentaMH en el emisor.");

  const rc = dte.receptor || {};
  falta("receptor.nombre", rc.nombre);

  switch (id.tipoDte) {
    case "01": case "03": validarVenta(dte, e, falta); break;
    case "14": validarFse(dte, e, falta); break;
    case "05": case "06": validarNde(dte, e, falta); break;
    case "11": validarFexe(dte, e, falta); break;
    case "04": validarNre(dte, e, falta); break;
    case "07": validarCre(dte, e, falta); break;
    case "08": validarCle(dte, e, falta); break;
    case "09": validarDcle(dte, e, falta); break;
    case "15": validarCde(dte, e, falta); break;
  }
  return e;
}

function validarDocRel(dte, e, requerido) {
  const dr = dte.documentoRelacionado;
  if (!dr?.length) {
    if (requerido) e.push("Se requiere al menos un documento relacionado.");
    return;
  }
  if (dr.length > 50) e.push("Máximo 50 documentos relacionados.");
  if (new Set(dr.map((d) => d.tipoDocumento)).size > 1) e.push("Los documentos relacionados deben ser del mismo tipo.");
}

function sumasVenta(cuerpo, e, esperado, etiqueta) {
  for (const k of ["ventaNoSuj", "ventaExenta", "ventaGravada"]) {
    const s = r2(cuerpo.reduce((x, it) => x + Number(it[k] || 0), 0));
    const campo = { ventaNoSuj: "totalNoSuj", ventaExenta: "totalExenta", ventaGravada: "totalGravada" }[k];
    if (campo in esperado && !cerca(esperado[campo], s)) e.push(`${etiqueta}: ${campo} (${esperado[campo]}) no coincide con la suma de los ítems (${s}).`);
  }
}

function validarItems(cuerpo, e, max = 2000) {
  if (!cuerpo?.length) return e.push("El cuerpo del documento no tiene ítems.");
  if (cuerpo.length > max) e.push(`Máximo ${max} ítems.`);
  cuerpo.forEach((it, i) => {
    if (it.numItem !== i + 1) e.push(`Ítem ${i + 1}: numeración consecutiva.`);
    if (it.descripcion !== undefined && !it.descripcion) e.push(`Ítem ${i + 1}: falta la descripción.`);
    if ("cantidad" in it && !(Number(it.cantidad) > 0)) e.push(`Ítem ${i + 1}: la cantidad debe ser mayor que cero.`);
    if ("precioUni" in it && Number(it.precioUni) < 0) e.push(`Ítem ${i + 1}: el precio no puede ser negativo.`);
    if ("montoDescu" in it) {
      const bruto = Number(it.precioUni) * Number(it.cantidad);
      if (Number(it.montoDescu) < 0 || Number(it.montoDescu) > bruto + HOLGURA) e.push(`Ítem ${i + 1}: descuento inválido.`);
    }
  });
}

function validarNde(dte, e, falta) {
  const { cuerpoDocumento: c = [], resumen: s = {} } = dte;
  validarDocRel(dte, e, true); // obligatorio en NDE
  validarItems(c, e);
  c.forEach((it, i) => {
    falta(`ítem ${i + 1}: numeroDocumento`, it.numeroDocumento);
    const neto = r2(it.precioUni * it.cantidad - it.montoDescu);
    const suma3 = r2(it.ventaNoSuj + it.ventaExenta + it.ventaGravada);
    if (!cerca(neto, suma3)) e.push(`Ítem ${i + 1}: ventas ≠ (precio × cantidad) − descuento.`);
    if (it.ventaGravada > 0 && !(it.tributos || []).includes("20")) e.push(`Ítem ${i + 1}: con ventas gravadas se requiere el tributo 20.`);
  });
  if (![1, 2, 3].includes(Number(s.condicionOperacion))) e.push("Condición de la operación inválida (CAT-016).");
  sumasVenta(c, e, s, "Resumen");
  if (!cerca(s.subTotalVentas, s.totalNoSuj + s.totalExenta + s.totalGravada)) e.push("subTotalVentas ≠ suma de operaciones.");
  const iva = s.tributos?.find((x) => x.codigo === "20")?.valor || 0;
  if (!cerca(iva, s.totalGravada * IVA)) e.push("El IVA (tributo 20) debe ser 13% de las ventas gravadas.");
  if (!cerca(s.montoTotalOperacion, s.subTotalVentas + iva)) e.push("montoTotalOperacion ≠ suma de operaciones + IVA.");
  if (!cerca(s.totalPagar, s.montoTotalOperacion + s.ivaPerci - s.ivaRete + s.totalNoGravado)) e.push("totalPagar no cuadra con el monto total, IVA percibido/retenido y cargos.");
}

function validarFexe(dte, e, falta) {
  const { cuerpoDocumento: c = [], resumen: s = {}, emisor: em = {}, receptor: rc = {} } = dte;
  validarItems(c, e);
  if (![1, 2].includes(em.tipoItemExpor)) e.push("Tipo de exportación: solo 1 (bienes) o 2 (servicios).");
  if (em.tipoItemExpor === 1) {
    falta("emisor.recintoFiscal", em.recintoFiscal);
    falta("emisor.tipoRegimen", em.tipoRegimen);
    falta("emisor.regimen", em.regimen);
  } else if (em.recintoFiscal || em.tipoRegimen || em.regimen) {
    e.push("Recinto fiscal, tipo de régimen y régimen deben ir nulos en servicios.");
  }
  for (const k of ["tipoDocumento", "numDocumento", "codPais", "nombrePais", "descActividad", "tipoPersona"]) falta(`receptor.${k}`, rc[k]);
  falta("receptor.direccion.complemento", rc.direccion?.complemento);
  c.forEach((it, i) => {
    if (!(it.tributos || []).includes("C3")) e.push(`Ítem ${i + 1}: la exportación lleva el tributo C3.`);
    if (!cerca(it.ventaGravada, it.precioUni * it.cantidad - it.montoDescu)) e.push(`Ítem ${i + 1}: ventaGravada ≠ (precio × cantidad) − descuento.`);
  });
  const sg = r2(c.reduce((x, it) => x + it.ventaGravada, 0));
  if (!cerca(s.totalGravada, sg)) e.push("totalGravada ≠ suma de ítems.");
  if (!cerca(s.montoTotalOperacion, s.totalGravada - s.descuGravada + s.seguro + s.flete)) e.push("montoTotalOperacion ≠ gravadas − descuento + seguro + flete.");
  if (!cerca(s.totalPagar, s.montoTotalOperacion + s.totalNoGravado)) e.push("totalPagar ≠ monto total ± cargos no gravados.");
  if (s.totalNoOnerosas > s.montoTotalOperacion + HOLGURA) e.push("Transferencias no onerosas no puede superar el monto total.");
  if (em.tipoItemExpor === 1) {
    falta("resumen.codIncoterms", s.codIncoterms);
    falta("resumen.descIncoterms", s.descIncoterms);
  } else if (s.codIncoterms || s.descIncoterms) e.push("INCOTERMS debe ir nulo en servicios.");
  if (s.condicionOperacion === 2 && s.pagos?.some((p) => p.montoPago !== 0)) e.push("Con crédito el monto de pago debe ser 0.00.");
  if ([1, 3].includes(s.condicionOperacion) && s.pagos?.length) {
    const sp = r2(s.pagos.reduce((x, p) => x + Number(p.montoPago || 0), 0));
    if (!cerca(sp, s.totalPagar)) e.push("La suma de las formas de pago debe ser igual al total a pagar.");
  }
  validarDocRel(dte, e, false);
}

function validarNre(dte, e, falta) {
  const { cuerpoDocumento: c = [], resumen: s = {} } = dte;
  validarItems(c, e);
  falta("receptor.bienTitulo", dte.receptor?.bienTitulo);
  validarDocRel(dte, e, false);
  sumasVenta(c, e, s, "Resumen");
  const sub = r2(s.totalNoSuj + s.totalExenta + s.totalGravada - s.descuNoSuj - s.descuExenta - s.descuGravada);
  if (!cerca(s.subTotal, sub)) e.push("subTotal ≠ operaciones − descuentos globales.");
  const iva = s.tributos?.find((x) => x.codigo === "20")?.valor || 0;
  if (!cerca(s.montoTotalOperacion, s.subTotal + iva)) e.push("montoTotalOperacion ≠ subTotal + tributos.");
  if (s.descuNoSuj > s.totalNoSuj || s.descuExenta > s.totalExenta || s.descuGravada > s.totalGravada) e.push("El descuento global no puede superar el total de la operación.");
}

function validarCre(dte, e, falta) {
  const { cuerpoDocumento: c = [], resumen: s = {} } = dte;
  if (!c.length) return e.push("Se requiere al menos un documento retenido.");
  if (c.length > 500) e.push("Máximo 500 documentos en un comprobante de retención.");
  if (new Set(c.map((x) => x.tipoDte)).size > 1) e.push("Un comprobante de retención relaciona un solo tipo de documento.");
  c.forEach((it, i) => {
    if (!["01", "03"].includes(it.tipoDte)) e.push(`Ítem ${i + 1}: solo se retiene sobre Factura (01) o CCF (03).`);
    if (!(it.montoSujetoGrav > 0)) e.push(`Ítem ${i + 1}: el monto sujeto a retención debe ser mayor que cero.`);
    if (!(it.ivaRetenido > 0)) e.push(`Ítem ${i + 1}: el IVA retenido debe ser mayor que cero.`);
    if (!(it.codigoRetencionMH in RETENCION_IVA)) e.push(`Ítem ${i + 1}: código de retención inválido (CAT-006).`);
    else if (RETENCION_IVA[it.codigoRetencionMH] != null && !cerca(it.ivaRetenido, it.montoSujetoGrav * RETENCION_IVA[it.codigoRetencionMH]))
      e.push(`Ítem ${i + 1}: IVA retenido ≠ monto × porcentaje legal.`);
    if (it.descripcion) e.push(`Ítem ${i + 1}: la descripción debe ir nula.`);
  });
  if (!cerca(s.totalSujetoRetencion, c.reduce((x, it) => x + it.montoSujetoGrav, 0))) e.push("totalSujetoRetencion ≠ suma de ítems.");
  if (!cerca(s.totalIVAretenido, c.reduce((x, it) => x + it.ivaRetenido, 0))) e.push("totalIVAretenido ≠ suma de ítems.");
  if (!(s.totalIVAretenido > 0)) e.push("Total IVA retenido debe ser mayor que cero.");
}

function validarCle(dte, e, falta) {
  const { cuerpoDocumento: c = [], resumen: s = {} } = dte;
  if (!c.length) return e.push("Se requiere al menos un documento a liquidar.");
  if (c.length > 500) e.push("Máximo 500 ítems en un comprobante de liquidación.");
  falta("receptor.codDomiciliado", dte.receptor?.codDomiciliado);
  c.forEach((it, i) => {
    if (it.ivaItem !== 0 && it.ventaGravada !== 0 && !cerca(it.ivaItem, it.ventaGravada * IVA)) e.push(`Ítem ${i + 1}: ivaItem ≠ ventas gravadas × 13%.`);
    if (it.ventaGravada !== 0 && !(it.tributos || []).includes("20")) e.push(`Ítem ${i + 1}: con ventas gravadas se requiere el tributo 20.`);
  });
  const sum = (k) => r2(c.reduce((x, it) => x + it[k], 0));
  if (!cerca(s.totalNoSuj, sum("ventaNoSuj"))) e.push("totalNoSuj ≠ suma de ítems.");
  if (!cerca(s.totalExenta, sum("ventaExenta"))) e.push("totalExenta ≠ suma de ítems.");
  if (!cerca(s.totalGravada, sum("ventaGravada"))) e.push("totalGravada ≠ suma de ítems.");
  if (!cerca(s.totalExportacion, sum("exportaciones"))) e.push("totalExportacion ≠ suma de ítems.");
  if (!cerca(s.subTotalVentas, s.totalNoSuj + s.totalExenta + s.totalGravada + s.totalExportacion)) e.push("subTotalVentas ≠ suma de operaciones.");
  const iva = s.tributos?.find((x) => x.codigo === "20")?.valor || 0;
  if (!cerca(s.montoTotalOperacion, s.subTotalVentas + iva)) e.push("montoTotalOperacion ≠ operaciones + IVA.");
  if (!cerca(s.total, s.montoTotalOperacion + s.ivaPerci)) e.push("total ≠ monto total + IVA percibido liquidado.");
}

function validarDcle(dte, e, falta) {
  const c = dte.cuerpoDocumento || {};
  const rc = dte.receptor || {};
  for (const k of ["nit", "nrc", "tipoEstablecimiento"]) falta(`receptor.${k}`, rc[k]);
  for (const k of ["periodoLiquidacionFechaInicio", "periodoLiquidacionFechaFin"]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(c[k]))) e.push(`${k}: fecha inválida (YYYY-MM-DD).`);
  }
  if (c.periodoLiquidacionFechaFin < c.periodoLiquidacionFechaInicio) e.push("La fecha fin del período no puede ser anterior a la fecha de inicio.");
  if (!(c.valorOperaciones > 0)) e.push("El valor de las operaciones a liquidar debe ser mayor que cero.");
  if (!cerca(c.subTotal, c.valorOperaciones - c.montoSinPercepcion)) e.push("subTotal ≠ operaciones − valores no sujetos a percepción.");
  if (!(c.montoSujetoPercepcion > 0)) e.push("El monto sujeto a percepción debe ser mayor que cero.");
  if (!cerca(c.ivaPercibido, c.montoSujetoPercepcion * 0.02)) e.push("IVA percibido ≠ 2% del monto sujeto a percepción.");
  if (!cerca(c.ivaComision, c.comision * IVA)) e.push("IVA de la comisión ≠ comisión × 13%.");
  if (!cerca(c.liquidoApagar, c.valorOperaciones - c.comision - c.ivaPercibido - c.ivaComision)) e.push("Valor líquido ≠ operaciones − comisión − IVA percibido − IVA comisión.");
  if (!(c.liquidoApagar > 0)) e.push("El valor líquido a pagar debe ser mayor que cero.");
  falta("extension.nombEntrega", dte.extension?.nombEntrega);
  falta("extension.docuEntrega", dte.extension?.docuEntrega);
}

function validarCde(dte, e, falta) {
  const { cuerpoDocumento: c = [], resumen: s = {}, receptor: rc = {} } = dte;
  validarItems(c, e);
  for (const k of ["tipoDocumento", "numDocumento", "codPais", "codActividad", "descActividad", "codDomiciliado"]) falta(`receptor.${k}`, rc[k]);
  if (!dte.otrosDocumentos?.length) e.push("Se requiere la resolución de conformidad con el art. 6 LISR del donatario (documentos asociados).");
  else falta("otrosDocumentos.descDocumento", dte.otrosDocumentos[0].descDocumento);
  c.forEach((it, i) => {
    if (![1, 2, 3].includes(it.tipoDonacion)) e.push(`Ítem ${i + 1}: tipo de donación inválido (CAT-026).`);
    if (it.tipoDonacion === 1 && it.cantidad !== 1) e.push(`Ítem ${i + 1}: en efectivo la cantidad es 1.`);
    if (!(it.valorUni > 0)) e.push(`Ítem ${i + 1}: el valor unitario debe ser mayor que cero.`);
    if (!cerca(it.valor, it.valorUni * it.cantidad - it.depreciacion)) e.push(`Ítem ${i + 1}: valor ≠ (valor unitario × cantidad) − depreciación.`);
  });
  if (!cerca(s.valorTotal, c.reduce((x, it) => x + it.valor, 0))) e.push("valorTotal ≠ suma de ítems.");
  if (!(s.valorTotal > 0)) e.push("El total de la donación debe ser mayor que cero.");
  if (c.some((it) => it.tipoDonacion === 1)) {
    if (!s.pagos?.length) e.push("La donación en efectivo requiere la forma de pago.");
    else if (!cerca(s.pagos.reduce((x, p) => x + p.montoPago, 0), s.valorTotal)) e.push("La suma de las formas de pago debe ser igual al total de la donación.");
  } else if (s.pagos) e.push("Las formas de pago solo aplican a donaciones en efectivo.");
}

// Factura (01 v2) y Crédito Fiscal (03 v4)
function validarVenta(dte, e, falta) {
  const { cuerpoDocumento: c = [], resumen: s = {}, receptor: rc = {}, identificacion: id } = dte;
  const ccf = id.tipoDte === "03";
  validarItems(c, e);
  if ("extension" in dte) e.push("La versión 2.0 elimina la sección extension.");
  if (ccf) {
    if (!nitOkV(rc.nit)) e.push("NIT del receptor: 9 o 14 dígitos sin guiones.");
    falta("receptor.nrc", rc.nrc);
    for (const k of ["codActividad", "descActividad"]) falta(`receptor.${k}`, rc[k]);
    for (const k of ["departamento", "municipio", "distrito", "complemento"]) falta(`receptor.direccion.${k}`, rc.direccion?.[k]);
  } else {
    if (rc.codActividad != null || rc.descActividad != null) e.push("En la Factura la actividad económica del receptor debe ir nula.");
    if (rc.numDocumento) {
      falta("receptor.tipoDocumento", rc.tipoDocumento);
      if (rc.tipoDocumento === "13" && !/^\d{9}$/.test(String(rc.numDocumento))) e.push("El DUI debe tener 9 dígitos.");
    }
  }
  if ("ivaRete1" in s || "ivaPerci1" in s || "reteRenta" in s) e.push("Resumen: en la versión 2.0 los campos son ivaRete / ivaPerci y ya no se envía reteRenta.");
  c.forEach((it, i) => {
    const neto = r2(it.precioUni * it.cantidad - it.montoDescu);
    const suma3 = r2(it.ventaNoSuj + it.ventaExenta + it.ventaGravada);
    if (!cerca(neto, suma3)) e.push(`Ítem ${i + 1}: ventas ≠ (precio × cantidad) − descuento.`);
    if (ccf && it.ventaGravada > 0 && !(it.tributos || []).includes("20")) e.push(`Ítem ${i + 1}: con ventas gravadas se requiere el tributo 20.`);
    if (!ccf && it.ventaGravada > 0 && !cerca(it.ivaItem, it.ventaGravada - it.ventaGravada / 1.13) && c.length === 1) e.push(`Ítem ${i + 1}: ivaItem ≠ ventas gravadas / 1.13 × 13%.`);
  });
  sumasVenta(c, e, s, "Resumen");
  if (!cerca(s.subTotalVentas, s.totalNoSuj + s.totalExenta + s.totalGravada)) e.push("subTotalVentas ≠ suma de operaciones.");
  const sub = r2(s.subTotalVentas - s.descuNoSuj - s.descuExenta - s.descuGravada);
  if (!cerca(s.subTotal, sub)) e.push("subTotal ≠ operaciones − descuentos globales.");
  if (ccf) {
    const iva = s.tributos?.find((x) => x.codigo === "20")?.valor || 0;
    if (!cerca(iva, (s.totalGravada - s.descuGravada) * IVA)) e.push("El IVA (tributo 20) debe ser 13% de las ventas gravadas.");
    if (!cerca(s.montoTotalOperacion, s.subTotal + iva)) e.push("montoTotalOperacion ≠ subTotal + tributos.");
    if (!cerca(s.totalPagar, s.montoTotalOperacion + s.ivaPerci - s.ivaRete + s.totalNoGravado)) e.push("totalPagar ≠ monto total + IVA percibido − IVA retenido ± cargos.");
  } else {
    if (!cerca(s.montoTotalOperacion, s.subTotal)) e.push("En la Factura montoTotalOperacion = subTotal (el IVA va incluido).");
    const ivaItems = r2(c.reduce((x, it) => x + Number(it.ivaItem || 0), 0));
    if (!cerca(s.totalIva, ivaItems)) e.push("totalIva ≠ suma del IVA por ítem.");
    if (!cerca(s.totalPagar, s.montoTotalOperacion - s.ivaRete + s.totalNoGravado)) e.push("totalPagar ≠ monto total − IVA retenido ± cargos.");
  }
  if (![1, 2, 3].includes(Number(s.condicionOperacion))) e.push("Condición de la operación inválida (CAT-016).");
  if ([1, 3].includes(Number(s.condicionOperacion)) && s.pagos?.length) {
    const sp = r2(s.pagos.reduce((x, p) => x + Number(p.montoPago || 0), 0));
    if (!cerca(sp, s.totalPagar)) e.push("La suma de las formas de pago debe ser igual al total a pagar.");
  }
  if (Number(s.condicionOperacion) === 2 && (s.pagos || []).some((p) => Number(p.montoPago) !== 0)) e.push("Con crédito el monto por forma de pago debe ser 0.00.");
}

// Factura de sujeto excluido (14 v2)
function validarFse(dte, e, falta) {
  const { cuerpoDocumento: c = [], resumen: s = {}, receptor: rc = {} } = dte;
  validarItems(c, e);
  if ("sujetoExcluido" in dte) e.push("En la versión 2.0 el sujeto excluido se informa en la sección receptor.");
  for (const k of ["tipoDocumento", "numDocumento"]) falta(`receptor.${k}`, rc[k]);
  if (rc.codActividad != null || rc.descActividad != null) e.push("La actividad económica del sujeto excluido debe ir nula.");
  for (const k of ["departamento", "municipio", "distrito", "complemento"]) falta(`receptor.direccion.${k}`, rc.direccion?.[k]);
  c.forEach((it, i) => {
    if (![1, 2, 3].includes(it.tipoItem)) e.push(`Ítem ${i + 1}: tipo de ítem inválido (el 4 no aplica).`);
    if (!cerca(it.compra, it.precioUni * it.cantidad - it.montoDescu)) e.push(`Ítem ${i + 1}: compra ≠ (precio × cantidad) − descuento.`);
  });
  if (!cerca(s.totalCompra, c.reduce((x, it) => x + it.compra, 0))) e.push("totalCompra ≠ suma de ítems.");
  if (!cerca(s.subTotal, s.totalCompra - s.descu)) e.push("subTotal ≠ total de operaciones − descuento global.");
  if (!cerca(s.totalPagar, s.subTotal - s.reteRenta)) e.push("totalPagar ≠ subTotal − retención de renta.");
  if ("ivaRete1" in s || "ivaRete" in s) e.push("El sujeto excluido ya no lleva IVA retenido.");
}
const nitOkV = (v) => /^\d{9}$|^\d{14}$/.test(String(v ?? ""));
