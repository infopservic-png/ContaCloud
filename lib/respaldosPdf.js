import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { supabase } from "@/lib/supabaseClient";
import { etiquetaPartida, compararPartidas, agruparPorMayor, numeroReportePartida } from "@/lib/partidas";
import { nombreCuentaMayor } from "@/lib/cuentasMayor";

// PDF de "Partidas con respaldos": por cada partida del rango, su hoja
// (encabezado, líneas, totales) y a continuación el PDF de cada DTE que la
// respalda. Funciona en el navegador (usa pdf-lib).

const W = 612; // carta
const H = 792;
const M = 40;
const INK = rgb(0.12, 0.16, 0.24);
const GRIS = rgb(0.42, 0.45, 0.5);
const LINEA = rgb(0.8, 0.8, 0.8);
const FONDO = rgb(0.96, 0.95, 0.91);

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const dinero = (n) =>
  Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
function fechaLarga(f) {
  const [a, m, d] = String(f || "").split("-").map(Number);
  return a ? `${d} de ${MESES[m - 1]} de ${a}` : "";
}
function fechaFmt(f) {
  const m = String(f || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : f || "";
}

// Trae los DTE (con su JSON) enlazados a las partidas indicadas.
// Devuelve { [transaccion_id]: [{ dte, etiqueta }] }, sin repetir el mismo código de generación.
export async function obtenerRespaldosDte(empresaId, idsPartida) {
  const porPartida = {};
  const vistos = new Set();
  const agregar = (txId, dte, etiqueta, codigo) => {
    if (!txId || !dte) return;
    const clave = `${txId}|${codigo || etiqueta}`;
    if (vistos.has(clave)) return;
    vistos.add(clave);
    (porPartida[txId] ||= []).push({ dte, etiqueta });
  };

  for (let i = 0; i < idsPartida.length; i += 80) {
    const ids = idsPartida.slice(i, i + 80);

    // DTE emitidos desde Facturación
    const { data: emitidos } = await supabase
      .from("documentos_dte")
      .select("transaccion_id, codigo_generacion, numero_control, json_dte")
      .eq("empresa_id", empresaId)
      .in("transaccion_id", ids);
    for (const d of emitidos || []) agregar(d.transaccion_id, d.json_dte, d.numero_control, d.codigo_generacion);

    // DTE importados (ventas y compras). Si la columna json_dte aún no existe, se omite sin fallar.
    for (const tabla of ["ventas", "compras"]) {
      const { data, error } = await supabase
        .from(tabla)
        .select("transaccion_id, codigo_generacion, numero_documento, json_dte")
        .eq("empresa_id", empresaId)
        .in("transaccion_id", ids)
        .not("json_dte", "is", null);
      if (error) continue;
      for (const d of data || []) agregar(d.transaccion_id, d.json_dte, d.numero_documento, d.codigo_generacion);
    }
  }
  return porPartida;
}

// Dibuja la(s) hoja(s) de una partida en `doc`, con el mismo formato del reporte del Libro diario:
// cuenta de mayor (con su total) seguida de sus subcuentas y, en Parciales, el detalle por documento.
function dibujarPartida(doc, f, fb, empresa, p, nRespaldos) {
  const soportados = new Set(f.getCharacterSet());
  const limpiar = (s) =>
    Array.from(String(s ?? "").replace(/[\r\n\t]+/g, " "))
      .map((ch) => (soportados.has(ch.codePointAt(0)) ? ch : "?"))
      .join("");

  let page;
  let y;
  const texto = (s, x, yy, { size = 9, font = f, color = INK, align = "left" } = {}) => {
    const t = limpiar(s);
    const w = font.widthOfTextAtSize(t, size);
    const xx = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
    page.drawText(t, { x: xx, y: yy, size, font, color });
  };
  const ajustar = (s, font, size, ancho) => {
    const palabras = limpiar(s).split(" ").filter(Boolean);
    const lineas = [];
    let actual = "";
    for (const pal of palabras) {
      const prueba = actual ? `${actual} ${pal}` : pal;
      if (font.widthOfTextAtSize(prueba, size) <= ancho) actual = prueba;
      else {
        if (actual) lineas.push(actual);
        actual = pal;
      }
    }
    if (actual) lineas.push(actual);
    return lineas.length ? lineas : [""];
  };

  const xDesc = M + 62;
  const xHaber = W - M - 4;
  const xDebe = xHaber - 80;
  const xParc = xDebe - 80;
  const anchoDesc = xParc - 70 - xDesc;

  function encabezadoTabla() {
    page.drawRectangle({ x: M, y: y - 16, width: W - 2 * M, height: 16, color: FONDO });
    texto("Cuenta", M + 4, y - 11, { size: 8, font: fb });
    texto("Descripción", xDesc, y - 11, { size: 8, font: fb });
    texto("Parciales", xParc, y - 11, { size: 8, font: fb, align: "right" });
    texto("Debe", xDebe, y - 11, { size: 8, font: fb, align: "right" });
    texto("Haber", xHaber, y - 11, { size: 8, font: fb, align: "right" });
    y -= 22;
  }
  function nuevaPagina() {
    page = doc.addPage([W, H]);
    y = H - M;
    texto(`Partida ${etiquetaPartida(p.tipo, p.numero_partida)} — ${fechaFmt(p.fecha)} (continuación)`, M, y - 8, {
      size: 8, font: fb, color: GRIS,
    });
    y -= 24;
    encabezadoTabla();
  }
  // Una fila de la tabla; salta de página si no cabe.
  function fila({ cod, desc, sangria = 0, parcial, debe, haber, negrita = false, mayusc = false, colorDesc = INK, size = 8.5 }) {
    const font = negrita ? fb : f;
    const lineas = ajustar(mayusc ? String(desc || "").toUpperCase() : desc, font, size, anchoDesc - sangria);
    const alto = lineas.length * 11 + 2;
    if (y - alto < 60) nuevaPagina();
    if (cod) texto(cod, M + 4, y - 9, { size, font });
    lineas.forEach((l, i) => texto(l, xDesc + sangria, y - 9 - i * 11, { size, font, color: colorDesc }));
    const yNum = y - 9 - (lineas.length - 1) * 11;
    if (parcial) texto(dinero(parcial), xParc, yNum, { size, align: "right" });
    if (debe) texto(dinero(debe), xDebe, yNum, { size, font, align: "right" });
    if (haber) texto(dinero(haber), xHaber, yNum, { size, font, align: "right" });
    y -= alto;
  }

  // --- Cabecera ---
  page = doc.addPage([W, H]);
  y = H - M;
  texto(empresa?.nombre || "", M, y - 10, { size: 10, font: fb });
  y -= 24;
  texto("Partida contable", W / 2, y - 12, { size: 13, font: fb, align: "center" });
  texto(fechaLarga(p.fecha), W / 2, y - 26, { size: 9, align: "center" });
  const moneda = empresa?.moneda ? empresa.moneda.replace(/\s*\(.*\)\s*$/, "") : "US dólares";
  texto(`VALORES EXPRESADOS EN ${moneda.toUpperCase()}`, W / 2, y - 38, { size: 8, font: fb, align: "center" });
  y -= 56;
  texto(`Partida #: ${numeroReportePartida(p.tipo, p.numero_partida)}      ${fechaFmt(p.fecha)}`, M, y - 9, { size: 9 });
  if (nRespaldos > 0) {
    texto(`Respaldos adjuntos a continuación: ${nRespaldos} documento${nRespaldos === 1 ? "" : "s"} (DTE)`, W - M, y - 9, { size: 7.5, color: GRIS, align: "right" });
  }
  y -= 18;
  encabezadoTabla();

  // --- Cuerpo: mayor + subcuentas ---
  const grupos = agruparPorMayor(p.movimientos || [], nombreCuentaMayor);
  let totalDebe = 0;
  let totalHaber = 0;
  for (const g of grupos) {
    fila({ cod: g.codigo, desc: g.nombre, debe: g.debe, haber: g.haber, mayusc: true });
    for (const s of g.subcuentas) {
      const hayDetalle = s.detalle.length > 0;
      fila({ cod: s.codigo, desc: s.nombre, parcial: hayDetalle ? 0 : s.monto });
      for (const d of s.detalle) {
        fila({ desc: d.texto, sangria: 14, parcial: d.monto, colorDesc: GRIS, size: 7.5 });
      }
    }
    totalDebe += g.debe;
    totalHaber += g.haber;
  }
  if (y < 150) nuevaPagina();
  page.drawLine({ start: { x: xDebe - 70, y: y - 2 }, end: { x: xHaber, y: y - 2 }, thickness: 0.6, color: INK });
  texto("Totales:", xParc, y - 14, { size: 9, font: fb, align: "right" });
  texto(dinero(r2(totalDebe)), xDebe, y - 14, { size: 9, font: fb, align: "right" });
  texto(dinero(r2(totalHaber)), xHaber, y - 14, { size: 9, font: fb, align: "right" });
  y -= 36;

  // --- Concepto ---
  texto("Concepto de la partida:", M, y - 9, { size: 9, font: fb });
  y -= 14;
  for (const l of ajustar(String(p.descripcion || "").toUpperCase(), f, 8.5, W - 2 * M - 16)) {
    if (y < 80) nuevaPagina();
    texto(l, M + 16, y - 9, { size: 8.5 });
    y -= 11;
  }
  y -= 30;

  // --- Firmas ---
  if (y < 70) nuevaPagina();
  const tercio = (W - 2 * M) / 3;
  [["Elaborado por", p.elaborado_por || empresa?.firma_elaborado], ["Revisado por", p.revisado_por || empresa?.firma_revisado], ["Autorizado por", empresa?.firma_autorizado]].forEach(([rot, nombre], i) => {
    const x0 = M + i * tercio;
    page.drawLine({ start: { x: x0 + 10, y }, end: { x: x0 + tercio - 10, y }, thickness: 0.5, color: INK });
    if (nombre) texto(nombre, x0 + tercio / 2, y + 4, { size: 8, align: "center" });
    texto(rot, x0 + tercio / 2, y - 10, { size: 7.5, align: "center" });
  });
}

// Arma el PDF. partidas: filas de obtenerPartidas() ya filtradas por rango.
// Devuelve { bytes, partidas, respaldos, sinRespaldo } (sinRespaldo = partidas de ventas/compras agrupadas sin ningún PDF).
export async function generarPdfPartidasConRespaldos({ empresa, empresaId, partidas, alAvanzar = () => {} }) {
  const { generarPdfDte, formatoDteEmpresa } = await import("@/lib/dtePdf");
  const ordenadas = [...partidas].sort(compararPartidas);
  const respaldos = await obtenerRespaldosDte(empresaId, ordenadas.map((p) => p.id));

  const doc = await PDFDocument.create();
  doc.setTitle(`Partidas con respaldos — ${empresa?.nombre || ""}`.trim());
  doc.setProducer("ContaCloud");
  doc.setCreator("ContaCloud");
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const fb = await doc.embedFont(StandardFonts.HelveticaBold);

  let totalRespaldos = 0;
  let sinRespaldo = 0;
  let hechas = 0;
  for (const p of ordenadas) {
    const lista = respaldos[p.id] || [];
    dibujarPartida(doc, f, fb, empresa, p, lista.length);
    if (p.agrupada && lista.length === 0) sinRespaldo += 1;
    for (const r of lista) {
      try {
        const bytes = await generarPdfDte(r.dte, { formato: formatoDteEmpresa(empresa) });
        const origen = await PDFDocument.load(bytes);
        const paginas = await doc.copyPages(origen, origen.getPageIndices());
        paginas.forEach((pg) => doc.addPage(pg));
        totalRespaldos += 1;
      } catch (e) {
        // Un DTE que no se pueda dibujar no debe tumbar todo el PDF.
        console.warn("No se pudo generar el PDF del DTE", r.etiqueta, e);
      }
    }
    hechas += 1;
    alAvanzar(hechas, ordenadas.length);
  }

  // Numeración de páginas del conjunto
  const paginas = doc.getPages();
  paginas.forEach((pg, i) => {
    const t = `${i + 1} / ${paginas.length}`;
    pg.drawText(t, { x: W - M - f.widthOfTextAtSize(t, 7), y: 12, size: 7, font: f, color: GRIS });
  });

  const bytes = await doc.save();
  return { bytes, partidas: ordenadas.length, respaldos: totalRespaldos, sinRespaldo };
}
