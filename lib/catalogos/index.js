// Catálogos oficiales del Ministerio de Hacienda (Facturación Electrónica) usados por los DTE:
// CAT-012 Departamento, CAT-013 Municipio, CAT-008 Distrito y CAT-019 Actividad económica.
// Los datos viven en territorio.js y actividades.js (generados desde el libro oficial; ver tools/catalogos).
import { DEPARTAMENTOS, MUNICIPIOS, DISTRITOS, VERSION_TERRITORIO } from "./territorio";
import { ACTIVIDADES, GRUPOS_ACTIVIDAD, VERSION_ACTIVIDADES } from "./actividades";

export { DEPARTAMENTOS, VERSION_TERRITORIO, VERSION_ACTIVIDADES };
export const COD_OTRO = "00"; // «Otro (para extranjeros)» en los tres catálogos territoriales

export const normalizar = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const DEP_POR_COD = new Map(DEPARTAMENTOS.map((d) => [d.c, d]));
// Los códigos de municipio y de distrito se repiten entre departamentos: la clave es (departamento, código).
const MUN_POR_CLAVE = new Map(MUNICIPIOS.map((m) => [`${m.d}|${m.c}`, m]));
const DIS_POR_CLAVE = new Map(DISTRITOS.map((d) => [`${d.d}|${d.c}`, d]));
const ACT_POR_COD = new Map(ACTIVIDADES.map((a) => [a[0], a]));
const ACT_TEXTO = ACTIVIDADES.map((a) => normalizar(`${a[0]} ${a[1]}`));

export const municipiosDe = (dep) => MUNICIPIOS.filter((m) => m.d === dep);
export const distritosDe = (dep, mun) => DISTRITOS.filter((d) => d.d === dep && (!mun || d.m === mun));

const OTRO_TEXTO = "Otro (extranjero)";
export const nombreDepartamento = (c) => (c === COD_OTRO ? OTRO_TEXTO : DEP_POR_COD.get(c)?.n ?? null);
export const nombreMunicipio = (dep, c) => (c === COD_OTRO ? OTRO_TEXTO : MUN_POR_CLAVE.get(`${dep}|${c}`)?.n ?? null);
export const nombreDistrito = (dep, c) => (c === COD_OTRO ? OTRO_TEXTO : DIS_POR_CLAVE.get(`${dep}|${c}`)?.n ?? null);

export function actividadPorCodigo(codigo) {
  const a = ACT_POR_COD.get(String(codigo ?? "").trim());
  return a ? { codigo: a[0], descripcion: a[1], grupo: GRUPOS_ACTIVIDAD[a[2]] ?? "" } : null;
}

// Busca por código o por palabras de la descripción (sin acentos ni mayúsculas); todas las palabras deben aparecer.
export function buscarActividades(texto, limite = 40) {
  const q = normalizar(texto);
  const fila = (a) => ({ codigo: a[0], descripcion: a[1], grupo: GRUPOS_ACTIVIDAD[a[2]] ?? "" });
  if (!q) return ACTIVIDADES.slice(0, limite).map(fila);
  const palabras = q.split(" ");
  const primeros = [];
  const resto = [];
  ACTIVIDADES.forEach((a, i) => {
    if (!palabras.every((p) => ACT_TEXTO[i].includes(p))) return;
    (a[0].startsWith(palabras[0]) ? primeros : resto).push(a);
  });
  return [...primeros, ...resto].slice(0, limite).map(fila);
}

// Comprueba que departamento, municipio y distrito existan y correspondan entre sí (normativa, Anexo II).
// Todo vacío es válido aquí: la obligatoriedad la decide quien llama.
export function validarUbicacion(dep, mun, dis) {
  dep = String(dep ?? "").trim();
  mun = String(mun ?? "").trim();
  dis = String(dis ?? "").trim();
  if (!dep && !mun && !dis) return null;
  if (!dep) return "Elige el departamento.";
  if (dep === COD_OTRO) {
    return (mun && mun !== COD_OTRO) || (dis && dis !== COD_OTRO)
      ? "Para extranjeros el municipio y el distrito van como «Otro»."
      : null;
  }
  if (!DEP_POR_COD.has(dep)) return `El departamento ${dep} no existe en el catálogo CAT-012.`;
  if (!mun) return "Elige el municipio.";
  if (!MUN_POR_CLAVE.has(`${dep}|${mun}`)) {
    return `El municipio ${mun} no corresponde al departamento ${nombreDepartamento(dep)} (CAT-013).`;
  }
  if (!dis) return "Elige el distrito.";
  const d = DIS_POR_CLAVE.get(`${dep}|${dis}`);
  if (!d) return `El distrito ${dis} no existe en ${nombreDepartamento(dep)} (CAT-008).`;
  if (d.m !== mun) {
    return `El distrito ${d.n} pertenece al municipio ${nombreMunicipio(dep, d.m)}, no a ${nombreMunicipio(dep, mun)}.`;
  }
  return null;
}

export const ubicacionCompleta = (dep, mun, dis) =>
  Boolean(dep && mun && dis) && validarUbicacion(dep, mun, dis) === null;

// El complemento de la dirección debe incluir el nombre del distrito (Anexo II, campo "complemento").
export function complementoDte(texto, dep, dis) {
  const base = String(texto ?? "").trim().replace(/\s+/g, " ");
  const nombre = nombreDistrito(dep, dis);
  if (!nombre || dis === COD_OTRO) return base || null;
  if (normalizar(base).includes(normalizar(nombre))) return base;
  return base ? `${base}, ${nombre}` : nombre;
}

// Texto legible de una dirección guardada con códigos (o con texto, en documentos anteriores).
export function textoDireccion({ complemento, departamento, municipio, distrito } = {}) {
  const dep = String(departamento ?? "");
  const mun = String(municipio ?? "");
  const nombres = [
    nombreMunicipio(dep, mun) ?? (/^\d{2}$/.test(mun) ? null : mun),
    nombreDepartamento(dep) ?? (/^\d{2}$/.test(dep) ? null : dep),
  ].filter(Boolean);
  // El distrito ya va dentro del complemento; si no hay complemento se muestra solo.
  const dis = nombreDistrito(dep, String(distrito ?? ""));
  const partes = [complemento || (dis && distrito !== COD_OTRO ? dis : null), ...nombres].filter(Boolean);
  return partes.join(", ");
}
