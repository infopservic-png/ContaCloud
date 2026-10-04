// Utilidades para Documentos Tributarios Electrónicos (DTE) — El Salvador
// Basado en: Normativa de Cumplimiento de los DTE, Ministerio de Hacienda (v2.0)

export const TIPOS_DTE = {
  "01": "Factura Electrónica",
  "03": "Comprobante de Crédito Fiscal Electrónico",
};

export const TASA_IVA = 0.13; // 13%, IVA El Salvador

// Regla 7.2.a — Redondeos en Sección Cuerpo: hasta 8 decimales
export function redondearCuerpo(n) {
  return Math.round((Number(n) + Number.EPSILON) * 1e8) / 1e8;
}

// Regla 7.2.b — Redondeos en Sección Resumen: hasta 2 decimales
export function redondearResumen(n) {
  return Math.round((Number(n) + Number.EPSILON) * 1e2) / 1e2;
}

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

// Calcula los montos de una factura a partir de las líneas (items)
export function calcularTotales(items) {
  const itemsCalculados = items.map((it) => {
    const cantidad = Number(it.cantidad) || 0;
    const precio = Number(it.precio_unitario) || 0;
    const totalItem = redondearCuerpo(cantidad * precio);
    return { ...it, cantidad, precio_unitario: precio, total_item: totalItem };
  });

  const sumaItems = itemsCalculados.reduce((s, it) => s + it.total_item, 0);
  const subtotal = redondearResumen(sumaItems);
  const iva = redondearResumen(subtotal * TASA_IVA);
  const total = redondearResumen(subtotal + iva);

  return { itemsCalculados, subtotal, iva, total };
}

// Arma la estructura general del DTE en JSON (simplificada).
// El esquema oficial completo, campo por campo, está en el Anexo II
// "Estructura de Datos DTE" de la Normativa — antes de transmitir en
// producción, este JSON debe validarse contra ese anexo y firmarse
// con el certificado digital del Ministerio de Hacienda.
export function construirJsonDte({ empresa, tipoDte, numeroControl, codigoGeneracion, fechaEmision, receptor, itemsCalculados, subtotal, iva, total, formaPago }) {
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
      nit: empresa?.nit || null,
      nrc: empresa?.nrc || null,
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
    receptor: {
      nombre: receptor?.nombre || null,
      numDocumento: receptor?.nit_dui || null,
      nrc: receptor?.nrc || null,
      correo: receptor?.correo || null,
      direccion: receptor?.direccion || null,
    },
    cuerpoDocumento: itemsCalculados.map((it, i) => ({
      numItem: i + 1,
      descripcion: it.descripcion,
      cantidad: it.cantidad,
      precioUni: it.precio_unitario,
      ventaGravada: it.total_item,
    })),
    resumen: {
      totalGravada: subtotal,
      totalIva: iva,
      montoTotalOperacion: total,
      condicionOperacion: formaPago === "credito" ? 2 : 1, // 1=Contado, 2=Crédito
    },
    // Se completa una vez el documento es firmado y transmitido a Hacienda:
    firma: null,
    selloRecibido: null,
  };
}
