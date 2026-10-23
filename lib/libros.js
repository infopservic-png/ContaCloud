// Libros de IVA: ventas a contribuyentes, ventas a consumidor final y compras.
// Se arman con los documentos que ya registra ContaCloud (módulos Ventas y Compras).
import { supabase } from "@/lib/supabaseClient";
import { r2 } from "@/lib/ventasCompras";

export const LIBROS = [
  { id: "ventas_contribuyentes", etiqueta: "Ventas a contribuyentes" },
  { id: "ventas_consumidor", etiqueta: "Ventas a consumidor final" },
  { id: "compras", etiqueta: "Compras" },
];

// Primer y último día de un mes (año 2026, mes 10 → 2026-10-01 / 2026-10-31)
export function rangoDelMes(anio, mes) {
  const pad = (n) => String(n).padStart(2, "0");
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return { desde: `${anio}-${pad(mes)}-01`, hasta: `${anio}-${pad(mes)}-${pad(ultimo)}` };
}

export async function cargarDocumentosPeriodo(tipo, empresaId, desde, hasta) {
  const esVenta = tipo === "venta";
  const tabla = esVenta ? "ventas" : "compras";
  const entidad = esVenta ? "cliente_id" : "proveedor_id";
  const { data, error } = await supabase
    .from(tabla)
    .select(`*, entidad:${entidad} ( nombre, nit_dui, nrc, tipo_documento )`)
    .eq("empresa_id", empresaId)
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha")
    .order("created_at");
  if (error) throw error;
  return data || [];
}

// Importes de un documento repartidos en las columnas de los libros.
export function columnasDocumento(doc, esVenta) {
  const subtotal = Number(doc.subtotal) || 0;
  const iva = Number(doc.iva) || 0;
  const total = Number(doc.total) || 0;
  if (doc.tipo_documento === "sin_iva") return { exentas: total, gravadas: 0, iva: 0, total };
  // Compra con factura de consumidor final: no da crédito fiscal, el IVA queda dentro del costo
  if (!esVenta && doc.tipo_documento === "factura") return { exentas: 0, gravadas: total, iva: 0, total };
  return { exentas: 0, gravadas: subtotal, iva, total };
}

function filaLibro(doc, esVenta, n) {
  const c = columnasDocumento(doc, esVenta);
  return {
    n,
    id: doc.id,
    fecha: doc.fecha,
    documento: doc.numero_documento || "",
    codigoGeneracion: doc.codigo_generacion || "",
    nombre: doc.entidad?.nombre || (esVenta ? "Consumidor final" : ""),
    nrc: doc.entidad?.nrc || "",
    nit: doc.entidad?.nit_dui || "",
    ...c,
  };
}

export function totalesLibro(filas) {
  const t = { exentas: 0, gravadas: 0, iva: 0, total: 0 };
  for (const f of filas) {
    t.exentas += f.exentas;
    t.gravadas += f.gravadas;
    t.iva += f.iva;
    t.total += f.total;
  }
  return { exentas: r2(t.exentas), gravadas: r2(t.gravadas), iva: r2(t.iva), total: r2(t.total) };
}

// Reparte los documentos del período en los tres libros, numerados desde 1 dentro de cada libro.
export function armarLibros(ventas, compras) {
  const esContribuyente = (v) => v.tipo_documento === "ccf" || (v.tipo_documento === "sin_iva" && !!v.entidad?.nrc);
  const vc = ventas.filter(esContribuyente);
  const vf = ventas.filter((v) => !esContribuyente(v));
  const numerar = (docs, esVenta) => docs.map((d, i) => filaLibro(d, esVenta, i + 1));
  const libros = {
    ventas_contribuyentes: numerar(vc, true),
    ventas_consumidor: numerar(vf, true),
    compras: numerar(compras, false),
  };
  const totales = Object.fromEntries(Object.entries(libros).map(([k, f]) => [k, totalesLibro(f)]));
  const debito = r2(totales.ventas_contribuyentes.iva + totales.ventas_consumidor.iva);
  const credito = totales.compras.iva;
  return {
    libros,
    totales,
    resumenIva: { debito, credito, diferencia: r2(debito - credito) }, // positivo = IVA por pagar
  };
}

