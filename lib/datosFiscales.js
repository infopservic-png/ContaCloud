// Reglas de los datos fiscales del receptor y del emisor según la Normativa de Cumplimiento de
// los DTE (Anexo II secciones 3 "Emisor" y 4 "Receptor", y Anexo IV validaciones):
//  - NIT: 9 o 14 dígitos, sin guiones ni otros caracteres.
//  - DUI: 9 dígitos, sin guiones ni otros caracteres.
//  - NRC: sin guion ni ceros a la izquierda; de 2 a 8 dígitos.
//  - Actividad económica: código del catálogo CAT-019 (5 o 6 caracteres) y su descripción (máx. 150).
//  - Dirección: departamento (CAT-012), municipio (CAT-013) y distrito (CAT-008) que correspondan entre sí.
//  - Código del tipo de documento (catálogo CAT-022): 36 = NIT, 13 = DUI.
import { actividadPorCodigo, validarUbicacion, ubicacionCompleta } from "@/lib/catalogos";

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
  if (c) {
    if (c.length < 5 || c.length > 6) {
      return "El código de actividad económica debe tener 5 o 6 caracteres (catálogo CAT-019).";
    }
    if (!actividadPorCodigo(c)) {
      return `El código de actividad económica ${c} no existe en el catálogo CAT-019 vigente. Elígela de la lista.`;
    }
  }
  if (String(descripcion ?? "").trim().length > 150) {
    return "La descripción de la actividad económica admite hasta 150 caracteres.";
  }
  return null;
}

// Código de establecimiento o de punto de venta asignado por Hacienda (ej. M001, P001): 4 caracteres alfanuméricos.
export const normalizarCodigoMH = (s) => String(s ?? "").trim().toUpperCase();
export function validarCodigoMH(codigo, etiqueta) {
  const c = normalizarCodigoMH(codigo);
  if (!c) return null;
  return /^[A-Z0-9]{4}$/.test(c)
    ? null
    : `El código de ${etiqueta} debe tener 4 caracteres (letras o números), por ejemplo M001 o P001.`;
}

// Limpia los datos fiscales de un cliente o receptor (deja el resto de campos igual).
export function normalizarDatosFiscales(d = {}) {
  const cod = String(d.cod_actividad ?? "").replace(/\s+/g, "");
  const actividad = actividadPorCodigo(cod);
  return {
    ...d,
    tipo_documento: d.tipo_documento === "dui" ? "dui" : "nit",
    nit_dui: soloDigitos(d.nit_dui),
    nrc: normalizarNrc(d.nrc),
    nombre_comercial: String(d.nombre_comercial ?? "").trim(),
    cod_actividad: cod,
    // La descripción debe corresponder al código: si el código existe, se toma la del catálogo.
    desc_actividad: actividad ? actividad.descripcion : String(d.desc_actividad ?? "").trim(),
    cod_departamento: String(d.cod_departamento ?? "").trim(),
    cod_municipio: String(d.cod_municipio ?? "").trim(),
    cod_distrito: String(d.cod_distrito ?? "").trim(),
  };
}

// Devuelve el primer problema encontrado (o null). Los datos deben venir normalizados.
export function validarDatosFiscales(d) {
  return (
    validarNumeroDocumento(d.tipo_documento, d.nit_dui) ||
    validarNrc(d.nrc) ||
    validarActividad(d.cod_actividad, d.desc_actividad) ||
    validarUbicacion(d.cod_departamento, d.cod_municipio, d.cod_distrito)
  );
}

const direccionCompleta = (dep, mun, dis, complemento) =>
  ubicacionCompleta(dep, mun, dis) && String(complemento ?? "").trim().length > 0;

// Qué le falta a un cliente para poder emitirle un Crédito Fiscal.
export function faltantesCreditoFiscal(c = {}) {
  const f = [];
  if (!soloDigitos(c.nit_dui) || c.tipo_documento === "dui") f.push("NIT");
  if (!normalizarNrc(c.nrc)) f.push("NRC");
  if (!c.cod_actividad || !actividadPorCodigo(c.cod_actividad)) f.push("actividad económica");
  if (!direccionCompleta(c.cod_departamento, c.cod_municipio, c.cod_distrito, c.direccion)) f.push("dirección");
  return f;
}

// Qué le falta a los datos del emisor para poder transmitir (todos son "requeridos para su transmisión").
export function faltantesEmisor(e = {}) {
  const f = [];
  if (!soloDigitos(e.nit)) f.push("NIT");
  if (!normalizarNrc(e.nrc)) f.push("NRC");
  if (!e.cod_actividad || !actividadPorCodigo(e.cod_actividad)) f.push("actividad económica");
  if (!direccionCompleta(e.cod_departamento, e.cod_municipio, e.cod_distrito, e.direccion)) f.push("dirección");
  if (String(e.telefono_emisor ?? "").trim().length < 8) f.push("teléfono");
  if (String(e.correo_emisor ?? "").trim().length < 6) f.push("correo");
  return f;
}
