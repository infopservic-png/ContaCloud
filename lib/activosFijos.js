import { supabase } from "@/lib/supabaseClient";
import { siguienteNumeroPartida } from "@/lib/partidas";

export const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
export const nombreMes = (periodo) => {
  const [a, m] = String(periodo).split("-").map(Number);
  return `${MESES[m - 1]} de ${a}`;
};
// "2026-10" → { primero: "2026-10-01", ultimo: "2026-10-31" }
export function limitesMes(ym) {
  const [a, m] = ym.split("-").map(Number);
  const ult = new Date(a, m, 0).getDate();
  const mm = String(m).padStart(2, "0");
  return { primero: `${a}-${mm}-01`, ultimo: `${a}-${mm}-${String(ult).padStart(2, "0")}` };
}

// Línea recta: (costo - valor residual) / vida útil en meses.
export const depreciacionMensual = (a) => r2((Number(a.costo) - Number(a.valor_residual || 0)) / Number(a.vida_util_meses));
export const baseDepreciable = (a) => r2(Number(a.costo) - Number(a.valor_residual || 0));

export async function obtenerActivos(empresaId) {
  const { data, error } = await supabase.from("activos_fijos").select("*").eq("empresa_id", empresaId).order("codigo");
  if (error) throw error;
  return data || [];
}

export async function obtenerDepreciaciones(empresaId) {
  const { data, error } = await supabase
    .from("depreciaciones")
    .select("id, activo_id, periodo, monto, transaccion_id, transacciones ( numero_partida, tipo, fecha )")
    .eq("empresa_id", empresaId)
    .order("periodo");
  if (error) throw error;
  return data || [];
}

// Calcula, sin guardar, lo que se depreciaría en el mes ym ("2026-10").
// Cada renglón: { activo, monto }. Excluye activos dados de baja, sin iniciar, ya depreciados ese mes o totalmente depreciados.
export function planDepreciacion(activos, depreciaciones, ym) {
  const { primero, ultimo } = limitesMes(ym);
  const acum = new Map();
  const yaMes = new Set();
  for (const d of depreciaciones) {
    acum.set(d.activo_id, r2((acum.get(d.activo_id) || 0) + Number(d.monto)));
    if (String(d.periodo).slice(0, 7) === ym) yaMes.add(d.activo_id);
  }
  const lineas = [];
  const omitidos = [];
  for (const a of activos) {
    if (a.estado !== "activo") continue;
    if (yaMes.has(a.id)) { omitidos.push({ activo: a, motivo: "ya depreciado en este mes" }); continue; }
    if (a.fecha_inicio_dep > ultimo) { omitidos.push({ activo: a, motivo: "aún no inicia su depreciación" }); continue; }
    if (!a.cuenta_gasto_id || !a.cuenta_dep_acum_id) { omitidos.push({ activo: a, motivo: "falta asignar cuentas contables" }); continue; }
    const restante = r2(baseDepreciable(a) - (acum.get(a.id) || 0));
    if (restante <= 0.004) { omitidos.push({ activo: a, motivo: "totalmente depreciado" }); continue; }
    const monto = r2(Math.min(depreciacionMensual(a), restante));
    // En el último mes se toma lo que quede para que la suma cierre exacta.
    const ultimoMes = restante - monto < 0.01 ? restante : monto;
    lineas.push({ activo: a, monto: r2(ultimoMes) });
  }
  return { lineas, omitidos, primero, ultimo };
}