// Encabezados y filas listos para pantalla y Excel.
export function tablaLibro(idLibro, filas, totales) {
  const compras = idLibro === "compras";
  const conContraparte = idLibro !== "ventas_consumidor";
  const encabezados = [
    "N.°",
    "Fecha",
    "N.° de documento",
    "Código de generación",
    ...(conContraparte ? [compras ? "Proveedor" : "Cliente", "NRC"] : []),
    compras ? "Compras exentas" : "Ventas exentas",
    compras ? "Compras gravadas" : "Ventas gravadas",
    compras ? "IVA crédito fiscal" : "IVA débito fiscal",
    "Total",
  ];
  const cuerpo = filas.map((f) => [
    f.n,
    f.fecha,
    f.documento,
    f.codigoGeneracion,
    ...(conContraparte ? [f.nombre, f.nrc] : []),
    f.exentas,
    f.gravadas,
    f.iva,
    f.total,
  ]);
  const vacios = Array(4 + (conContraparte ? 2 : 0) - 1).fill("");
  const pie = ["TOTALES", ...vacios, totales.exentas, totales.gravadas, totales.iva, totales.total];
  return { encabezados, cuerpo, pie };
}

// ---------------------------------------------------------------------------
// Libro o registro de operaciones de ventas a contribuyentes (formato oficial)
// ---------------------------------------------------------------------------
export function formatoNit(nit) {
  const d = String(nit ?? "").replace(/\D/g, "");
  return d.length === 14 ? `${d.slice(0, 4)}-${d.slice(4, 10)}-${d.slice(10, 13)}-${d.slice(13)}` : d || "—";
}
export function formatoNrc(nrc) {
  const d = String(nrc ?? "").replace(/\D/g, "").replace(/^0+/, "");
  return d.length > 1 ? `${d.slice(0, -1)}-${d.slice(-1)}` : d || "—";
}
export const fechaCorta = (f) => (f ? f.split("-").reverse().join("/") : "");

const CERO = () => ({ noSujetas: 0, exentas: 0, gravadas: 0, debito: 0, tExentas: 0, tGravadas: 0, tDebito: 0, ivaRetenido: 0, total: 0 });

// ventas: todas las ventas del período (el libro toma las de contribuyentes; el resumen incluye también las de consumidores).
export function armarLibroContribuyentes(ventas) {
  const esContribuyente = (v) => v.tipo_documento === "ccf" || (v.tipo_documento === "sin_iva" && !!v.entidad?.nrc);
  const contribuyentes = ventas.filter(esContribuyente);
  const consumidores = ventas.filter((v) => !esContribuyente(v));

  const filas = contribuyentes.map((v, i) => {
    const c = columnasDocumento(v, true);
    return {
      n: i + 1,
      id: v.id,
      fecha: v.fecha,
      correlativo: v.numero_documento || "",
      serie: "",
      control: v.codigo_generacion || "",
      nombre: v.entidad?.nombre || "",
      nrc: v.entidad?.nrc || "",
      ...CERO(),
      exentas: c.exentas,
      gravadas: c.gravadas,
      debito: c.iva,
      total: c.total,
    };
  });
  const totales = CERO();
  for (const f of filas) for (const k of Object.keys(totales)) totales[k] = r2(totales[k] + f[k]);

  const suma = (docs, campo) => r2(docs.reduce((s, v) => s + columnasDocumento(v, true)[campo], 0));
  const resumen = {
    gravContribNeto: suma(contribuyentes, "gravadas"),
    gravContribDebito: suma(contribuyentes, "iva"),
    gravConsNeto: suma(consumidores, "gravadas"),
    gravConsDebito: suma(consumidores, "iva"),
    exentContrib: suma(contribuyentes, "exentas"),
    exentCons: suma(consumidores, "exentas"),
    exportaciones: 0,
    noSujetas: 0,
  };
  resumen.totalGravNeto = r2(resumen.gravContribNeto + resumen.gravConsNeto);
  resumen.totalGravDebito = r2(resumen.gravContribDebito + resumen.gravConsDebito);
  resumen.totalExentas = r2(resumen.exentContrib + resumen.exentCons);
  return { filas, totales, resumen };
}

export const ENCABEZADOS_CONTRIBUYENTES = [
  "No.", "Fecha de emisión", "N.° correlativo preimpreso", "Prefijo o serie", "N.° de control interno sistema formulario único",
  "Nombre de cliente, mandante o mandatario", "NRC",
  "Propias: no sujetas", "Propias: exentas", "Propias: internas gravadas", "Propias: débito fiscal",
  "A cuenta de terceros: exentas", "A cuenta de terceros: internas gravadas", "A cuenta de terceros: débito fiscal", "IVA retenido",
  "Total",
];

