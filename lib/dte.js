// Utilidades para Documentos Tributarios Electrónicos (DTE) — El Salvador
// Basado en: Normativa de Cumplimiento de los DTE, Ministerio de Hacienda (v2.0)

import { TIPOS_DOCUMENTO_ID, soloDigitos, normalizarNrc } from "@/lib/datosFiscales";
import { complementoDte } from "@/lib/catalogos";

export const TIPOS_DTE = {
  "01": "Factura Electrónica",
  "03": "Comprobante de Crédito Fiscal Electrónico",
};

// Documento que el contribuyente emite al comprar a un sujeto excluido (se registra como COMPRA)
export const TIPO_DTE_SUJETO_EXCLUIDO = "14";
export const NOMBRE_SUJETO_EXCLUIDO = "Factura de Sujeto Excluido Electrónica";

// Tipo de documento del módulo de Ventas que corresponde a cada DTE.
// Factura (01): el precio incluye IVA. CCF (03): el precio se ingresa sin IVA.
export const TIPO_DOCUMENTO_VENTA = { "01": "factura", "03": "ccf" };

// Regla 7.1.1 — Código de Generación: UUID versión 4, en mayúsculas
export function generarCodigoGeneracion() {
  const uuid =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === "x" ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
  return uuid.toUpperCase();
}

// Regla 7.1.2 — Número de Control: DTE-<tipo 2>-<establecimiento+puntoventa 8>-<correlativo 15>
export function generarNumeroControl({ tipoDte, codEstablecimiento, codPuntoVenta, correlativo }) {
  // Los códigos los asigna Hacienda (ej. M001 y P001): 4 caracteres alfanuméricos cada uno.
  const estab = String(codEstablecimiento || "0001").trim().toUpperCase().padStart(4, "0").slice(0, 4);
  const punto = String(codPuntoVenta || "0001").trim().toUpperCase().padStart(4, "0").slice(0, 4);
  const corr = String(correlativo).padStart(15, "0");
  return `DTE-${tipoDte}-${estab}${punto}-${corr}`;
}

