import { supabase } from "@/lib/supabaseClient";
import { siguienteNumeroPartida } from "@/lib/partidas";

export const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// ---------- Configuración por defecto (editable en la pantalla de configuración) ----------

// Tabla de retención de renta (sueldos). «exceso» = valor sobre el que se aplica el porcentaje.
export const TABLA_RENTA_MENSUAL = [
  { desde: 0, hasta: 550, pct: 0, cuota: 0, exceso: 0 },
  { desde: 550.01, hasta: 895.24, pct: 10, cuota: 17.67, exceso: 550 },
  { desde: 895.25, hasta: 2038.1, pct: 20, cuota: 60, exceso: 895.24 },
  { desde: 2038.11, hasta: null, pct: 30, cuota: 288.57, exceso: 2038.1 },
];
export const TABLA_RENTA_QUINCENAL = [
  { desde: 0, hasta: 275, pct: 0, cuota: 0, exceso: 0 },
  { desde: 275.01, hasta: 447.62, pct: 10, cuota: 8.83, exceso: 275 },
  { desde: 447.63, hasta: 1019.05, pct: 20, cuota: 30, exceso: 447.62 },
  { desde: 1019.06, hasta: null, pct: 30, cuota: 144.28, exceso: 1019.05 },
];

// Recálculo de junio (acumulado enero-junio) y de diciembre (acumulado del año): Decreto Ejecutivo N.° 10 de 2025, art. 1 literal f).
export const TABLA_RENTA_JUNIO = [
  { desde: 0, hasta: 3300, pct: 0, cuota: 0, exceso: 0 },
  { desde: 3300.01, hasta: 5371.44, pct: 10, cuota: 106.2, exceso: 3300 },
  { desde: 5371.45, hasta: 12228.6, pct: 20, cuota: 360, exceso: 5371.44 },
  { desde: 12228.61, hasta: null, pct: 30, cuota: 1731.42, exceso: 12228.6 },
];
export const TABLA_RENTA_DICIEMBRE = [
  { desde: 0, hasta: 6600, pct: 0, cuota: 0, exceso: 0 },
  { desde: 6600.01, hasta: 10742.86, pct: 10, cuota: 212.12, exceso: 6600 },
  { desde: 10742.87, hasta: 24457.14, pct: 20, cuota: 720, exceso: 10742.86 },
  { desde: 24457.15, hasta: null, pct: 30, cuota: 3462.86, exceso: 24457.14 },
];

export const CONFIG_DEFECTO = {
  isss_emp_pct: 3,
  isss_pat_pct: 7.5,
  isss_tope_base: 1000,
  afp_emp_pct: 7.25,
  afp_pat_pct: 8.75,
  insaforp_pct: 1,
  aplica_insaforp: true,
  salario_minimo: 408.8,
  vacaciones_dias: 15,
  vacaciones_recargo_pct: 30,
  provisiona_vacaciones: true,
  provisiona_aguinaldo: true,
  provisiona_indemnizacion: true,
  tabla_renta_mensual: TABLA_RENTA_MENSUAL,
  tabla_renta_quincenal: TABLA_RENTA_QUINCENAL,
  tabla_renta_junio: TABLA_RENTA_JUNIO,
  tabla_renta_diciembre: TABLA_RENTA_DICIEMBRE,
};

