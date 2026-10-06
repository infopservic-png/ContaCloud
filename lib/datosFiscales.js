// Reglas de los datos fiscales del receptor según la Normativa de Cumplimiento de
// los DTE (Anexo II sección 4 "Receptor" y Anexo IV validaciones):
//  - NIT: 9 o 14 dígitos, sin guiones ni otros caracteres.
//  - DUI: 9 dígitos, sin guiones ni otros caracteres.
//  - NRC: sin guion ni ceros a la izquierda; de 2 a 8 dígitos.
//  - Código de actividad económica (catálogo CAT-019): 5 o 6 caracteres.
//  - Descripción de la actividad económica: máximo 150 caracteres.
//  - Código del tipo de documento (catálogo CAT-022): 36 = NIT, 13 = DUI.

export const TIPOS_DOCUMENTO_ID = {
  nit: { codigo: "36", etiqueta: "NIT" },
  dui: { codigo: "13", etiqueta: "DUI" },
};

export const soloDigitos = (s) => String(s ?? "").replace(/\D/g, "");
export const normalizarNrc = (s) => soloDigitos(s).replace(/^0+/, "");

export function validarNumeroDocumento(tipo, numero) {
  const n = soloDigitos(numero);
  if (!n) return null;
  if (tipo === "dui") return n.length === 9 ? null : "El DUI debe tener 9 dígitos (sin guiones).";
  return n.length === 9 || n.length === 14 ? null : "El NIT debe tener 9 o 14 dígitos (sin guiones).";
}

export function validarNrc(nrc) {
  const n = normalizarNrc(nrc);
  if (!n) return null;
  return n.length >= 2 && n.length <= 8
    ? null
    : "El NRC debe tener entre 2 y 8 dígitos (sin guiones ni ceros a la izquierda).";
}

export function validarActividad(codigo, descripcion) {
  const c = String(codigo ?? "").trim();
  if (c && (c.length < 5 || c.length > 6)) {
    return "El código de actividad económica debe tener 5 o 6 caracteres (catálogo CAT-019).";
  }
  if (String(descripcion ?? "").trim().length > 150) {
    return "La descripción de la actividad económica admite hasta 150 caracteres.";
  }
  return null;
}

// Limpia los datos fiscales de un cliente o receptor (deja el resto de campos igual).
export function normalizarDatosFiscales(d = {}) {
  return {
    ...d,
    tipo_documento: d.tipo_documento === "dui" ? "dui" : "nit",
    nit_dui: soloDigitos(d.nit_dui),
    nrc: normalizarNrc(d.nrc),
    nombre_comercial: String(d.nombre_comercial ?? "").trim(),
    cod_actividad: String(d.cod_actividad ?? "").replace(/\s+/g, ""),
    desc_actividad: String(d.desc_actividad ?? "").trim(),
  };
}

// Devuelve el primer problema encontrado (o null). Los datos deben venir normalizados.
export function validarDatosFiscales(d) {
  return (
    validarNumeroDocumento(d.tipo_documento, d.nit_dui) ||
    validarNrc(d.nrc) ||
    validarActividad(d.cod_actividad, d.desc_actividad)
  );
}

// Qué le falta a un cliente para poder emitirle un Crédito Fiscal.
export function faltantesCreditoFiscal(c = {}) {
  const f = [];
  if (!soloDigitos(c.nit_dui) || c.tipo_documento === "dui") f.push("NIT");
  if (!normalizarNrc(c.nrc)) f.push("NRC");
  if (!String(c.cod_actividad ?? "").trim() || !String(c.desc_actividad ?? "").trim()) f.push("actividad económica");
  return f;
}