// Crea la partida del mes (gasto por depreciación al Debe, depreciación acumulada al Haber) y registra cada depreciación.
export async function depreciarMes({ empresaId, activos, depreciaciones, ym }) {
  const plan = planDepreciacion(activos, depreciaciones, ym);
  if (plan.lineas.length === 0) throw new Error("No hay activos por depreciar en ese mes.");

  const debe = new Map();
  const haber = new Map();
  const det = (mapa, cuenta, texto, monto) => {
    const x = mapa.get(cuenta) || { total: 0, detalle: [] };
    x.total = r2(x.total + monto);
    x.detalle.push({ texto, monto });
    mapa.set(cuenta, x);
  };
  for (const { activo, monto } of plan.lineas) {
    const texto = `${activo.codigo ? activo.codigo + " — " : ""}${activo.nombre}`;
    det(debe, activo.cuenta_gasto_id, texto, monto);
    det(haber, activo.cuenta_dep_acum_id, texto, monto);
  }
  const lineas = [
    ...[...debe].map(([cuenta_id, x]) => ({ cuenta_id, debe: x.total, haber: 0, detalle: x.detalle })),
    ...[...haber].map(([cuenta_id, x]) => ({ cuenta_id, debe: 0, haber: x.total, detalle: x.detalle })),
  ];
  const total = r2(plan.lineas.reduce((a, l) => a + l.monto, 0));

  const numero = await siguienteNumeroPartida(empresaId, "diario");
  const { data: tx, error: errTx } = await supabase
    .from("transacciones")
    .insert({
      empresa_id: empresaId,
      fecha: plan.ultimo,
      descripcion: `Depreciación de propiedad, planta y equipo correspondiente a ${nombreMes(ym)}`,
      numero_partida: numero,
      tipo: "diario",
    })
    .select()
    .single();
  if (errTx) throw errTx;

  const { error: errMov } = await supabase.from("movimientos").insert(lineas.map((l) => ({ ...l, transaccion_id: tx.id })));
  if (errMov) {
    await supabase.from("transacciones").delete().eq("id", tx.id);
    throw errMov;
  }
  const { error: errDep } = await supabase.from("depreciaciones").insert(
    plan.lineas.map((l) => ({ empresa_id: empresaId, activo_id: l.activo.id, periodo: plan.primero, monto: l.monto, transaccion_id: tx.id }))
  );
  if (errDep) {
    await supabase.from("transacciones").delete().eq("id", tx.id);
    throw errDep;
  }
  return { numero, total, activos: plan.lineas.length };
}

// ---------- Baja / venta de un activo ----------

const sumarMes = (ym) => {
  const [a, m] = ym.split("-").map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
};

// Meses de depreciación pendientes desde que inició hasta el mes de la baja (inclusive).
export function depreciacionPendienteHastaBaja(activo, depreciaciones, fechaBaja) {
  const propias = depreciaciones.filter((d) => d.activo_id === activo.id);
  const hechos = new Set(propias.map((d) => String(d.periodo).slice(0, 7)));
  let restante = r2(baseDepreciable(activo) - propias.reduce((a, d) => a + Number(d.monto), 0));
  const meses = [];
  let ym = String(activo.fecha_inicio_dep).slice(0, 7);
  const fin = String(fechaBaja).slice(0, 7);
  while (ym <= fin && restante > 0.004) {
    if (!hechos.has(ym)) {
      const normal = Math.min(depreciacionMensual(activo), restante);
      const monto = r2(restante - normal < 0.01 ? restante : normal);
      meses.push({ ym, monto });
      restante = r2(restante - monto);
    }
    ym = sumarMes(ym);
  }
  return meses;
}

// Resumen sin guardar: depreciación pendiente, valor en libros y ganancia/pérdida.
export function resumenBaja(activo, depreciaciones, { fecha, tipo, precio, conIva }) {
  const propias = depreciaciones.filter((d) => d.activo_id === activo.id);
  const acumPrevia = r2(propias.reduce((a, d) => a + Number(d.monto), 0));
  const pendientes = depreciacionPendienteHastaBaja(activo, depreciaciones, fecha);
  const depPendiente = r2(pendientes.reduce((a, d) => a + d.monto, 0));
  const acumTotal = r2(acumPrevia + depPendiente);
  const valorLibros = r2(Number(activo.costo) - acumTotal);
  const neto = tipo === "venta" ? r2(precio) : 0;
  const iva = tipo === "venta" && conIva ? r2(neto * 0.13) : 0;
  const resultado = r2(neto - valorLibros); // >0 ganancia, <0 pérdida
  return { pendientes, depPendiente, acumTotal, valorLibros, neto, iva, cobro: r2(neto + iva), resultado };
}

