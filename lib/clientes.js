// Reglas de la ficha de cliente: formato de datos y detección de duplicados.
import { soloDigitos, normalizarNrc } from "@/lib/datosFiscales";

export const AMBIENTES = { real: "Real", practica: "Práctica" };

// El último dígito del DUI es verificador: suma de los 8 primeros × (9..2); verificador = (10 − suma mod 10) mod 10.
export function validarDigitoDui(numero) {
  const n = soloDigitos(numero);
  if (n.length !== 9) return null; // el largo ya lo valida validarNumeroDocumento
  const suma = n
    .slice(0, 8)
    .split("")
    .reduce((a, d, i) => a + Number(d) * (9 - i), 0);
  return (10 - (suma % 10)) % 10 === Number(n[8])
    ? null
    : "El DUI no es válido (el dígito verificador no coincide). Revisa que esté bien digitado.";
}

export function validarCorreoCliente(correo) {
  const c = String(correo ?? "").trim();
  if (!c) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c) ? null : "El correo no tiene un formato válido (ej. nombre@dominio.com).";
}

// Teléfonos de El Salvador: 8 dígitos (con o sin el prefijo 503). Se admiten varios separados por coma o "/".
export function validarTelefonoCliente(tel, etiqueta = "teléfono") {
  const t = String(tel ?? "").trim();
  if (!t) return null;
  for (const parte of t.split(/[,/;]+/)) {
    const d = soloDigitos(parte);
    if (!(d.length === 8 || (d.length === 11 && d.startsWith("503")))) {
      return `El ${etiqueta} debe tener 8 dígitos (ej. 2222-3333).`;
    }
  }
  return null;
}

// Devuelve el primer problema de la ficha (o null). `d` son los datos ya normalizados;
// `otros` es la lista de clientes de la empresa; `idActual` el que se está editando.
export function validarFichaCliente(d, otros = [], idActual = null) {
  const resto = otros.filter((c) => c.id !== idActual);
  if (!String(d.nombre ?? "").trim()) return "El nombre del cliente es obligatorio.";
  if (d.tipo_persona === "juridica" && d.nit_dui && d.tipo_documento !== "nit")
    return "Una persona jurídica se identifica con NIT, no con DUI.";
  const errorDui = d.tipo_documento === "dui" ? validarDigitoDui(d.nit_dui) : null;
  if (errorDui) return errorDui;
  const errorCorreo = validarCorreoCliente(d.correo);
  if (errorCorreo) return errorCorreo;
  const errorTel = validarTelefonoCliente(d.telefono, "teléfono") || validarTelefonoCliente(d.movil, "móvil");
  if (errorTel) return errorTel;
  if (!(Number(d.limite_credito || 0) >= 0)) return "El límite de crédito no puede ser negativo.";
  if (d.dias_credito !== null && d.dias_credito !== "" && d.dias_credito !== undefined) {
    const n = Number(d.dias_credito);
    if (!Number.isInteger(n) || n < 0 || n > 365) return "Los días de crédito deben ser un número entero entre 0 y 365.";
  }
  if (d.modalidad_pago === "credito" && !(Number(d.dias_credito) > 0))
    return "Para un cliente al crédito indica los días de crédito.";

  // Duplicados dentro de la misma empresa
  if (d.codigo) {
    const dup = resto.find((c) => String(c.codigo ?? "").trim().toLowerCase() === d.codigo.toLowerCase());
    if (dup) return `El código ${d.codigo} ya lo usa el cliente "${dup.nombre}".`;
  }
  if (d.nit_dui) {
    const dup = resto.find((c) => soloDigitos(c.nit_dui) === d.nit_dui);
    if (dup) return `El ${d.tipo_documento === "dui" ? "DUI" : "NIT"} ${d.nit_dui} ya está registrado para "${dup.nombre}".`;
  }
  if (d.nrc) {
    const dup = resto.find((c) => normalizarNrc(c.nrc) === d.nrc);
    if (dup) return `El NRC ${d.nrc} ya está registrado para "${dup.nombre}".`;
  }
  return null;
}

// Siguiente código numérico libre (1, 2, 3…) para un cliente nuevo.
export function siguienteCodigoCliente(clientes = []) {
  const max = clientes.reduce((m, c) => {
    const n = /^\d+$/.test(String(c.codigo ?? "")) ? Number(c.codigo) : 0;
    return Math.max(m, n);
  }, 0);
  return String(max + 1);
}