export function filasExcelContribuyentes({ empresa, mes, anio, folio, libro }) {
  const { filas, totales, resumen } = libro;
  const f6 = String(folio).padStart(6, "0");
  const vacio = Array(7).fill("");
  return [
    ["LIBRO O REGISTRO DE OPERACIONES DE VENTAS A CONTRIBUYENTES"],
    [`NOMBRE DEL CONTRIBUYENTE: ${empresa?.nombre || ""}`, "", "", "", "", `NRC: ${formatoNrc(empresa?.nrc)}`, "", `NIT: ${formatoNit(empresa?.nit)}`],
    [`MES: ${mes}`, `AÑO: ${anio}`, "VALORES EXPRESADOS EN US DÓLARES", "", "", "", "", `Folio No. ${f6}`],
    [],
    ENCABEZADOS_CONTRIBUYENTES,
    ...filas.map((f) => [
      f.n, fechaCorta(f.fecha), f.correlativo, f.serie, f.control, f.nombre, formatoNrc(f.nrc),
      f.noSujetas, f.exentas, f.gravadas, f.debito, f.tExentas, f.tGravadas, f.tDebito, f.ivaRetenido, f.total,
    ]),
    [...vacio.slice(0, 6), "TOTALES DEL MES", totales.noSujetas, totales.exentas, totales.gravadas, totales.debito, totales.tExentas, totales.tGravadas, totales.tDebito, totales.ivaRetenido, totales.total],
    [],
    ["RESUMEN DE OPERACIONES", "", "Propias: valor neto", "Propias: débito fiscal", "A cuenta de terceros: valor neto", "A cuenta de terceros: débito fiscal", "IVA retenido", "CESC"],
    ["Ventas netas internas gravadas a contribuyentes", "", resumen.gravContribNeto, resumen.gravContribDebito, 0, 0, 0, 0],
    ["Ventas netas internas gravadas a consumidores", "", resumen.gravConsNeto, resumen.gravConsDebito, 0, 0, 0, 0],
    ["Total de operaciones internas gravadas", "", resumen.totalGravNeto, resumen.totalGravDebito, 0, 0, 0, 0],
    ["Ventas netas internas exentas a contribuyentes", "", resumen.exentContrib, "", 0],
    ["Ventas netas internas exentas a consumidores", "", resumen.exentCons, "", 0],
    ["Total de operaciones internas exentas", "", resumen.totalExentas, "", 0],
    ["Exportaciones según facturas de exportación", "", resumen.exportaciones, 0, 0],
    ["Ventas no sujetas", "", resumen.noSujetas, "", 0],
    [],
    ["", "", "", "", "", "", "Nombre y firma del contador o contribuyente"],
  ];
}

// ---------------------------------------------------------------------------
// Libro de ventas al consumidor (formato oficial): un renglón por día con el rango de documentos
// ---------------------------------------------------------------------------
export function armarLibroConsumidor(ventas) {
  const esContribuyente = (v) => v.tipo_documento === "ccf" || (v.tipo_documento === "sin_iva" && !!v.entidad?.nrc);
  const docs = ventas.filter((v) => !esContribuyente(v));
  const porDia = new Map();
  for (const v of docs) {
    if (!porDia.has(v.fecha)) porDia.set(v.fecha, []);
    porDia.get(v.fecha).push(v);
  }
  const filas = [...porDia.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, lista]) => {
      const numeros = lista.map((v) => v.numero_documento || "").filter(Boolean).sort();
      let exentas = 0, gravadas = 0, iva = 0, total = 0;
      for (const v of lista) {
        const c = columnasDocumento(v, true);
        exentas += c.exentas;
        gravadas += c.gravadas + c.iva; // en este libro las ventas gravadas locales van con el IVA incluido
        iva += c.iva;
        total += c.total;
      }
      return {
        fecha,
        dia: Number(fecha.slice(8, 10)),
        del: numeros[0] || "",
        al: numeros[numeros.length - 1] || "",
        documentos: lista.length,
        noSujetas: 0,
        exentas: r2(exentas),
        gravadas: r2(gravadas),
        iva: r2(iva),
        exportaciones: 0,
        totales: r2(total),
        terceros: 0,
        retencion: 0,
      };
    });
  const t = { noSujetas: 0, exentas: 0, gravadas: 0, iva: 0, exportaciones: 0, totales: 0, terceros: 0, retencion: 0 };
  for (const f of filas) for (const k of Object.keys(t)) t[k] = r2(t[k] + f[k]);
  const resumen = {
    noSujetas: t.noSujetas,
    exentas: t.exentas,
    gravadasNetas: r2(t.gravadas - t.iva),
    debitoFiscal: t.iva,
    exportaciones: t.exportaciones,
    ventasTotales: t.totales,
    retencion: t.retencion,
  };
  return { filas, totales: t, resumen };
}

