// Utilidades para Documentos Tributarios Electrónicos (DTE) — El Salvador
// Basado en: Normativa de Cumplimiento de los DTE, Ministerio de Hacienda (v2.0)

import { TIPOS_DOCUMENTO_ID, soloDigitos, normalizarNrc } from "@/lib/datosFiscales";

export const TIPOS_DTE = {
  "01": "Factura Electrónica",
  "03": "Comprobante de Crédito Fiscal Electrónico",
};

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
  const estab = (codEstablecimiento || "0001").padStart(4, "0").slice(0, 4);
  const punto = (codPuntoVenta || "0001").padStart(4, "0").slice(0, 4);
  const corr = String(correlativo).padStart(15, "0");
  return `DTE-${tipoDte}-${estab}${punto}-${corr}`;
}

// Regla 7.1.2 — La numeración consecutiva es por establecimiento (no por punto
// de venta ni por tipo de documento) y se reinicia en 000000000000001 con el
// primer DTE de cada ejercicio impositivo (año).
export function siguienteCorrelativo(documentos, codEstablecimiento, anio) {
  const estab = String(codEstablecimiento || "0001").padStart(4, "0").slice(0, 4);
  let max = 0;
  for (const d of documentos || []) {
    const partes = String(d.numero_control || "").split("-");
    if (partes.length !== 4) continue;
    if (partes[2].slice(0, 4) !== estab) continue;
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
function construirReceptor(tipoDte, r) {
  const numero = soloDigitos(r?.nit_dui) || null;
  const tipoId = r?.tipo_documento === "dui" ? "dui" : "nit";
  const comun = {
    nombre: r?.nombre?.trim() || null,
    nrc: normalizarNrc(r?.nrc) || null,
    direccion: r?.direccion?.trim() ? { complemento: r.direccion.trim() } : null,
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
    codActividad: null,
    descActividad: null,
  };
}

// Arma la estructura general del DTE en JSON (simplificada) a partir del
// cálculo del módulo de Ventas, para que el documento y la partida contable
// coincidan siempre al centavo.
// El esquema oficial completo, campo por campo, está en el Anexo II
// "Estructura de Datos DTE" de la Normativa — antes de transmitir en
// producción, este JSON debe validarse contra ese anexo y firmarse
// con el certificado digital del Ministerio de Hacienda.
// detalle: [{ codigo, descripcion, cantidad, precio, bruto, neto }]
export function construirJsonDteDesdeVenta({
  empresa, tipoDte, numeroControl, codigoGeneracion, fechaEmision,
  receptor, detalle, subtotal, iva, total, condicion,
}) {
  const esFactura = tipoDte === "01";
  return {
    identificacion: {
      version: 1,
      tipoDte,
      numeroControl,
      codigoGeneracion,
      fecEmi: fechaEmision,
      horEmi: new Date().toTimeString().slice(0, 8),
      moneda: "USD",
    },
    emisor: {
      nit: soloDigitos(empresa?.nit) || null,
      nrc: normalizarNrc(empresa?.nrc) || null,
      nombre: empresa?.nombre || null,
      nombreComercial: empresa?.nombre_comercial || null,
      codActividad: empresa?.giro || null,
      direccion: {
        departamento: empresa?.departamento || null,
        municipio: empresa?.municipio || null,
        complemento: empresa?.direccion || null,
      },
      telefono: empresa?.telefono_emisor || null,
      correo: empresa?.correo_emisor || null,
      codEstablecimiento: empresa?.cod_establecimiento || null,
      codPuntoVenta: empresa?.cod_punto_venta || null,
    },
    receptor: construirReceptor(tipoDte, receptor),
    cuerpoDocumento: detalle.map((l, i) => ({
      numItem: i + 1,
      codigo: l.codigo || null,
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      precioUni: l.precio,
      ventaGravada: esFactura ? l.bruto : l.neto,
    })),
    resumen: {
      totalGravada: esFactura ? total : subtotal,
      totalIva: iva,
      montoTotalOperacion: total,
      condicionOperacion: condicion === "credito" ? 2 : 1, // 1=Contado, 2=Crédito
    },
    // Se completa una vez el documento es firmado y transmitido a Hacienda:
    firma: null,
    selloRecibido: null,
  };
}
