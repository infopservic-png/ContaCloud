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