export function filasExcelConsumidor({ empresa, mes, anio, folio, libro }) {
  const { filas, totales, resumen } = libro;
  return [
    ["LIBRO DE VENTAS AL CONSUMIDOR"],
    [`NOMBRE DEL ESTABLECIMIENTO: ${empresa?.nombre || ""}`],
    [`NRC: ${formatoNrc(empresa?.nrc)}`, "", `NIT: ${formatoNit(empresa?.nit)}`, "", "", `No. ${String(folio).padStart(6, "0")}`],
    [`MES: ${mes}`, "", `AÑO: ${anio}`, "", "", "(Valores expresados en dólares estadounidenses)"],
    [],
    ["Día", "Del No.", "Al No.", "No. máquina o caja registradora", "Ventas no sujetas", "Ventas exentas", "Ventas gravadas locales", "Exportaciones", "Ventas totales", "Ventas por cuenta de terceros", "1% retención"],
    ...filas.map((f) => [f.dia, f.del, f.al, "", f.noSujetas, f.exentas, f.gravadas, f.exportaciones, f.totales, f.terceros, f.retencion]),
    ["", "", "", "Total:", totales.noSujetas, totales.exentas, totales.gravadas, totales.exportaciones, totales.totales, totales.terceros, totales.retencion],
    [],
    ["RESUMEN:"],
    ["Ventas no sujetas:", resumen.noSujetas],
    ["Ventas exentas:", resumen.exentas],
    ["Ventas netas gravadas:", resumen.gravadasNetas],
    ["DÉBITO FISCAL:", resumen.debitoFiscal],
    ["Exportaciones:", resumen.exportaciones],
    ["VENTAS TOTALES:", resumen.ventasTotales],
    ["1% Retención:", resumen.retencion],
    [],
    ["", "", "Nombre y firma del contador"],
  ];
}

// ---------------------------------------------------------------------------
// Libro o registro de compras (formato oficial)
// ---------------------------------------------------------------------------
export function armarLibroCompras(compras) {
  const filas = compras.map((c, i) => {
    const x = columnasDocumento(c, false);
    return {
      n: i + 1,
      id: c.id,
      fecha: c.fecha,
      documento: c.numero_documento || "",
      codigoGeneracion: c.codigo_generacion || "",
      nrc: c.entidad?.nrc || "",
      nitExcluido: "",
      proveedor: c.entidad?.nombre || "",
      exentasInternas: x.exentas,
      exentasImportaciones: 0,
      gravadasInternas: x.gravadas,
      gravadasImportaciones: 0,
      creditoFiscal: x.iva,
      retencion: 0,
      totalCompras: x.total,
      retenidoTerceros: 0,
      sujetosExcluidos: 0,
    };
  });
  const campos = ["exentasInternas", "exentasImportaciones", "gravadasInternas", "gravadasImportaciones", "creditoFiscal", "retencion", "totalCompras", "retenidoTerceros", "sujetosExcluidos"];
  const totales = Object.fromEntries(campos.map((k) => [k, r2(filas.reduce((s, f) => s + f[k], 0))]));
  return { filas, totales };
}

export function filasExcelCompras({ empresa, mes, anio, folio, libro }) {
  const { filas, totales } = libro;
  return [
    ["LIBRO O REGISTRO DE COMPRAS"],
    [`NOMBRE DEL CONTRIBUYENTE: ${empresa?.nombre || ""}`, "", "", "", `NRC: ${formatoNrc(empresa?.nrc)}`, "", `NIT: ${formatoNit(empresa?.nit)}`],
    [`MES: ${mes}`, "", `AÑO: ${anio}`, "VALORES EXPRESADOS EN US DÓLARES", "", "", `Folio No. ${String(folio).padStart(6, "0")}`],
    [],
    ["No.", "Fecha de emisión", "Número de documento", "Código de generación", "NRC", "NIT o DUI de sujeto excluido", "Nombre del proveedor",
      "Compras exentas: internas", "Compras exentas: importac. e internac.", "Compras gravadas: internas", "Compras gravadas: importac. e internac.", "Compras gravadas: crédito fiscal",
      "Ret. 1% y 2% A/C", "Total compras", "Impuesto retenido a terceros", "Compras a sujetos excluidos"],
    ...filas.map((f) => [f.n, fechaCorta(f.fecha), f.documento, f.codigoGeneracion, formatoNrc(f.nrc), f.nitExcluido, f.proveedor,
      f.exentasInternas, f.exentasImportaciones, f.gravadasInternas, f.gravadasImportaciones, f.creditoFiscal, f.retencion, f.totalCompras, f.retenidoTerceros, f.sujetosExcluidos]),
    ["", "", "", "", "", "", "TOTAL DEL MES:", totales.exentasInternas, totales.exentasImportaciones, totales.gravadasInternas, totales.gravadasImportaciones, totales.creditoFiscal, totales.retencion, totales.totalCompras, totales.retenidoTerceros, totales.sujetosExcluidos],
    [],
    ["Nombre y firma del contador o contribuyente"],
  ];
}
