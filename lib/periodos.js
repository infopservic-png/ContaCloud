// Períodos contables: selección, cierre (con partidas de cierre y apertura) y reapertura.
import { supabase } from "@/lib/supabaseClient";
import { siguienteNumeroPartida } from "@/lib/partidas";
import { obtenerCuentasConMovimientos, sumaDebeHaber } from "@/lib/contabilidad";

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const CLASES_RESULTADO = ["Ingreso", "Costo", "Gasto"];

export async function obtenerPeriodos(empresaId) {
  const { data, error } = await supabase.from("periodos_contables").select("*").eq("empresa_id", empresaId).order("fecha_inicio");
  if (error) throw error;
  return data || [];
}

// Período con el que se trabaja al entrar: el abierto que contiene la fecha de hoy; si no, el último abierto; si no, el último.
export function periodoPorDefecto(periodos, hoy = new Date().toISOString().slice(0, 10)) {
  if (!periodos?.length) return null;
  return (
    periodos.find((p) => p.estado === "abierto" && hoy >= p.fecha_inicio && hoy <= p.fecha_fin) ||
    [...periodos].reverse().find((p) => p.estado === "abierto") ||
    periodos[periodos.length - 1]
  );
}

export async function crearPeriodo(empresaId, { nombre, inicio, fin }) {
  const { data, error } = await supabase
    .from("periodos_contables")
    .insert({ empresa_id: empresaId, nombre, fecha_inicio: inicio, fecha_fin: fin })
    .select()
    .single();
  if (error) return { error: /duplicate|unique/i.test(error.message) ? "Ya existe un período que empieza en esa fecha." : error.message };
  return { periodo: data };
}

// Sugerencia de cuentas según el nombre (el usuario las confirma al cerrar)
export function sugerirCuentas(cuentas) {
  const buscar = (...patrones) => {
    for (const re of patrones) {
      const c = cuentas.find((x) => re.test(x.nombre));
      if (c) return c.id;
    }
    return "";
  };
  return {
    pyg: buscar(/p[eé]rdidas y ganancias/i, /utilidades? del presente ejercicio/i, /resultado del ejercicio/i),
    acumuladas: buscar(/utilidades? acumuladas?/i, /resultados? acumulados?/i, /utilidades? retenidas?/i),
    perdidas: buscar(/p[eé]rdidas? de ejercicios anteriores/i, /p[eé]rdidas? acumuladas?/i),
  };
}

