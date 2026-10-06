// Colores de marca: conversión, contraste (WCAG) y variables CSS del tema.
// El tema se aplica con variables CSS (--brand, --accent…) que usa tailwind.config.js; los valores por
// defecto viven en app/globals.css y reproducen la paleta original del sistema.

export const COLORES_ORIGINALES = { primario: "#1F2A3C", acento: "#A8703A" };

const PAPEL = "#EFEBDE"; // fondo del sistema
const CLARO = "#EFEBDE"; // texto claro sobre fondos de marca oscuros
const OSCURO = "#1F2A3C"; // texto oscuro sobre fondos de marca claros

export const esHex = (c) => /^#[0-9a-fA-F]{6}$/.test(String(c ?? ""));

// Acepta "#abc", "abc" o "#AABBCC" y devuelve "#AABBCC" (o null si no es un color).
export function normalizarHex(c) {
  let s = String(c ?? "").trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(s)) s = s.split("").map((x) => x + x).join("");
  return /^[0-9a-fA-F]{6}$/.test(s) ? `#${s.toUpperCase()}` : null;
}

export const hexARgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export const rgbAHex = (rgb) =>
  "#" +
  rgb
    .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();

export function luminancia(hex) {
  const [r, g, b] = hexARgb(hex).map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Relación de contraste WCAG entre dos colores (de 1 a 21). 4.5 o más se lee bien.
export function contraste(a, b) {
  const la = luminancia(a);
  const lb = luminancia(b);
  const [mayor, menor] = la > lb ? [la, lb] : [lb, la];
  return (mayor + 0.05) / (menor + 0.05);
}

export function mezclar(a, b, t) {
  const x = hexARgb(a);
  const y = hexARgb(b);
  return rgbAHex(x.map((v, i) => v + (y[i] - v) * t));
}

// Texto (claro u oscuro) que mejor se lee sobre un fondo de marca.
// Prefiere los tonos del sistema; si con ellos no se lee bien (colores de tono medio), usa blanco o negro,
// que siempre alcanzan un contraste de al menos 4.5.
export function textoSobre(fondo) {
  const mejor = contraste(fondo, CLARO) >= contraste(fondo, OSCURO) ? CLARO : OSCURO;
  if (contraste(fondo, mejor) >= 4.5) return mejor;
  return contraste(fondo, "#FFFFFF") >= contraste(fondo, "#000000") ? "#FFFFFF" : "#000000";
}

// Oscurece un color hasta que se lea bien como texto sobre el fondo del sistema.
export function oscurecerHastaContraste(hex, fondo = PAPEL, minimo = 4.5) {
  let c = hex;
  for (let i = 0; i < 40 && contraste(c, fondo) < minimo; i++) c = mezclar(c, "#000000", 0.06);
  return c;
}

const trio = (hex) => hexARgb(hex).join(" ");

// Variables CSS del tema a partir de los dos colores elegidos. Un color vacío o inválido no genera variables
// (el sistema sigue con el original).
export function variablesTema({ primario, acento } = {}) {
  const v = {};
  const p = normalizarHex(primario);
  const a = normalizarHex(acento);
  if (p) {
    // El hover aclara los colores muy oscuros y oscurece el resto, para que siempre se note
    const hover = luminancia(p) < 0.2 ? mezclar(p, "#FFFFFF", 0.15) : mezclar(p, "#000000", 0.15);
    v["--brand"] = trio(p);
    v["--brand-dark"] = trio(hover);
    v["--on-brand"] = trio(textoSobre(p));
  }
  if (a) {
    const oscuro = oscurecerHastaContraste(a);
    v["--accent"] = trio(a);
    v["--accent-dark"] = trio(oscuro);
    v["--on-accent"] = trio(textoSobre(oscuro));
  }
  return v;
}

// Avisos para la persona que elige el color (null si está bien).
export function avisoColorPrimario(hex) {
  const p = normalizarHex(hex);
  if (!p) return null;
  return contraste(p, PAPEL) < 1.6
    ? "Este color es muy claro: los botones y encabezados casi no se distinguirán del fondo."
    : null;
}
