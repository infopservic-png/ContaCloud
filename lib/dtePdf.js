import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// Representación gráfica (PDF) de un DTE, generada a partir de su JSON.
// Funciona en el navegador y en Node. Devuelve los bytes del PDF.

const TIPOS = {
  "01": "FACTURA ELECTRÓNICA",
  "03": "COMPROBANTE DE CRÉDITO FISCAL ELECTRÓNICO",
};

const W = 612; // carta
const H = 792;
const M = 40;
const INK = rgb(0.12, 0.16, 0.24);
const GRIS = rgb(0.42, 0.45, 0.5);
const LINEA = rgb(0.8, 0.8, 0.8);
const FONDO = rgb(0.96, 0.95, 0.91);
const AMBAR = rgb(0.66, 0.44, 0.23);
const AMBAR_CLARO = rgb(0.99, 0.94, 0.85);

// ---------- Monto en letras (ej. "CIENTO TRECE 00/100 DÓLARES") ----------
const UNIDADES = ["", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE", "DIEZ",
  "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISÉIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE",
  "VEINTE", "VEINTIUNO", "VEINTIDÓS", "VEINTITRÉS", "VEINTICUATRO", "VEINTICINCO", "VEINTISÉIS",
  "VEINTISIETE", "VEINTIOCHO", "VEINTINUEVE"];
const DECENAS = ["", "", "", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
const CENTENAS = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS",
  "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];

function menorDeMil(n) {
  if (n === 100) return "CIEN";
  const c = Math.floor(n / 100);
  const r = n % 100;
  const partes = [];
  if (c) partes.push(CENTENAS[c]);
  if (r) {
    if (r < 30) partes.push(UNIDADES[r]);
    else {
      const d = Math.floor(r / 10);
      const u = r % 10;
      partes.push(u ? `${DECENAS[d]} Y ${UNIDADES[u]}` : DECENAS[d]);
    }
  }
  return partes.join(" ");
}
const apocopar = (s) => s.replace(/VEINTIUNO$/, "VEINTIÚN").replace(/UNO$/, "UN");

function enLetras(n) {
  if (n === 0) return "CERO";
  const millones = Math.floor(n / 1e6);
  const miles = Math.floor((n % 1e6) / 1000);
  const resto = n % 1000;
  const partes = [];
  if (millones) partes.push(millones === 1 ? "UN MILLÓN" : `${apocopar(enLetras(millones))} MILLONES`);
  if (miles) partes.push(miles === 1 ? "MIL" : `${apocopar(menorDeMil(miles))} MIL`);
  if (resto) partes.push(menorDeMil(resto));
  return partes.join(" ");
}

export function montoEnLetras(monto) {
  const total = Math.round(Number(monto || 0) * 100);
  const dolares = Math.min(Math.floor(total / 100), 999999999);
  const centavos = total % 100;
  return `${enLetras(dolares)} ${String(centavos).padStart(2, "0")}/100 DÓLARES`;
}

// ---------- Formatos ----------
const dinero = (n) =>
  "$ " + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cantidadFmt = (n) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 4 });
const precioFmt = (n) =>
  Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