// Cuentas que usa la partida de la planilla: [campo, etiqueta, obligatoria]
export const CUENTAS_CONFIG = [
  ["cuenta_sueldos_id", "Sueldos y salarios (gasto)", true],
  ["cuenta_comisiones_id", "Comisiones (gasto; si se deja vacía usa Sueldos)", false],
  ["cuenta_otros_ingresos_id", "Otros ingresos (gasto; si se deja vacía usa Sueldos)", false],
  ["cuenta_cuotas_patronales_id", "Cuotas patronales ISSS / AFP / INSAFORP (gasto)", true],
  ["cuenta_sueldos_pagar_id", "Sueldos por pagar (líquido a pagar)", true],
  ["cuenta_isss_pagar_id", "ISSS por pagar (empleado + patrono)", true],
  ["cuenta_afp_pagar_id", "AFP por pagar (empleado + patrono)", true],
  ["cuenta_insaforp_pagar_id", "INSAFORP por pagar", false],
  ["cuenta_renta_pagar_id", "Retención de renta por pagar", true],
  ["cuenta_otros_desc_pagar_id", "Otros descuentos por pagar", false],
  ["cuenta_gasto_vacaciones_id", "Gasto por vacaciones", false],
  ["cuenta_prov_vacaciones_id", "Provisión de vacaciones", false],
  ["cuenta_gasto_aguinaldo_id", "Gasto por aguinaldo", false],
  ["cuenta_prov_aguinaldo_id", "Provisión de aguinaldo", false],
  ["cuenta_gasto_indem_id", "Gasto por indemnización", false],
  ["cuenta_prov_indem_id", "Provisión de indemnización", false],
];

export async function obtenerConfig(empresaId) {
  const { data, error } = await supabase.from("rrhh_config").select("*").eq("empresa_id", empresaId).maybeSingle();
  if (error) throw error;
  return {
    ...CONFIG_DEFECTO,
    ...(data || {}),
    tabla_renta_mensual: data?.tabla_renta_mensual || TABLA_RENTA_MENSUAL,
    tabla_renta_quincenal: data?.tabla_renta_quincenal || TABLA_RENTA_QUINCENAL,
    tabla_renta_junio: data?.tabla_renta_junio || TABLA_RENTA_JUNIO,
    tabla_renta_diciembre: data?.tabla_renta_diciembre || TABLA_RENTA_DICIEMBRE,
    existe: !!data,
  };
}

export async function guardarConfig(empresaId, cfg) {
  const { existe, id, created_at, ...campos } = cfg; // eslint-disable-line no-unused-vars
  const { error } = await supabase.from("rrhh_config").upsert({ ...campos, empresa_id: empresaId }, { onConflict: "empresa_id" });
  if (error) throw error;
}

// ---------- Cálculos ----------

export function calcularRenta(base, tabla) {
  const b = Number(base) || 0;
  const filas = [...(tabla || [])].sort((a, c) => a.desde - c.desde);
  let tramo = null;
  for (const f of filas) if (b >= Number(f.desde)) tramo = f;
  if (!tramo || !Number(tramo.pct)) return 0;
  return r2(Number(tramo.cuota) + (b - Number(tramo.exceso)) * (Number(tramo.pct) / 100));
}

const MS_DIA = 86400000;
const aFecha = (s) => {
  const [a, m, d] = String(s).slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
};
export const diasEntre = (desde, hasta) => Math.round((aFecha(hasta) - aFecha(desde)) / MS_DIA);
export const antiguedadAnios = (ingreso, fecha) => Math.max(0, diasEntre(ingreso, fecha) / 365.25);

// Días de aguinaldo según antigüedad (Código de Trabajo): <3 años 10, 3 a <10 años 15, 10+ años 18.
export function diasAguinaldo(anios) {
  if (anios >= 10) return 18;
  if (anios >= 3) return 15;
  return 10;
}

// ¿Esta planilla es la que hace el recálculo de renta? Junio y diciembre, en la última planilla del mes
// (la mensual, o la 2.ª quincena). Devuelve "junio" | "diciembre" | null.
export function tipoRecalculo(planilla) {
  if (!planilla) return null;
  const mes = Number(String(planilla.periodo_fin).slice(5, 7));
  const ultima = planilla.periodicidad === "mensual" || Number(String(planilla.periodo_ini).slice(8, 10)) === 16;
  if (!ultima) return null;
  return mes === 6 ? "junio" : mes === 12 ? "diciembre" : null;
}