// Cálculo puro del cierre. cuentas: [{ id, codigo, nombre, clase, movimientos:[{debe,haber}] }] ya limitadas al período.
// Devuelve el resultado y las líneas de cada partida (Debe/Haber por cuenta).
export function calcularCierre(cuentas, { pygId, acumId, perdidasId }) {
  const error = !pygId ? "Elige la cuenta de resultado del ejercicio (Pérdidas y ganancias)." : !acumId ? "Elige la cuenta de Utilidades acumuladas." : null;
  if (error) return { error };

  // 1) Cancelar ingresos, costos y gastos contra la cuenta de resultado
  const cierre1 = [];
  for (const c of cuentas) {
    if (!CLASES_RESULTADO.includes(c.clase) || c.id === pygId) continue;
    const { sumaDebe, sumaHaber } = sumaDebeHaber(c);
    const neto = r2(sumaDebe - sumaHaber);
    if (neto > 0) cierre1.push({ cuenta_id: c.id, debe: 0, haber: neto });
    else if (neto < 0) cierre1.push({ cuenta_id: c.id, debe: -neto, haber: 0 });
  }
  const totDebe = r2(cierre1.reduce((s, l) => s + l.debe, 0));
  const totHaber = r2(cierre1.reduce((s, l) => s + l.haber, 0));
  const resultado = r2(totDebe - totHaber); // > 0 utilidad, < 0 pérdida
  if (resultado > 0) cierre1.push({ cuenta_id: pygId, debe: 0, haber: resultado });
  else if (resultado < 0) cierre1.push({ cuenta_id: pygId, debe: -resultado, haber: 0 });

  // 2) Trasladar el resultado a utilidades (o pérdidas) acumuladas
  const destino = resultado < 0 && perdidasId ? perdidasId : acumId;
  const cierre2 = [];
  if (resultado > 0) cierre2.push({ cuenta_id: pygId, debe: resultado, haber: 0 }, { cuenta_id: destino, debe: 0, haber: resultado });
  else if (resultado < 0) cierre2.push({ cuenta_id: destino, debe: -resultado, haber: 0 }, { cuenta_id: pygId, debe: 0, haber: -resultado });

  // 3) Apertura del período siguiente: saldos de las cuentas de balance tras el cierre
  const ajuste = new Map();
  const sumar = (id, n) => ajuste.set(id, r2((ajuste.get(id) || 0) + n));
  for (const l of [...cierre1, ...cierre2]) sumar(l.cuenta_id, l.debe - l.haber);
  const apertura = [];
  for (const c of cuentas) {
    if (CLASES_RESULTADO.includes(c.clase) && c.id !== pygId && c.id !== acumId && c.id !== destino) continue;
    const { sumaDebe, sumaHaber } = sumaDebeHaber(c);
    const neto = r2(sumaDebe - sumaHaber + (ajuste.get(c.id) || 0));
    if (neto > 0) apertura.push({ cuenta_id: c.id, debe: neto, haber: 0 });
    else if (neto < 0) apertura.push({ cuenta_id: c.id, debe: 0, haber: -neto });
  }
  const cuadra = (ls) => Math.abs(ls.reduce((s, l) => s + l.debe - l.haber, 0)) < 0.005;
  if (!cuadra(cierre1) || !cuadra(cierre2) || !cuadra(apertura)) return { error: "Las partidas de cierre no cuadran; revisa el catálogo de cuentas." };
  return { resultado, cierre1, cierre2, apertura };
}

async function insertarPartida({ empresaId, fecha, tipo, descripcion, lineas, usuario }) {
  const numero = await siguienteNumeroPartida(empresaId, tipo);
  const { data: tx, error } = await supabase
    .from("transacciones")
    .insert({ empresa_id: empresaId, fecha, descripcion, numero_partida: numero, tipo, elaborado_por: usuario || null })
    .select()
    .single();
  if (error) throw new Error(error.message);
  const { error: errMov } = await supabase.from("movimientos").insert(lineas.map((l) => ({ ...l, transaccion_id: tx.id })));
  if (errMov) {
    await supabase.from("transacciones").delete().eq("id", tx.id);
    throw new Error(errMov.message);
  }
  return tx;
}