// Genera UNA partida: depreciación pendiente, cobro, baja del activo y su depreciación acumulada,
// IVA débito y ganancia o pérdida. Marca el activo como dado de baja.
export async function darDeBajaActivo({ empresaId, activo, depreciaciones, datos }) {
  const { fecha, tipo, precio, conIva, cuentaCobroId, cuentaIvaId, cuentaResultadoId, cuentaActivoId } = datos;
  if (!fecha) throw new Error("Indica la fecha.");
  if (fecha < activo.fecha_adquisicion) throw new Error("La fecha de baja no puede ser anterior a la adquisición.");
  const r = resumenBaja(activo, depreciaciones, { fecha, tipo, precio, conIva });
  if (tipo === "venta") {
    if (!(Number(precio) > 0)) throw new Error("Indica el precio de venta.");
    if (!cuentaCobroId) throw new Error("Elige la cuenta donde se recibe el cobro.");
    if (r.iva > 0 && !cuentaIvaId) throw new Error("Elige la cuenta de IVA débito fiscal.");
  }
  if (!cuentaActivoId) throw new Error("Elige la cuenta del activo (la que se acredita).");
  if (Math.abs(r.resultado) > 0.004 && !cuentaResultadoId) throw new Error("Elige la cuenta de ganancia/pérdida.");
  if (r.pendientes.length && (!activo.cuenta_gasto_id || !activo.cuenta_dep_acum_id)) throw new Error("Al activo le faltan las cuentas de depreciación.");

  const debe = new Map();
  const haber = new Map();
  const sumar = (m, cuenta, monto) => { if (cuenta && Math.abs(monto) > 0.004) m.set(cuenta, r2((m.get(cuenta) || 0) + monto)); };
  const texto = `${activo.codigo ? activo.codigo + " — " : ""}${activo.nombre}`;

  sumar(debe, activo.cuenta_gasto_id, r.depPendiente);
  sumar(haber, activo.cuenta_dep_acum_id, r.depPendiente);
  if (tipo === "venta") sumar(debe, cuentaCobroId, r.cobro);
  sumar(debe, activo.cuenta_dep_acum_id, r.acumTotal);
  sumar(haber, cuentaActivoId, Number(activo.costo));
  if (r.iva > 0) sumar(haber, cuentaIvaId, r.iva);
  if (r.resultado > 0.004) sumar(haber, cuentaResultadoId, r.resultado);
  else if (r.resultado < -0.004) sumar(debe, cuentaResultadoId, -r.resultado);

  const lineas = [
    ...[...debe].map(([cuenta_id, monto]) => ({ cuenta_id, debe: monto, haber: 0 })),
    ...[...haber].map(([cuenta_id, monto]) => ({ cuenta_id, debe: 0, haber: monto })),
  ];
  // La depreciación acumulada aparece en ambos lados (pendiente al Haber, total al Debe): se compensa por cuenta.
  const neta = new Map();
  for (const l of lineas) neta.set(l.cuenta_id, r2((neta.get(l.cuenta_id) || 0) + l.debe - l.haber));
  const finales = [...neta].filter(([, v]) => Math.abs(v) > 0.004).map(([cuenta_id, v]) => ({ cuenta_id, debe: v > 0 ? v : 0, haber: v < 0 ? -v : 0 }));
  const totalDebe = r2(finales.reduce((a, l) => a + l.debe, 0));
  const totalHaber = r2(finales.reduce((a, l) => a + l.haber, 0));
  if (Math.abs(totalDebe - totalHaber) > 0.005) throw new Error("La partida no cuadra (Debe ≠ Haber). Revisa las cuentas elegidas.");

  const numero = await siguienteNumeroPartida(empresaId, "diario");
  const descripcion = tipo === "venta" ? `Venta de activo fijo ${texto}` : `Baja de activo fijo ${texto}`;
  const { data: tx, error: errTx } = await supabase
    .from("transacciones")
    .insert({ empresa_id: empresaId, fecha, descripcion, numero_partida: numero, tipo: "diario" })
    .select()
    .single();
  if (errTx) throw errTx;

  const deshacer = async () => { await supabase.from("transacciones").delete().eq("id", tx.id); };
  const { error: errMov } = await supabase.from("movimientos").insert(finales.map((l) => ({ ...l, transaccion_id: tx.id })));
  if (errMov) { await deshacer(); throw errMov; }

  if (r.pendientes.length) {
    const { error: errDep } = await supabase.from("depreciaciones").insert(
      r.pendientes.map((d) => ({ empresa_id: empresaId, activo_id: activo.id, periodo: `${d.ym}-01`, monto: d.monto, transaccion_id: tx.id }))
    );
    if (errDep) { await deshacer(); throw errDep; }
  }
  const { error: errAct } = await supabase
    .from("activos_fijos")
    .update({ estado: "baja", fecha_baja: fecha, tipo_baja: tipo, precio_venta: tipo === "venta" ? r2(precio) : null, baja_transaccion_id: tx.id, cuenta_activo_id: cuentaActivoId })
    .eq("id", activo.id);
  if (errAct) { await deshacer(); throw errAct; }
  return { numero, resultado: r.resultado, depPendiente: r.depPendiente };
}