// Calcula una línea de planilla. entrada: { sueldo, comisiones, otros_ingresos, otros_descuentos }
// recalculo: "junio" | "diciembre" | null; acum: { baseAnterior, retenidoAnterior } del empleado en el año.
export function calcularLinea({ empleado, cfg, periodicidad, fechaFin, sueldo, comisiones = 0, otros_ingresos = 0, otros_descuentos = 0, recalculo = null, acum = null }) {
  const factor = periodicidad === "quincenal" ? 0.5 : 1;
  const s = r2(sueldo);
  const com = r2(comisiones);
  const otros = r2(otros_ingresos);
  const desc = r2(otros_descuentos);
  const devengado = r2(s + com + otros);

  const baseIsss = Math.min(devengado, Number(cfg.isss_tope_base) * factor);
  const isss_emp = empleado.aplica_isss ? r2((baseIsss * Number(cfg.isss_emp_pct)) / 100) : 0;
  const isss_pat = empleado.aplica_isss ? r2((baseIsss * Number(cfg.isss_pat_pct)) / 100) : 0;
  const afp_emp = empleado.aplica_afp ? r2((devengado * Number(cfg.afp_emp_pct)) / 100) : 0;
  const afp_pat = empleado.aplica_afp ? r2((devengado * Number(cfg.afp_pat_pct)) / 100) : 0;
  const insaforp = cfg.aplica_insaforp ? r2((devengado * Number(cfg.insaforp_pct)) / 100) : 0;

  const baseRenta = devengado - isss_emp - afp_emp; // remuneración gravada del período
  let renta;
  if (recalculo) {
    // Retención acumulada según la tabla de junio/diciembre, menos lo ya retenido en el año; si resulta negativa, no se retiene.
    const tablaR = recalculo === "junio" ? cfg.tabla_renta_junio : cfg.tabla_renta_diciembre;
    const totalAcum = calcularRenta((acum?.baseAnterior || 0) + baseRenta, tablaR);
    renta = Math.max(0, r2(totalAcum - (acum?.retenidoAnterior || 0)));
  } else {
    const tabla = periodicidad === "quincenal" ? cfg.tabla_renta_quincenal : cfg.tabla_renta_mensual;
    renta = calcularRenta(baseRenta, tabla);
  }
  const liquido = r2(devengado - isss_emp - afp_emp - renta - desc);

  // Provisiones sobre sueldo + comisiones del período
  const base = s + com;
  const anios = antiguedadAnios(empleado.fecha_ingreso, fechaFin);
  const prov_vacaciones = cfg.provisiona_vacaciones
    ? r2((base * (Number(cfg.vacaciones_dias) * (1 + Number(cfg.vacaciones_recargo_pct) / 100))) / 360)
    : 0;
  const prov_aguinaldo = cfg.provisiona_aguinaldo ? r2((base * diasAguinaldo(anios)) / 360) : 0;
  const tope = 4 * Number(cfg.salario_minimo) * factor; // base máxima de indemnización
  const prov_indemnizacion = cfg.provisiona_indemnizacion ? r2(Math.min(base, tope) / 12) : 0;

  return {
    sueldo: s, comisiones: com, otros_ingresos: otros, otros_descuentos: desc,
    devengado, isss_emp, afp_emp, renta, liquido, isss_pat, afp_pat, insaforp,
    prov_vacaciones, prov_aguinaldo, prov_indemnizacion,
  };
}

// Cálculo estimado de prestaciones de un empleado a una fecha (para el expediente).
export function calcularPrestaciones(emp, cfg, fecha) {
  const sueldo = Number(emp.sueldo) || 0;
  const diario = sueldo / 30;
  const anios = antiguedadAnios(emp.fecha_ingreso, fecha);

  // Aguinaldo proporcional del año en curso (al 12 de diciembre rige la antigüedad)
  const anio = Number(String(fecha).slice(0, 4));
  const ingreso = aFecha(emp.fecha_ingreso);
  const inicioAnio = aFecha(`${anio}-01-01`);
  const desdeAgui = ingreso > inicioAnio ? emp.fecha_ingreso : `${anio}-01-01`;
  const diasTrab = Math.min(365, Math.max(0, diasEntre(desdeAgui, fecha) + 1));
  const aniosDic = antiguedadAnios(emp.fecha_ingreso, `${anio}-12-12`);
  const diasAgui = diasAguinaldo(aniosDic);
  const aguinaldo = r2(diario * diasAgui * (diasTrab / 365));

  // Vacaciones proporcionales desde el último aniversario
  const enteros = Math.floor(anios);
  const ult = aFecha(emp.fecha_ingreso);
  ult.setUTCFullYear(ult.getUTCFullYear() + enteros);
  const diasDesdeAniv = Math.max(0, Math.round((aFecha(fecha) - ult) / MS_DIA));
  const vacAnual = diario * Number(cfg.vacaciones_dias) * (1 + Number(cfg.vacaciones_recargo_pct) / 100);
  const vacaciones = r2(vacAnual * (Math.min(365, diasDesdeAniv) / 365));

  // Indemnización: un mes de salario por año, con base máxima de 4 salarios mínimos
  const topeMensual = 4 * Number(cfg.salario_minimo);
  const indemnizacion = r2(Math.min(sueldo, topeMensual) * anios);

  return { anios, diasAgui, diasTrab, aguinaldo, vacaciones, indemnizacion, topeMensual };
}