// Regla 7.1.2 — La numeración consecutiva es por establecimiento (no por punto
// de venta ni por tipo de documento) y se reinicia en 000000000000001 con el
// primer DTE de cada ejercicio impositivo (año).
export function siguienteCorrelativo(documentos, codEstablecimiento, anio) {
  const estab = String(codEstablecimiento || "0001").trim().toUpperCase().padStart(4, "0").slice(0, 4);
  let max = 0;
  for (const d of documentos || []) {
    const partes = String(d.numero_control || "").split("-");
    if (partes.length !== 4) continue;
    if (partes[2].slice(0, 4).toUpperCase() !== estab) continue;
    if (String(d.fecha_emision || "").slice(0, 4) !== String(anio)) continue;
    const n = parseInt(partes[3], 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

// Receptor según el Anexo II (sección 4):
//  - Crédito Fiscal (03): nit y nrc sin guiones, actividad económica y nombre comercial.
//  - Factura (01): tipoDocumento (catálogo CAT-022: 36 NIT, 13 DUI) y numDocumento;
//    la actividad económica debe ir nula y no lleva nombre comercial.
function direccionReceptor(r) {
  const dep = r?.cod_departamento || null;
  const mun = r?.cod_municipio || null;
  const dis = r?.cod_distrito || null;
  const complemento = complementoDte(r?.direccion, dep, dis);
  if (!dep && !complemento) return null;
  return { departamento: dep, municipio: mun, distrito: dis, complemento };
}

export function construirReceptor(tipoDte, r) {
  const numero = soloDigitos(r?.nit_dui) || null;
  const tipoId = r?.tipo_documento === "dui" ? "dui" : "nit";
  const comun = {
    nombre: r?.nombre?.trim() || null,
    nrc: normalizarNrc(r?.nrc) || null,
    direccion: direccionReceptor(r),
    telefono: r?.telefono?.trim() || null,
    correo: r?.correo?.trim() || null,
  };
  if (tipoDte === "03") {
    return {
      nit: numero,
      ...comun,
      codActividad: r?.cod_actividad?.trim() || null,
      descActividad: r?.desc_actividad?.trim() || null,
      nombreComercial: r?.nombre_comercial?.trim() || null,
    };
  }
  return {
    tipoDocumento: numero ? TIPOS_DOCUMENTO_ID[tipoId].codigo : null,
    numDocumento: numero,
    ...comun,
    // Normativa 2.0: en la Factura la actividad económica del receptor se envía nula
    codActividad: tipoDte === "01" ? null : r?.cod_actividad?.trim() || null,
    descActividad: tipoDte === "01" ? null : r?.desc_actividad?.trim() || null,
  };
}

// Datos del emisor (la empresa) comunes a todos los tipos de DTE.
// La dirección lleva departamento, municipio y complemento (el distrito va dentro del complemento).
export function construirEmisor(empresa) {
  return {
    nit: soloDigitos(empresa?.nit) || null,
    nrc: normalizarNrc(empresa?.nrc) || null,
    nombre: empresa?.nombre || null,
    codActividad: empresa?.cod_actividad || null,
    descActividad: empresa?.desc_actividad || null,
    nombreComercial: empresa?.nombre_comercial || null,
    // Normativa 2.0: dirección con departamento, municipio, distrito (CAT-008) y complemento (incluye el nombre del distrito).
    // Ya no se envían tipoEstablecimiento, codEstableMH ni codPuntoVentaMH.
    direccion: {
      departamento: empresa?.cod_departamento || null,
      municipio: empresa?.cod_municipio || null,
      distrito: empresa?.cod_distrito || null,
      complemento: complementoDte(empresa?.direccion, empresa?.cod_departamento, empresa?.cod_distrito),
    },
    telefono: empresa?.telefono_emisor || null,
    correo: empresa?.correo_emisor || null,
    // Códigos internos del contribuyente (opcionales). Los del Ministerio solo van en el número de control.
    codEstable: null,
    codPuntoVenta: null,
  };
}

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Datos del emisor que Hacienda exige en todo DTE. Devuelve un texto con lo que falta, o null si está completo.
export function validarEmisorDte(empresa) {
  const falta = [];
  const vacio = (v) => !String(v ?? "").trim();
  if (vacio(soloDigitos(empresa?.nit))) falta.push("NIT");
  if (vacio(normalizarNrc(empresa?.nrc))) falta.push("NRC");
  if (vacio(empresa?.nombre)) falta.push("nombre");
  if (vacio(empresa?.cod_actividad) || vacio(empresa?.desc_actividad)) falta.push("actividad económica");
  if (vacio(empresa?.cod_departamento) || vacio(empresa?.cod_municipio) || vacio(empresa?.cod_distrito)) falta.push("departamento, municipio y distrito");
  if (vacio(empresa?.direccion)) falta.push("dirección (complemento)");
  if (vacio(empresa?.telefono_emisor)) falta.push("teléfono");
  if (vacio(empresa?.correo_emisor)) falta.push("correo electrónico");
  return falta.length
    ? `Antes de emitir completa los datos del emisor que exige Hacienda: ${falta.join(", ")}. Los llenas en Facturación, en «Datos del emisor».`
    : null;
}

// Arma el DTE en JSON siguiendo la estructura del Anexo II (Normativa 2.0: Factura 01 versión 2, Crédito Fiscal 03 versión 4)
// a partir del cálculo del módulo de Ventas, para que el documento y la partida contable coincidan al centavo.
// El campo "ambiente" se completa al transmitir (según el ambiente configurado).
// detalle: [{ codigo, descripcion, cantidad, precio, bruto, neto, producto_id }]
export function construirJsonDteDesdeVenta({
  empresa, tipoDte, numeroControl, codigoGeneracion, fechaEmision,
  receptor, detalle, subtotal, iva, total, condicion, totalLetras,
}) {
  const esFactura = tipoDte === "01";
  const credito = condicion === "credito";
  const identificacion = {
    version: esFactura ? 2 : 4,
    ambiente: null,
    tipoDte,
    numeroControl,
    codigoGeneracion,
    tipoModelo: 1,
    tipoOperacion: 1,
    tipoContingencia: null,
    motivoContin: null,
    fecEmi: fechaEmision,
    horEmi: new Date().toTimeString().slice(0, 8),
    tipoMoneda: "USD",
  };
  const cuerpo = detalle.map((l, i) => {
    const gravada = r2(esFactura ? l.bruto : l.neto);
    const base = {
      numItem: i + 1,
      tipoItem: l.producto_id ? 1 : 2, // 1 bien, 2 servicio
      numeroDocumento: null,
      cantidad: l.cantidad,
      codigo: l.codigo || null,
      codTributo: null,
      uniMedida: 99,
      descripcion: l.descripcion,
      precioUni: l.precio,
      montoDescu: 0,
      ventaNoSuj: 0,
      ventaExenta: 0,
      ventaGravada: gravada,
      tributos: esFactura ? null : ["20"],
      psv: 0,
      noGravado: 0,
    };
    // En la Factura el precio incluye el IVA: el IVA de la línea se informa aparte
    return esFactura ? { ...base, ivaItem: r2(gravada - gravada / 1.13) } : base;
  });
  // El IVA de las líneas debe sumar exactamente el IVA total: la diferencia de centavos va a la última línea
  if (esFactura && cuerpo.length) {
    const dif = r2(iva - cuerpo.reduce((a, l) => a + l.ivaItem, 0));
    if (dif) cuerpo[cuerpo.length - 1].ivaItem = r2(cuerpo[cuerpo.length - 1].ivaItem + dif);
  }
  const totalGravada = esFactura ? r2(total) : r2(subtotal);
  const resumen = {
    totalNoSuj: 0,
    totalExenta: 0,
    totalGravada,
    subTotalVentas: totalGravada,
    descuNoSuj: 0,
    descuExenta: 0,
    descuGravada: 0,
    porcentajeDescuento: 0,
    totalDescu: 0,
    tributos: esFactura ? null : [{ codigo: "20", descripcion: "Impuesto al Valor Agregado 13", valor: r2(iva) }],
    subTotal: totalGravada,
    ...(esFactura ? {} : { ivaPerci: 0 }),
    ivaRete: 0,
    montoTotalOperacion: r2(total),
    totalNoGravado: 0,
    totalPagar: r2(total),
    totalLetras: totalLetras || null,
    ...(esFactura ? { totalIva: r2(iva) } : {}),
    saldoFavor: 0,
    condicionOperacion: credito ? 2 : 1, // 1=Contado, 2=Crédito, 3=Otro
    pagos: credito ? null : [{ codigo: "01", montoPago: r2(total), referencia: null, plazo: null, periodo: null }], // 01 billetes y monedas
    numPagoElectronico: null,
    observaciones: null,
  };
  const emisor = construirEmisor(empresa);
  const rec = construirReceptor(tipoDte, receptor);
  // La Normativa 2.0 elimina la sección "extension" en Factura y Crédito Fiscal
  return { identificacion, documentoRelacionado: null, emisor, receptor: rec, otrosDocumentos: null, ventaTercero: null, cuerpoDocumento: cuerpo, resumen, apendice: null };
}
