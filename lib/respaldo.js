// Copia de seguridad de una empresa: se exporta a un archivo JSON y se restaura SIEMPRE como una empresa nueva
// (nunca pisa datos existentes). Todos los identificadores se regeneran y las referencias entre tablas se reescriben.
import { supabase } from "@/lib/supabaseClient";

export const VERSION_RESPALDO = 1;

// Tablas de la empresa, padres primero. `via`: columna que enlaza con el registro padre cuando la tabla no trae empresa_id.
export const TABLAS_RESPALDO = [
  { tabla: "cuentas" },
  { tabla: "transacciones" },
  { tabla: "movimientos", via: { col: "transaccion_id", padre: "transacciones" } },
  { tabla: "productos" },
  { tabla: "clientes" },
  { tabla: "proveedores" },
  { tabla: "ventas" },
  { tabla: "compras" },
  { tabla: "venta_lineas", via: { col: "venta_id", padre: "ventas" } },
  { tabla: "compra_lineas", via: { col: "compra_id", padre: "compras" } },
  { tabla: "devoluciones" },
  { tabla: "devolucion_lineas", via: { col: "devolucion_id", padre: "devoluciones" } },
  { tabla: "kardex_movimientos", via: { col: "producto_id", padre: "productos" } },
  { tabla: "facturas_cxc" },
  { tabla: "abonos_cxc", via: { col: "factura_id", padre: "facturas_cxc" } },
  { tabla: "facturas_cxp" },
  { tabla: "abonos_cxp", via: { col: "factura_id", padre: "facturas_cxp" } },
  { tabla: "cuentas_bancarias" },
  { tabla: "movimientos_banco_estado", via: { col: "cuenta_bancaria_id", padre: "cuentas_bancarias" } },
  { tabla: "bancos_transacciones" },
  { tabla: "documentos_dte" },
  { tabla: "activos_fijos" },
  { tabla: "depreciaciones" },
  { tabla: "rrhh_config" },
  { tabla: "empleados" },
  { tabla: "planillas" },
  { tabla: "planilla_lineas" },
  { tabla: "periodos_contables" }, // al final: un período cerrado bloquearía la inserción de sus partidas
];

const POR_PAGINA = 1000;
const TROZO_IDS = 80;

async function traerTodo(construir) {
  const filas = [];
  for (let desde = 0; ; desde += POR_PAGINA) {
    const { data, error } = await construir().range(desde, desde + POR_PAGINA - 1);
    if (error) throw new Error(error.message);
    filas.push(...(data || []));
    if (!data || data.length < POR_PAGINA) break;
  }
  return filas;
}

export async function exportarRespaldo(empresaId, alAvanzar = () => {}) {
  const { data: empresa, error } = await supabase.from("empresas").select("*").eq("id", empresaId).single();
  if (error) throw new Error("No se pudo leer la empresa: " + error.message);
  const tablas = {};
  let n = 0;
  for (const t of TABLAS_RESPALDO) {
    alAvanzar(n++, TABLAS_RESPALDO.length, t.tabla);
    if (!t.via) {
      tablas[t.tabla] = await traerTodo(() => supabase.from(t.tabla).select("*").eq("empresa_id", empresaId).order("id"));
    } else {
      const ids = (tablas[t.via.padre] || []).map((x) => x.id);
      const filas = [];
      for (let i = 0; i < ids.length; i += TROZO_IDS) {
        const trozo = ids.slice(i, i + TROZO_IDS);
        filas.push(...(await traerTodo(() => supabase.from(t.tabla).select("*").in(t.via.col, trozo).order("id"))));
      }
      tablas[t.tabla] = filas;
    }
  }
  alAvanzar(TABLAS_RESPALDO.length, TABLAS_RESPALDO.length, "");
  return { app: "contacloud", version: VERSION_RESPALDO, exportado_en: new Date().toISOString(), empresa, tablas };
}