const sumarDia = (f, n) => {
  const d = new Date(f + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const fechaDMA = (f) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : "");

// Siguiente período natural: empieza el día después del fin y dura lo mismo (normalmente un año)
export function datosPeriodoSiguiente(periodo) {
  const inicio = sumarDia(periodo.fecha_fin, 1);
  const anioDestino = Number(inicio.slice(0, 4));
  const esAnioCompleto = periodo.fecha_inicio.slice(5) === "01-01" && periodo.fecha_fin.slice(5) === "12-31";
  const fin = esAnioCompleto ? `${anioDestino}-12-31` : sumarDia(`${anioDestino + 1}${inicio.slice(4)}`, -1);
  return { nombre: esAnioCompleto ? String(anioDestino) : `${fechaDMA(inicio)} al ${fechaDMA(fin)}`, inicio, fin };
}

export async function vistaPreviaCierre(empresaId, periodo, cuentasSel) {
  const cuentas = await obtenerCuentasConMovimientos(empresaId, { periodo });
  return calcularCierre(cuentas, cuentasSel);
}

export async function cerrarPeriodo({ empresaId, periodo, periodos, cuentasSel, usuario }) {
  if (periodo.estado === "cerrado") return { error: "El período ya está cerrado." };
  const cuentas = await obtenerCuentasConMovimientos(empresaId, { periodo });
  const calculo = calcularCierre(cuentas, cuentasSel);
  if (calculo.error) return calculo;

  // Período siguiente (se crea si no existe)
  const sig = datosPeriodoSiguiente(periodo);
  let siguiente = periodos.find((p) => p.fecha_inicio === sig.inicio);
  if (siguiente?.estado === "cerrado") return { error: `El período siguiente (${siguiente.nombre}) ya está cerrado: reábrelo antes de cerrar este.` };
  let creado = null;
  if (!siguiente) {
    const r = await crearPeriodo(empresaId, sig);
    if (r.error) return r;
    siguiente = creado = r.periodo;
  }

  const hechas = [];
  try {
    const fin = periodo.fecha_fin;
    if (calculo.cierre1.length) {
      hechas.push(await insertarPartida({ empresaId, fecha: fin, tipo: "cierre", usuario, lineas: calculo.cierre1,
        descripcion: `Cierre de las cuentas de resultado del período ${periodo.nombre}` }));
    }
    if (calculo.cierre2.length) {
      hechas.push(await insertarPartida({ empresaId, fecha: fin, tipo: "cierre", usuario, lineas: calculo.cierre2,
        descripcion: `Traslado del resultado del período ${periodo.nombre} a ${calculo.resultado >= 0 ? "utilidades" : "pérdidas"} acumuladas` }));
    }
    let apertura = null;
    if (calculo.apertura.length) {
      apertura = await insertarPartida({ empresaId, fecha: siguiente.fecha_inicio, tipo: "apertura", usuario, lineas: calculo.apertura,
        descripcion: `Apertura del período ${siguiente.nombre}: saldos al ${fechaDMA(fin)}` });
    }
    const cierreIds = hechas.map((t) => t.id);
    if (apertura) hechas.push(apertura);
    const { error } = await supabase.from("periodos_contables").update({
      estado: "cerrado",
      cuenta_pyg_id: cuentasSel.pygId,
      cuenta_acumuladas_id: cuentasSel.acumId,
      cuenta_perdidas_id: cuentasSel.perdidasId || null,
      cierre_transaccion_ids: cierreIds,
      apertura_transaccion_id: apertura?.id || null,
      resultado: calculo.resultado,
      cerrado_el: new Date().toISOString(),
      cerrado_por: usuario || null,
    }).eq("id", periodo.id);
    if (error) throw new Error(error.message);
  } catch (e) {
    for (const t of hechas) await supabase.from("transacciones").delete().eq("id", t.id);
    if (creado) await supabase.from("periodos_contables").delete().eq("id", creado.id);
    return { error: "No se pudo cerrar el período (no quedó nada a medias): " + e.message };
  }
  return { ok: true, resultado: calculo.resultado, siguiente };
}

export async function reabrirPeriodo({ periodo, periodos }) {
  if (periodo.estado !== "cerrado") return { error: "El período no está cerrado." };
  const sig = periodos.find((p) => p.fecha_inicio === sumarDia(periodo.fecha_fin, 1));
  if (sig?.estado === "cerrado") return { error: `Primero reabre el período ${sig.nombre}.` };
  // Se abre primero para poder eliminar las partidas de cierre y apertura
  const { error } = await supabase.from("periodos_contables").update({ estado: "abierto" }).eq("id", periodo.id);
  if (error) return { error: error.message };
  const ids = [...(periodo.cierre_transaccion_ids || []), ...(periodo.apertura_transaccion_id ? [periodo.apertura_transaccion_id] : [])];
  if (ids.length) {
    const { error: errDel } = await supabase.from("transacciones").delete().in("id", ids);
    if (errDel) return { error: "Se reabrió el período pero no se pudieron eliminar sus partidas de cierre: " + errDel.message };
  }
  await supabase.from("periodos_contables").update({
    cierre_transaccion_ids: [], apertura_transaccion_id: null, resultado: null, cerrado_el: null, cerrado_por: null,
  }).eq("id", periodo.id);
  return { ok: true };
}

// Fecha de corte por defecto de un reporte: hoy, sin pasarse del fin del período elegido (ni antes de su inicio)
export function corteDefecto(periodo, hoy = new Date().toISOString().slice(0, 10)) {
  if (!periodo) return hoy;
  if (hoy > periodo.fecha_fin) return periodo.fecha_fin;
  if (hoy < periodo.fecha_inicio) return periodo.fecha_inicio;
  return hoy;
}
