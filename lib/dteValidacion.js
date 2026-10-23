// Validación de un DTE en JSON contra el esquema oficial del Ministerio de Hacienda (JSON Schema).
// Los esquemas se cargan en lib/schemas (ver tools/esquemas/construir.js).
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { ESQUEMAS } from "@/lib/schemas";

const compilados = new Map();

// Clave del esquema: tipo de DTE y versión, p. ej. "03-3" (Crédito Fiscal, versión 3).
export function claveEsquema(dte) {
  const id = dte?.identificacion || {};
  return `${String(id.tipoDte ?? "").trim()}-${String(id.version ?? "").trim()}`;
}

function compilar(clave) {
  if (compilados.has(clave)) return compilados.get(clave);
  const esquema = ESQUEMAS[clave];
  let validador = null;
  if (esquema) {
    // Una instancia por esquema: así no chocan los $id de los distintos tipos de documento
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    validador = ajv.compile(esquema);
  }
  compilados.set(clave, validador);
  return validador;
}

function describir(e) {
  const p = e.params || {};
  switch (e.keyword) {
    case "required":
      return `Falta el campo obligatorio "${p.missingProperty}".`;
    case "type":
      return `Debe ser de tipo ${Array.isArray(p.type) ? p.type.join(" o ") : p.type}${e.message?.includes("null") ? "" : ""}.`;
    case "pattern":
      return `No tiene el formato esperado (${p.pattern}).`;
    case "enum":
      return `Valor no permitido. Valores válidos: ${(p.allowedValues || []).join(", ")}.`;
    case "const":
      return `Debe ser ${JSON.stringify(p.allowedValue)}.`;
    case "maxLength":
      return `Excede el largo máximo de ${p.limit} caracteres.`;
    case "minLength":
      return `Debe tener al menos ${p.limit} caracteres.`;
    case "maximum":
    case "exclusiveMaximum":
      return `Debe ser menor${e.keyword === "maximum" ? " o igual" : ""} que ${p.limit}.`;
    case "minimum":
    case "exclusiveMinimum":
      return `Debe ser mayor${e.keyword === "minimum" ? " o igual" : ""} que ${p.limit}.`;
    case "additionalProperties":
      return `Campo no permitido: "${p.additionalProperty}".`;
    case "maxItems":
      return `Admite como máximo ${p.limit} elementos.`;
    case "minItems":
      return `Debe tener al menos ${p.limit} elemento(s).`;
    case "format":
      return `No cumple el formato ${p.format}.`;
    default:
      return e.message || "No cumple el esquema.";
  }
}

// → { estado: "valido" | "invalido" | "sin_esquema", clave, errores: [{ ruta, mensaje }] }
export function validarDte(dte) {
  const clave = claveEsquema(dte);
  let validador;
  try {
    validador = compilar(clave);
  } catch (e) {
    return { estado: "sin_esquema", clave, errores: [], motivo: "El esquema cargado no se pudo compilar: " + e.message };
  }
  if (!validador) return { estado: "sin_esquema", clave, errores: [] };
  if (validador(dte)) return { estado: "valido", clave, errores: [] };
  const vistos = new Set();
  const errores = [];
  for (const e of validador.errors || []) {
    const ruta = (e.instancePath || "").replace(/^\//, "").replace(/\//g, " › ") || "(documento)";
    const mensaje = describir(e);
    const k = ruta + "|" + mensaje;
    if (vistos.has(k)) continue;
    vistos.add(k);
    errores.push({ ruta, mensaje });
  }
  return { estado: "invalido", clave, errores };
}

export const hayEsquemas = () => Object.keys(ESQUEMAS).length > 0;
export const clavesEsquemas = () => Object.keys(ESQUEMAS);