export function resumenRespaldo(r) {
  const t = r?.tablas || {};
  return {
    nombre: r?.empresa?.nombre || "",
    exportado_en: r?.exportado_en || "",
    cuentas: (t.cuentas || []).length,
    partidas: (t.transacciones || []).length,
    ventas: (t.ventas || []).length,
    compras: (t.compras || []).length,
    productos: (t.productos || []).length,
  };
}

const uuid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });

// Función pura (probada aparte): arma lo que se insertará, con identificadores nuevos.
export function prepararRestauracion(respaldo, { userId, email, nombre }) {
  if (!respaldo || respaldo.app !== "contacloud" || !respaldo.empresa || !respaldo.tablas) {
    throw new Error("El archivo no es una copia de seguridad de ContaCloud.");
  }
  if (respaldo.version > VERSION_RESPALDO) throw new Error("La copia fue hecha con una versión más nueva de ContaCloud.");
  const mapa = new Map();
  mapa.set(respaldo.empresa.id, uuid());
  for (const t of TABLAS_RESPALDO) for (const f of respaldo.tablas[t.tabla] || []) mapa.set(f.id, uuid());

  const remapear = (fila) => {
    const nueva = {};
    for (const [k, v] of Object.entries(fila)) {
      if (typeof v === "string") nueva[k] = mapa.has(v) ? mapa.get(v) : v;
      else if (Array.isArray(v)) nueva[k] = v.map((x) => (typeof x === "string" && mapa.has(x) ? mapa.get(x) : x));
      else nueva[k] = v;
    }
    return nueva;
  };

  const empresaRemapeada = remapear(respaldo.empresa);
  // La empresa se crea primero sin las cuentas de configuración (esas cuentas aún no existen) y se completa al final
  const configuracion = {};
  const empresaNueva = { ...empresaRemapeada, user_id: userId, propietario_email: email, nombre: nombre || respaldo.empresa.nombre };
  for (const k of Object.keys(respaldo.empresa)) {
    if (k !== "id" && typeof respaldo.empresa[k] === "string" && mapa.has(respaldo.empresa[k]) && k !== "user_id") {
      configuracion[k] = empresaRemapeada[k];
      empresaNueva[k] = null;
    }
  }
  const lotes = TABLAS_RESPALDO.map((t) => ({ tabla: t.tabla, filas: (respaldo.tablas[t.tabla] || []).map(remapear) }));
  return { empresaNueva, configuracion, lotes };
}

export async function restaurarRespaldo(respaldo, { nombre }, alAvanzar = () => {}) {
  const { data: sesion } = await supabase.auth.getSession();
  const usuario = sesion?.session?.user;
  if (!usuario) throw new Error("Inicia sesión para restaurar.");
  const { empresaNueva, configuracion, lotes } = prepararRestauracion(respaldo, { userId: usuario.id, email: usuario.email, nombre });

  const { error: errEmp } = await supabase.from("empresas").insert(empresaNueva);
  if (errEmp) throw new Error("No se pudo crear la empresa: " + errEmp.message);
  try {
    let n = 0;
    for (const lote of lotes) {
      alAvanzar(n++, lotes.length, lote.tabla);
      for (let i = 0; i < lote.filas.length; i += 500) {
        const { error } = await supabase.from(lote.tabla).insert(lote.filas.slice(i, i + 500));
        if (error) throw new Error(`${lote.tabla}: ${error.message}`);
      }
    }
    if (Object.keys(configuracion).length) {
      const { error } = await supabase.from("empresas").update(configuracion).eq("id", empresaNueva.id);
      if (error) throw new Error("configuración de la empresa: " + error.message);
    }
    alAvanzar(lotes.length, lotes.length, "");
  } catch (e) {
    await supabase.from("empresas").delete().eq("id", empresaNueva.id); // no deja una empresa a medias
    throw e;
  }
  return empresaNueva;
}