function fechaFmt(f) {
  const m = String(f || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : f || "";
}

// ---------- Generador ----------
export async function generarPdfDte(dte, opciones = {}) {
  const ident = dte?.identificacion || {};
  const emisor = dte?.emisor || {};
  const receptor = dte?.receptor || {};
  const cuerpo = dte?.cuerpoDocumento || [];
  const resumen = dte?.resumen || {};
  // En la Factura nueva el precio incluye IVA (venta gravada = total). Los documentos
  // emitidos antes de esa regla traen el IVA sumado aparte y se rotulan como CCF.
  const ivaIncluido =
    Number(resumen.totalIva) > 0 &&
    Math.abs(Number(resumen.totalGravada) - Number(resumen.montoTotalOperacion)) < 0.005;
  const sello = dte?.selloRecibido || null;

  const doc = await PDFDocument.create();
  doc.setTitle(`${TIPOS[ident.tipoDte] || "DTE"} ${ident.numeroControl || ""}`.trim());
  doc.setProducer("ContaCloud");
  doc.setCreator("ContaCloud");
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const fb = await doc.embedFont(StandardFonts.HelveticaBold);
  const soportados = new Set(f.getCharacterSet());

  const limpiar = (s) =>
    Array.from(String(s ?? "").replace(/[\r\n\t]+/g, " "))
      .map((ch) => (soportados.has(ch.codePointAt(0)) ? ch : "?"))
      .join("");

  function ajustar(texto, font, size, ancho) {
    const palabras = limpiar(texto).split(" ").filter(Boolean);
    const lineas = [];
    let actual = "";
    const cabe = (t) => font.widthOfTextAtSize(t, size) <= ancho;
    for (let p of palabras) {
      while (!cabe(p)) {
        let i = p.length - 1;
        while (i > 1 && !cabe(p.slice(0, i))) i--;
        if (actual) {
          lineas.push(actual);
          actual = "";
        }
        lineas.push(p.slice(0, i));
        p = p.slice(i);
      }
      const prueba = actual ? `${actual} ${p}` : p;
      if (cabe(prueba)) actual = prueba;
      else {
        lineas.push(actual);
        actual = p;
      }
    }
    if (actual) lineas.push(actual);
    return lineas.length ? lineas : [""];
  }

  let page;
  let y;
  function nuevaPagina(continuacion) {
    page = doc.addPage([W, H]);
    y = H - M;
    if (continuacion) {
      texto(`${TIPOS[ident.tipoDte] || "DTE"} — ${ident.numeroControl || ""} (continuación)`, M, y - 8, {
        size: 8, font: fb, color: GRIS,
      });
      y -= 24;
    }
  }
  function texto(s, x, yy, { size = 9, font = f, color = INK, align = "left" } = {}) {
    const t = limpiar(s);
    const w = font.widthOfTextAtSize(t, size);
    const xx = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
    page.drawText(t, { x: xx, y: yy, size, font, color });
  }
  function bloque(s, x, yy, ancho, { size = 9, font = f, color = INK, interlineado = size + 2.5 } = {}) {
    const lineas = ajustar(s, font, size, ancho);
    lineas.forEach((l, i) => texto(l, x, yy - i * interlineado, { size, font, color }));
    return lineas.length * interlineado;
  }

  nuevaPagina(false);

  // --- Encabezado: emisor (izquierda) y datos del documento (derecha) ---
  const cajaW = 240;
  const cajaX = W - M - cajaW;
  const izqW = cajaX - M - 14;
  const top = y;

  let yi = top - 12;
  yi -= bloque(emisor.nombreComercial || emisor.nombre || "—", M, yi, izqW, { size: 14, font: fb });
  if (emisor.nombreComercial && emisor.nombre && emisor.nombreComercial !== emisor.nombre) {
    yi -= bloque(emisor.nombre, M, yi, izqW, { size: 8.5, color: GRIS });
  }
  yi -= 3;
  const dir = [emisor.direccion?.complemento, emisor.direccion?.municipio, emisor.direccion?.departamento]
    .filter(Boolean).join(", ");
  const lineasEmisor = [
    `NIT: ${emisor.nit || "—"}   NRC: ${emisor.nrc || "—"}`,
    emisor.codActividad ? `Giro: ${emisor.codActividad}` : null,
    dir ? `Dirección: ${dir}` : null,
    [emisor.telefono ? `Tel.: ${emisor.telefono}` : null, emisor.correo ? `Correo: ${emisor.correo}` : null]
      .filter(Boolean).join("   ") || null,
  ].filter(Boolean);
  for (const l of lineasEmisor) yi -= bloque(l, M, yi, izqW, { size: 8.5 });

  // caja del documento
  const campos = [
    ["Código de generación", ident.codigoGeneracion || "—"],
    ["Número de control", ident.numeroControl || "—"],
    ["Sello de recepción", sello || "Pendiente (documento no transmitido)"],
    ["Fecha y hora de emisión", `${fechaFmt(ident.fecEmi)} ${ident.horEmi || ""}`.trim()],
    ["Moneda", ident.moneda || "USD"],
  ];
  const titulo = TIPOS[ident.tipoDte] || "DOCUMENTO TRIBUTARIO ELECTRÓNICO";
  const lineasTitulo = ajustar(titulo, fb, 10, cajaW - 16);
  let altoCaja = 10 + lineasTitulo.length * 12 + 4;
  const preparados = campos.map(([et, v]) => {
    const ls = ajustar(v, f, 8, cajaW - 16);
    altoCaja += 9 + ls.length * 10 + 4;
    return [et, ls];
  });
  altoCaja += 4;
  page.drawRectangle({ x: cajaX, y: top - altoCaja, width: cajaW, height: altoCaja, borderColor: INK, borderWidth: 1 });
  let yc = top - 16;
  lineasTitulo.forEach((l) => {
    texto(l, cajaX + cajaW / 2, yc, { size: 10, font: fb, align: "center" });
    yc -= 12;
  });
  yc -= 2;
  for (const [et, ls] of preparados) {
    texto(et, cajaX + 8, yc, { size: 7, font: fb, color: GRIS });
    yc -= 9;
    ls.forEach((l) => {
      texto(l, cajaX + 8, yc, { size: 8 });
      yc -= 10;
    });
    yc -= 4;
  }
  y = Math.min(yi, top - altoCaja) - 14;

  // --- Aviso: sin firma ni sello ---
  if (!sello) {
    const h = 32;
    page.drawRectangle({ x: M, y: y - h, width: W - 2 * M, height: h, color: AMBAR_CLARO, borderColor: AMBAR, borderWidth: 1 });
    texto("DOCUMENTO SIN FIRMAR NI TRANSMITIDO — SIN VALIDEZ FISCAL", W / 2, y - 13, { size: 10, font: fb, color: AMBAR, align: "center" });
    texto("Borrador generado en ContaCloud: no cuenta con firma electrónica ni Sello de Recepción del Ministerio de Hacienda.",
      W / 2, y - 25, { size: 7.5, color: AMBAR, align: "center" });
    y -= h + 12;
  }

  // --- Receptor ---
  const colW = (W - 2 * M - 24) / 2;
  const filas = [
    [["Nombre o razón social", receptor.nombre || "—"], ["NIT / DUI", receptor.numDocumento || "—"]],
    [["NRC", receptor.nrc || "—"], ["Correo", receptor.correo || "—"]],
    [["Dirección", receptor.direccion || "—"], ["Condición de la operación", resumen.condicionOperacion === 2 ? "Crédito" : "Contado"]],
  ];
  const medidas = filas.map((fila) => fila.map(([et, v]) => ajustar(v, f, 9, colW)));
  const altos = medidas.map((ms) => 9 + Math.max(...ms.map((l) => l.length)) * 11 + 5);
  const altoReceptor = 20 + altos.reduce((a, b) => a + b, 0);
  page.drawRectangle({ x: M, y: y - altoReceptor, width: W - 2 * M, height: altoReceptor, color: FONDO, borderColor: LINEA, borderWidth: 0.75 });
  texto("RECEPTOR", M + 10, y - 13, { size: 8, font: fb, color: GRIS });
  let yr = y - 26;
  filas.forEach((fila, i) => {
    fila.forEach(([et], j) => {
      const x = M + 10 + j * (colW + 4);
      texto(et, x, yr, { size: 7, font: fb, color: GRIS });
      medidas[i][j].forEach((l, k) => texto(l, x, yr - 10 - k * 11, { size: 9 }));
    });
    yr -= altos[i];
  });
  y -= altoReceptor + 14;

  // --- Tabla de detalle ---
  const cols = [
    { t: "N°", w: 26, a: "center" },
    { t: "Código", w: 62, a: "left" },
    { t: "Descripción", w: 222, a: "left" },
    { t: "Cantidad", w: 56, a: "right" },
    { t: "Precio unit.", w: 80, a: "right" },
    { t: "Venta gravada", w: 86, a: "right" },
  ];
  const anchoTabla = cols.reduce((s, c) => s + c.w, 0);
  const xs = [];
  cols.reduce((x, c) => (xs.push(x), x + c.w), M);

  function encabezadoTabla() {
    page.drawRectangle({ x: M, y: y - 17, width: anchoTabla, height: 17, color: INK });
    cols.forEach((c, i) => {
      const x = c.a === "right" ? xs[i] + c.w - 6 : c.a === "center" ? xs[i] + c.w / 2 : xs[i] + 6;
      texto(c.t, x, y - 12, { size: 8, font: fb, color: rgb(1, 1, 1), align: c.a });
    });
    y -= 17;
  }
  encabezadoTabla();

  cuerpo.forEach((it, idx) => {
    const desc = ajustar(it.descripcion || "", f, 8.5, cols[2].w - 12);
    const alto = Math.max(desc.length * 11, 11) + 8;
    if (y - alto < M + 40) {
      nuevaPagina(true);
      encabezadoTabla();
    }
    const base = y - 12;
    texto(String(it.numItem ?? idx + 1), xs[0] + cols[0].w / 2, base, { size: 8.5, align: "center" });
    texto(it.codigo || "", xs[1] + 6, base, { size: 8.5 });
    desc.forEach((l, k) => texto(l, xs[2] + 6, base - k * 11, { size: 8.5 }));
    texto(cantidadFmt(it.cantidad), xs[3] + cols[3].w - 6, base, { size: 8.5, align: "right" });
    texto(precioFmt(it.precioUni), xs[4] + cols[4].w - 6, base, { size: 8.5, align: "right" });
    texto(dinero(it.ventaGravada), xs[5] + cols[5].w - 6, base, { size: 8.5, align: "right" });
    y -= alto;
    page.drawLine({ start: { x: M, y }, end: { x: M + anchoTabla, y }, thickness: 0.5, color: LINEA });
  });

  if (ivaIncluido) {
    texto("Precios con IVA incluido.", M, y - 11, { size: 7.5, color: GRIS });
  }
  y -= 22;

  // --- Totales ---
  if (y < M + 95) nuevaPagina(true);
  const totW = 240;
  const totX = W - M - totW;
  const filasTot = [
    [ivaIncluido ? "Total gravado (IVA incluido)" : "Suma de ventas gravadas", dinero(resumen.totalGravada)],
    [ivaIncluido ? "IVA incluido (13%)" : "IVA (13%)", dinero(resumen.totalIva)],
  ];
  let yt = y;
  filasTot.forEach(([et, v]) => {
    texto(et, totX + 8, yt - 11, { size: 9 });
    texto(v, totX + totW - 8, yt - 11, { size: 9, align: "right" });
    page.drawLine({ start: { x: totX, y: yt - 16 }, end: { x: totX + totW, y: yt - 16 }, thickness: 0.5, color: LINEA });
    yt -= 18;
  });
  page.drawRectangle({ x: totX, y: yt - 22, width: totW, height: 22, color: INK });
  texto("TOTAL A PAGAR", totX + 8, yt - 15, { size: 10, font: fb, color: rgb(1, 1, 1) });
  texto(dinero(resumen.montoTotalOperacion), totX + totW - 8, yt - 15, { size: 10, font: fb, color: rgb(1, 1, 1), align: "right" });

  // monto en letras (izquierda de los totales)
  const letrasW = totX - M - 16;
  texto("SON:", M, y - 11, { size: 8, font: fb, color: GRIS });
  bloque(montoEnLetras(resumen.montoTotalOperacion), M, y - 23, letrasW, { size: 9.5, font: fb });

  // --- Pie en todas las páginas ---
  const paginas = doc.getPages();
  paginas.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 34 }, end: { x: W - M, y: 34 }, thickness: 0.5, color: LINEA });
    p.drawText(limpiar("Representación gráfica generada con ContaCloud a partir del JSON del DTE."), { x: M, y: 22, size: 7, font: f, color: GRIS });
    const pg = `Página ${i + 1} de ${paginas.length}`;
    p.drawText(pg, { x: W - M - f.widthOfTextAtSize(pg, 7), y: 22, size: 7, font: f, color: GRIS });
  });

  return doc.save();
}
