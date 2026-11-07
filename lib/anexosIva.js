// Anexos del F-07 (IVA): ventas a contribuyentes, ventas a consumidor final y compras.
// Se arman con los documentos de ContaCloud y generan el CSV con el mismo formato que la plantilla de Hacienda.
import { supabase } from "@/lib/supabaseClient";
import { cargarDocumentosPeriodo, columnasDocumento, rangoDelMes } from "@/lib/libros";
import { r2 } from "@/lib/ventasCompras";

// Códigos de renta de los anexos de ventas (hoja PARAMETROS de la plantilla)
export const OPERACION_VENTAS = [["0", "Periodos anteriores a enero 2025"], ["01", "Gravada"], ["02", "No gravada o exenta"], ["03", "Excluido o no constituye renta"], ["04", "Mixta"], ["12", "Ingresos ya sujetos a retención en F910"], ["13", "Sujetos excluidos (art. 6 LISR) / no hecho generador"]];
export const INGRESO_VENTAS = [["0", "Periodos anteriores a enero 2025"], ["01", "Profesiones, artes y oficios"], ["02", "Actividades de servicios"], ["03", "Actividades comerciales"], ["04", "Actividades industriales"], ["05", "Actividades agropecuarias"], ["06", "Utilidades y dividendos"], ["07", "Exportaciones de bienes"], ["08", "Servicios realizados en el exterior y utilizados en El Salvador"], ["09", "Exportaciones de servicios"], ["10", "Otras rentas gravables"], ["12", "Ingresos ya sujetos a retención en F910"], ["13", "Sujetos excluidos / no hecho generador"]];

