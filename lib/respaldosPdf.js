import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { supabase } from "@/lib/supabaseClient";
import { etiquetaPartida, compararPartidas, tipoPartida } from "@/lib/partidas";

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

// Dibuja la(s) hoja(s) de una partida en `doc`.
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

  const xDebe = W - M - 80;
  const xHaber = W - M;
  const anchoCuenta = xDebe - 70 - M - 60;

  function nuevaPagina(cont) {
    page = doc.addPage([W, H]);
    y = H - M;
    if (cont) {
      texto(`Partida ${etiquetaPartida(p.tipo, p.numero_partida)} — ${fechaFmt(p.fecha)} (continuación)`, M, y - 8, {
        size: 8, font: fb, color: GRIS,
      });
      y -= 24;
    }
    // encabezado de la tabla
    page.drawRectangle({ x: M, y: y - 16, width: W - 2 * M, height: 16, color: FONDO });
    texto("Código", M + 4, y - 11, { size: 8, font: fb });
    texto("Cuenta / detalle", M + 70, y - 11, { size: 8, font: fb });
    texto("Debe", xDebe, y - 11, { size: 8, font: fb, align: "right" });
    texto("Haber", xHaber - 4, y - 11, { size: 8, font: fb, align: "right" });
    y -= 22;
  }

  // --- Cabecera de la partida (primera página) ---
  page = doc.addPage([W, H]);
  y = H - M;
  texto(empresa?.nombre || "", M, y - 10, { size: 11, font: fb });
  texto("PARTIDA CONTABLE", W - M, y - 10, { size: 9, font: fb, color: GRIS, align: "right" });
  y -= 30;
  texto(`${tipoPartida(p.tipo).label} N° ${etiquetaPartida(p.tipo, p.numero_partida)}`, M, y - 12, { size: 14, font: fb });
  texto(`Fecha: ${fechaFmt(p.fecha)}`, W - M, y - 12, { size: 10, font: fb, align: "right" });
  y -= 28;
  for (const l of ajustar(p.descripcion || "", f, 9, W - 2 * M)) {
    texto(l, M, y - 9, { size: 9 });
    y -= 12;
  }
  if (nRespaldos > 0) {
    texto(`Respaldos adjuntos a continuación: ${nRespaldos} documento${nRespaldos === 1 ? "" : "s"} (DTE).`, M, y - 9, { size: 8, color: GRIS });
    y -= 12;
  }
  y -= 8;
  // tabla (reutiliza nuevaPagina para el encabezado de columnas sin crear otra página)
  page.drawRectangle({ x: M, y: y - 16, width: W - 2 * M, height: 16, color: FONDO });
  texto("Código", M + 4, y - 11, { size: 8, font: fb });
  texto("Cuenta / detalle", M + 70, y - 11, { size: 8, font: fb });
  texto("Debe", xDebe, y - 11, { size: 8, font: fb, align: "right" });
  texto("Haber", xHaber - 4, y - 11, { size: 8, font: fb, align: "right" });
  y -= 22;

  const lineas = [...(p.movimientos || [])].sort(
    (a, b) => (Number(b.debe) > 0) - (Number(a.debe) > 0) || String(a.cuentas?.codigo).localeCompare(String(b.cuentas?.codigo))
  );
  let totalDebe = 0;
  let totalHaber = 0;
  for (const m of lineas) {
    const nombre = ajustar(m.cuentas?.nombre || "", f, 8.5, anchoCuenta + 60);
    const detalle = Array.isArray(m.detalle) ? m.detalle : [];
    const alto = nombre.length * 11 + detalle.length * 10 + 3;
    if (y - alto < 70) nuevaPagina(true);
    texto(m.cuentas?.codigo || "", M + 4, y - 9, { size: 8.5 });
    nombre.forEach((l, i) => texto(l, M + 70, y - 9 - i * 11, { size: 8.5 }));
    if (Number(m.debe) > 0) texto(dinero(m.debe), xDebe, y - 9, { size: 8.5, align: "right" });
    if (Number(m.haber) > 0) texto(dinero(m.haber), xHaber - 4, y - 9, { size: 8.5, align: "right" });
    let yy = y - 9 - (nombre.length - 1) * 11;
    for (const d of detalle) {
      yy -= 10;
      const t = d?.texto ? `${d.texto}${d.monto != null ? `  ${dinero(d.monto)}` : ""}` : String(d);
      texto(t, M + 82, yy, { size: 7, color: GRIS });
    }
    y -= alto;
    totalDebe += Number(m.debe) || 0;
    totalHaber += Number(m.haber) || 0;
  }
  if (y < 90) nuevaPagina(true);
  page.drawLine({ start: { x: M, y: y - 2 }, end: { x: W - M, y: y - 2 }, thickness: 0.6, color: LINEA });
  texto("Sumas iguales", M + 70, y - 14, { size: 9, font: fb });
  texto(dinero(r2(totalDebe)), xDebe, y - 14, { size: 9, font: fb, align: "right" });
  texto(dinero(r2(totalHaber)), xHaber - 4, y - 14, { size: 9, font: fb, align: "right" });
  y -= 50;

  // Firmas
  if (y > 70) {
    const mitad = (W - 2 * M) / 3;
    ["Elaborado por", "Revisado por", "Autorizado por"].forEach((rot, i) => {
      const x0 = M + i * mitad;
      page.drawLine({ start: { x: x0 + 10, y }, end: { x: x0 + mitad - 10, y }, thickness: 0.5, color: LINEA });
      texto(rot, x0 + mitad / 2, y - 10, { size: 7.5, color: GRIS, align: "center" });
      const nombre = i === 0 ? p.elaborado_por : i === 1 ? p.revisado_por : "";
      if (nombre) texto(nombre, x0 + mitad / 2, y + 4, { size: 8, align: "center" });
    });
  }
}

// Arma el PDF. partidas: filas de obtenerPartidas() ya filtradas por rango.
// Devuelve { bytes, partidas, respaldos, sinRespaldo } (sinRespaldo = partidas de ventas/compras agrupadas sin ningún PDF).
export async function generarPdfPartidasConRespaldos({ empresa, empresaId, partidas, alAvanzar = () => {} }) {
  const { generarPdfDte } = await import("@/lib/dtePdf");
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
        const bytes = await generarPdfDte(r.dte);
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