// ---------- Datos ----------

export async function obtenerEmpleados(empresaId) {
  const { data, error } = await supabase.from("empleados").select("*").eq("empresa_id", empresaId).order("nombre");
  if (error) throw error;
  return data || [];
}

export async function obtenerPlanillas(empresaId) {
  const { data, error } = await supabase
    .from("planillas")
    .select("*, transacciones ( numero_partida, tipo ), planilla_lineas ( devengado, liquido )")
    .eq("empresa_id", empresaId)
    .order("periodo_ini", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function obtenerLineas(planillaId) {
  const { data, error } = await supabase.from("planilla_lineas").select("*").eq("planilla_id", planillaId);
  if (error) throw error;
  return data || [];
}

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
export const fechaLarga = (f) => {
  const [a, m, d] = String(f || "").split("-").map(Number);
  return a ? `${d} de ${MESES[m - 1]} de ${a}` : "";
};
export function textoPeriodo(p) {
  const [a, m] = String(p.periodo_ini).split("-").map(Number);
  if (p.periodicidad === "mensual") return `${MESES[m - 1]} de ${a}`;
  const q = Number(String(p.periodo_ini).slice(8, 10)) === 1 ? "1.ª quincena" : "2.ª quincena";
  return `${q} de ${MESES[m - 1]} de ${a}`;
}
// "2026-10" + (mensual | 1 | 2) → { ini, fin }
export function rangoPeriodo(ym, periodicidad, quincena = 1) {
  const [a, m] = ym.split("-").map(Number);
  const ult = new Date(a, m, 0).getDate();
  const mm = String(m).padStart(2, "0");
  if (periodicidad === "mensual") return { ini: `${a}-${mm}-01`, fin: `${a}-${mm}-${String(ult).padStart(2, "0")}` };
  return Number(quincena) === 1
    ? { ini: `${a}-${mm}-01`, fin: `${a}-${mm}-15` }
    : { ini: `${a}-${mm}-16`, fin: `${a}-${mm}-${String(ult).padStart(2, "0")}` };
}

// Remuneración gravada y renta retenida de cada empleado en las planillas anteriores del mismo año.
// Devuelve Map(empleado_id → { baseAnterior, retenidoAnterior }).
export async function obtenerAcumulados(empresaId, planilla) {
  const anio = String(planilla.periodo_ini).slice(0, 4);
  const { data, error } = await supabase
    .from("planilla_lineas")
    .select("empleado_id, devengado, isss_emp, afp_emp, renta, planillas!inner ( periodo_ini, empresa_id )")
    .eq("planillas.empresa_id", empresaId)
    .gte("planillas.periodo_ini", `${anio}-01-01`)
    .lt("planillas.periodo_ini", planilla.periodo_ini);
  if (error) throw error;
  const mapa = new Map();
  for (const l of data || []) {
    const x = mapa.get(l.empleado_id) || { baseAnterior: 0, retenidoAnterior: 0 };
    x.baseAnterior = r2(x.baseAnterior + Number(l.devengado) - Number(l.isss_emp) - Number(l.afp_emp));
    x.retenidoAnterior = r2(x.retenidoAnterior + Number(l.renta));
    mapa.set(l.empleado_id, x);
  }
  return mapa;
}

// Crea una planilla en borrador con las líneas de los empleados activos de esa periodicidad.
export async function crearPlanilla({ empresaId, periodicidad, ini, fin, fechaPago, empleados, cfg }) {
  const elegibles = empleados.filter(
    (e) => e.estado === "activo" && e.periodicidad === periodicidad && e.fecha_ingreso <= fin && (!e.fecha_retiro || e.fecha_retiro >= ini)
  );
  if (elegibles.length === 0) throw new Error(`No hay empleados activos con periodicidad ${periodicidad} para ese período.`);

  const { data: dup } = await supabase.from("planillas").select("id").eq("empresa_id", empresaId).eq("periodicidad", periodicidad).eq("periodo_ini", ini).maybeSingle();
  if (dup) throw new Error("Ya existe una planilla para ese período.");

  const { data: pl, error } = await supabase
    .from("planillas")
    .insert({ empresa_id: empresaId, periodicidad, periodo_ini: ini, periodo_fin: fin, fecha_pago: fechaPago || fin })
    .select()
    .single();
  if (error) throw error;

  const factor = periodicidad === "quincenal" ? 0.5 : 1;
  const recalculo = tipoRecalculo(pl);
  let acumulados = new Map();
  if (recalculo) {
    try {
      acumulados = await obtenerAcumulados(empresaId, pl);
    } catch (e) {
      await supabase.from("planillas").delete().eq("id", pl.id);
      throw e;
    }
  }
  const filas = elegibles.map((e) => ({
    empresa_id: empresaId,
    planilla_id: pl.id,
    empleado_id: e.id,
    ...calcularLinea({ empleado: e, cfg, periodicidad, fechaFin: fin, sueldo: r2(Number(e.sueldo) * factor), recalculo, acum: acumulados.get(e.id) }),
  }));
  const { error: errL } = await supabase.from("planilla_lineas").insert(filas);
  if (errL) {
    await supabase.from("planillas").delete().eq("id", pl.id);
    throw errL;
  }
  return pl;
}

export async function guardarLineas(lineas) {
  for (const l of lineas) {
    const { id, empresa_id, planilla_id, empleado_id, ...campos } = l; // eslint-disable-line no-unused-vars
    const { error } = await supabase.from("planilla_lineas").update(campos).eq("id", id);
    if (error) throw error;
  }
}

// ---------- Partida contable de la planilla ----------

// Devuelve { lineas, faltantes } sin guardar; lineas con { cuenta_id, debe, haber, detalle }.
export function armarPartidaPlanilla({ lineas, empleados, cfg }) {
  const nombre = (id) => empleados.find((e) => e.id === id)?.nombre || "Empleado";
  const suma = (campo) => r2(lineas.reduce((a, l) => a + Number(l[campo] || 0), 0));
  const porEmp = (campo) => lineas.filter((l) => Number(l[campo]) > 0).map((l) => ({ texto: nombre(l.empleado_id), monto: r2(l[campo]) }));

  const debe = new Map();
  const haber = new Map();
  const faltantes = [];
  const agregar = (mapa, campoCuenta, etiqueta, monto, detalle = [], respaldo = null) => {
    if (!(monto > 0)) return;
    let cuenta = cfg[campoCuenta] || (respaldo ? cfg[respaldo] : null);
    if (!cuenta) {
      faltantes.push(etiqueta);
      return;
    }
    const x = mapa.get(cuenta) || { total: 0, detalle: [] };
    x.total = r2(x.total + monto);
    x.detalle.push(...detalle);
    mapa.set(cuenta, x);
  };

  // Debe: gastos
  agregar(debe, "cuenta_sueldos_id", "Sueldos y salarios", suma("sueldo"), porEmp("sueldo"));
  agregar(debe, "cuenta_comisiones_id", "Comisiones", suma("comisiones"), porEmp("comisiones"), "cuenta_sueldos_id");
  agregar(debe, "cuenta_otros_ingresos_id", "Otros ingresos", suma("otros_ingresos"), porEmp("otros_ingresos"), "cuenta_sueldos_id");
  agregar(debe, "cuenta_cuotas_patronales_id", "Cuotas patronales", r2(suma("isss_pat") + suma("afp_pat") + suma("insaforp")));
  agregar(debe, "cuenta_gasto_vacaciones_id", "Gasto por vacaciones", suma("prov_vacaciones"));
  agregar(debe, "cuenta_gasto_aguinaldo_id", "Gasto por aguinaldo", suma("prov_aguinaldo"));
  agregar(debe, "cuenta_gasto_indem_id", "Gasto por indemnización", suma("prov_indemnizacion"));

  // Haber: obligaciones y provisiones
  agregar(haber, "cuenta_isss_pagar_id", "ISSS por pagar", r2(suma("isss_emp") + suma("isss_pat")));
  agregar(haber, "cuenta_afp_pagar_id", "AFP por pagar", r2(suma("afp_emp") + suma("afp_pat")));
  agregar(haber, "cuenta_insaforp_pagar_id", "INSAFORP por pagar", suma("insaforp"), [], "cuenta_cuotas_patronales_id");
  agregar(haber, "cuenta_renta_pagar_id", "Retención de renta por pagar", suma("renta"), porEmp("renta"));
  agregar(haber, "cuenta_otros_desc_pagar_id", "Otros descuentos por pagar", suma("otros_descuentos"), porEmp("otros_descuentos"));
  agregar(haber, "cuenta_prov_vacaciones_id", "Provisión de vacaciones", suma("prov_vacaciones"));
  agregar(haber, "cuenta_prov_aguinaldo_id", "Provisión de aguinaldo", suma("prov_aguinaldo"));
  agregar(haber, "cuenta_prov_indem_id", "Provisión de indemnización", suma("prov_indemnizacion"));
  agregar(haber, "cuenta_sueldos_pagar_id", "Sueldos por pagar", suma("liquido"), porEmp("liquido"));

  const mover = (mapa, lado) => [...mapa].map(([cuenta_id, x]) => ({ cuenta_id, debe: lado === "d" ? x.total : 0, haber: lado === "h" ? x.total : 0, detalle: x.detalle.length ? x.detalle : null }));
  const out = [...mover(debe, "d"), ...mover(haber, "h")];
  const td = r2(out.reduce((a, l) => a + l.debe, 0));
  const th = r2(out.reduce((a, l) => a + l.haber, 0));
  return { lineas: out, faltantes: [...new Set(faltantes)], totalDebe: td, totalHaber: th, cuadra: Math.abs(td - th) < 0.01 };
}

export async function contabilizarPlanilla({ empresaId, planilla, lineas, empleados, cfg }) {
  const p = armarPartidaPlanilla({ lineas, empleados, cfg });
  if (p.faltantes.length) throw new Error("Falta configurar estas cuentas en RRHH → Configuración: " + p.faltantes.join(", ") + ".");
  if (!p.cuadra) throw new Error(`La partida no cuadra (Debe ${p.totalDebe} / Haber ${p.totalHaber}). Revisa la configuración.`);

  const numero = await siguienteNumeroPartida(empresaId, "diario");
  const { data: tx, error: errTx } = await supabase
    .from("transacciones")
    .insert({
      empresa_id: empresaId,
      fecha: planilla.fecha_pago,
      descripcion: `Planilla de sueldos ${planilla.periodicidad} correspondiente a ${textoPeriodo(planilla)}`,
      numero_partida: numero,
      tipo: "diario",
    })
    .select()
    .single();
  if (errTx) throw errTx;
  const { error: errMov } = await supabase.from("movimientos").insert(p.lineas.map((l) => ({ ...l, transaccion_id: tx.id })));
  if (errMov) {
    await supabase.from("transacciones").delete().eq("id", tx.id);
    throw errMov;
  }
  const { error: errPl } = await supabase.from("planillas").update({ transaccion_id: tx.id }).eq("id", planilla.id);
  if (errPl) {
    await supabase.from("transacciones").delete().eq("id", tx.id);
    throw errPl;
  }
  return { numero, total: p.totalDebe };
}
