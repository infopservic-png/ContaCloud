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