const sinGuiones = (s) => String(s ?? "").replace(/-/g, "");
const digitos = (s) => String(s ?? "").replace(/\D/g, "");
const izq = (s, n) => String(s ?? "").toUpperCase().slice(0, n); // PadR de la macro
const der = (s, n) => String(s ?? "").slice(-n); // PadL de la macro
const limpiaNombre = (s) => String(s ?? "").replace(/[;'"\r\n]/g, " ").replace(/\s+/g, " ").trim();
const dinero = (n) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
export const fechaDMA = (f) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : "");
export const periodoMMAAAA = (ym) => `${ym.slice(5, 7)}${ym.slice(0, 4)}`;

function datosDte(doc, dteEmitidos) {
  const cg = String(doc.codigo_generacion || "").trim();
  if (!cg) return { esDte: false, codigoGeneracion: "", numeroControl: "", sello: "", tipoDte: "" };
  const j = doc.json_dte || dteEmitidos.get(cg)?.json_dte || {};
  const id = j.identificacion || j.dteJson?.identificacion || {};
  const sello = j.selloRecibido || j.respuestaMH?.selloRecibido || dteEmitidos.get(cg)?.json_dte?.selloRecibido || "";
  return {
    esDte: true,
    codigoGeneracion: sinGuiones(cg),
    numeroControl: sinGuiones(doc.numero_documento || id.numeroControl || ""),
    sello: String(sello || ""),
    tipoDte: String(id.tipoDte || ""),
  };
}

// Identificación del cliente / proveedor: personas naturales con DUI van en la columna DUI y el NIT/NRC queda vacío.
function identificacion(ent) {
  const doc = digitos(ent?.nit_dui);
  const nrc = digitos(ent?.nrc).replace(/^0+/, "");
  if (ent?.tipo_documento === "dui" && doc) return { nitNrc: "", dui: doc };
  return { nitNrc: nrc || doc, dui: "" };
}

export async function obtenerAnexosIva(empresaId, ym, empresa, cfg) {
  const [anio, mes] = ym.split("-").map(Number);
  const { desde, hasta } = rangoDelMes(anio, mes);
  const [ventas, compras, emitidos] = await Promise.all([
    cargarDocumentosPeriodo("venta", empresaId, desde, hasta),
    cargarDocumentosPeriodo("compra", empresaId, desde, hasta),
    supabase.from("documentos_dte").select("codigo_generacion, numero_control, json_dte").eq("empresa_id", empresaId).gte("fecha_emision", desde).lte("fecha_emision", hasta),
  ]);
  const dteEmitidos = new Map((emitidos.data || []).map((d) => [String(d.codigo_generacion), d]));
  const ingresoDefecto = empresa?.tipo === "servicio" ? "02" : "03";
  const periodo = periodoMMAAAA(ym);

  const esContribuyente = (v) => v.tipo_documento === "ccf" || (v.tipo_documento === "sin_iva" && !!v.entidad?.nrc);
  const contribuyentes = [];
  const consumidor = [];
  for (const v of ventas) {
    const c = columnasDocumento(v, true);
    const dte = datosDte(v, dteEmitidos);
    const base = {
      id: v.id,
      incluir: true,
      fecha: v.fecha,
      clase: dte.esDte ? "4" : "1",
      // DTE: resolución = número de control sin guiones; serie = sello de recepción; documento = código de generación
      resolucion: dte.esDte ? dte.numeroControl : "",
      serie: dte.esDte ? dte.sello : "",
      numDoc: dte.esDte ? dte.codigoGeneracion : sinGuiones(v.numero_documento),
      control: dte.esDte ? dte.numeroControl : sinGuiones(v.numero_documento),
      etiqueta: v.numero_documento || "",
      tipoOp: c.gravadas > 0 ? "01" : "02",
      tipoIngreso: ingresoDefecto,
    };
    if (esContribuyente(v)) {
      const idn = identificacion(v.entidad);
      contribuyentes.push({
        ...base,
        tipo: "03",
        ...idn,
        nombre: v.entidad?.nombre || "",
        exentas: c.exentas,
        noSujetas: 0,
        gravadas: c.gravadas,
        debito: c.iva,
        total: c.total,
      });
    } else {
      consumidor.push({
        ...base,
        tipo: "01",
        maquina: "",
        exentas: c.exentas,
        gravadas: r2(c.gravadas + c.iva), // consumidor final: ventas gravadas con IVA incluido
        total: c.total,
      });
    }
  }

  // Compras: el anexo sólo admite CCF, notas, importaciones, etc.; la factura de consumidor final no se reporta.
  const filasCompras = [];
  let omitidas = 0;
  for (const c of compras) {
    if (c.tipo_documento === "factura") { omitidas += 1; continue; }
    const x = columnasDocumento(c, false);
    const fovial = r2(Number(c.fovial_cotrans) || 0);
    const gravadas = r2(x.gravadas - fovial);
    const exentas = r2(x.exentas + fovial);
    const dte = datosDte(c, dteEmitidos);
    const idn = identificacion(c.entidad);
    filasCompras.push({
      id: c.id,
      incluir: true,
      fecha: c.fecha,
      clase: dte.esDte ? "4" : "1",
      tipo: ["03", "05", "06"].includes(dte.tipoDte) ? dte.tipoDte : "03",
      numDoc: dte.esDte ? dte.codigoGeneracion : sinGuiones(c.numero_documento),
      etiqueta: c.numero_documento || "",
      ...idn,
      nombre: c.entidad?.nombre || "",
      exentas,
      gravadas,
      credito: x.iva,
      total: x.total,
      tipoOp: gravadas > 0 ? "1" : "2",
      clasificacion: cfg?.f14_clasificacion || "2",
      sector: cfg?.f14_sector || "2",
      tipoCosto: cfg?.f14_tipo_costo || "2",
    });
  }
  return { contribuyentes, consumidor, compras: filasCompras, comprasOmitidas: omitidas, periodo };
}

// ---------- Líneas del archivo plano (mismo orden y recortes que las macros de la plantilla) ----------
export function lineaContribuyentes(f) {
  return [
    izq(fechaDMA(f.fecha), 10),
    izq(f.clase, 1),
    izq(f.tipo, 2),
    der(sinGuiones(f.resolucion), 100),
    izq(f.serie, 100),
    izq(sinGuiones(f.numDoc), 100),
    izq(sinGuiones(f.control), 100),
    der(sinGuiones(f.nitNrc), 14),
    izq(limpiaNombre(f.nombre), 100),
    der(dinero(f.exentas), 11),
    der(dinero(f.noSujetas), 11),
    der(dinero(f.gravadas), 11),
    der(dinero(f.debito), 11),
    der(dinero(0), 11),
    der(dinero(0), 11),
    der(dinero(f.total), 11),
    der(sinGuiones(f.dui), 9),
    izq(f.tipoOp, 2),
    izq(f.tipoIngreso, 2),
    "1",
  ].join(";");
}

export function lineaConsumidor(f) {
  return [
    izq(fechaDMA(f.fecha), 10),
    izq(f.clase, 1),
    izq(f.tipo, 2),
    der(sinGuiones(f.resolucion), 100),
    izq(f.serie, 100),
    izq(sinGuiones(f.control), 100),
    izq(sinGuiones(f.control), 100),
    izq(sinGuiones(f.numDoc), 100),
    izq(sinGuiones(f.numDoc), 100),
    izq(f.maquina, 14),
    der(dinero(f.exentas), 11),
    der(dinero(0), 11),
    der(dinero(0), 11),
    der(dinero(f.gravadas), 11),
    der(dinero(0), 11),
    der(dinero(0), 11),
    der(dinero(0), 11),
    der(dinero(0), 11),
    der(dinero(0), 11),
    der(dinero(f.total), 11),
    izq(f.tipoOp, 2),
    izq(f.tipoIngreso, 2),
    "2",
  ].join(";");
}

export function lineaCompras(f) {
  return [
    izq(fechaDMA(f.fecha), 10),
    izq(f.clase, 1),
    izq(f.tipo, 2),
    izq(sinGuiones(f.numDoc), 100),
    der(sinGuiones(f.nitNrc), 14),
    izq(limpiaNombre(f.nombre), 100),
    der(dinero(f.exentas), 11),
    der(dinero(0), 11),
    der(dinero(0), 11),
    der(dinero(f.gravadas), 11),
    der(dinero(0), 11),
    der(dinero(0), 11),
    der(dinero(0), 11),
    der(dinero(f.credito), 11),
    der(dinero(f.total), 11),
    der(sinGuiones(f.dui), 9),
    izq(f.tipoOp, 1),
    izq(f.clasificacion, 1),
    izq(f.sector, 1),
    izq(f.tipoCosto, 1),
    "3",
  ].join(";");
}

export const LINEAS = { contribuyentes: lineaContribuyentes, consumidor: lineaConsumidor, compras: lineaCompras };
export const csvAnexo = (tipo, filas) => filas.map(LINEAS[tipo]).join("\r\n") + "\r\n";

export const NOMBRE_ARCHIVO = { contribuyentes: "ANEXO CONTRIBUYENTES", consumidor: "ANEXO CONSUMIDOR FINAL", compras: "ANEXO COMPRAS" };
