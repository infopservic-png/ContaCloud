// Estado de flujo de efectivo (método indirecto) y Estado de cambios en el patrimonio.
// Se calculan comparando los saldos de las cuentas al inicio y al final del rango, de modo que
// el flujo siempre concilia con la variación real del efectivo.

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const CLASES_RESULTADO = ["Ingreso", "Costo", "Gasto"];
const esEfectivo = (codigo) => String(codigo).startsWith("1101");

// Saldo (Debe − Haber) de una cuenta al inicio del rango y al final, y movimientos del rango
export function saldosCuenta(cuenta, desde, hasta) {
  let ant = 0, cargos = 0, abonos = 0;
  for (const m of cuenta.movimientos || []) {
    const t = m.transacciones;
    const fecha = t?.fecha || "";
    if (hasta && fecha > hasta) continue;
    const debe = Number(m.debe) || 0;
    const haber = Number(m.haber) || 0;
    if (t?.tipo === "apertura" || (desde && fecha < desde)) ant += debe - haber;
    else { cargos += debe; abonos += haber; }
  }
  return { ant, cargos, abonos, fin: ant + cargos - abonos };
}

// Líneas del flujo: el valor de cada una es −(variación del saldo Debe−Haber) de sus cuentas de mayor,
// es decir: aumento de un pasivo o patrimonio suma; aumento de un activo resta.
const LINEAS = [
  { seccion: "operacion", grupo: "ajustes", etiqueta: "Depreciación y amortización", mayores: ["1204", "1207", "1210"] },
  { seccion: "operacion", grupo: "ajustes", etiqueta: "Deterioro de valor de activos", mayores: ["1205", "1208", "1211", "1213", "1108"] },
  { seccion: "operacion", grupo: "ajustes", etiqueta: "Impuesto sobre la renta diferido", mayores: ["1216", "2204"] },
  { seccion: "operacion", grupo: "capital", etiqueta: "(Aumento) disminución en cuentas por cobrar", mayores: ["1103", "1104", "1201"] },
  { seccion: "operacion", grupo: "capital", etiqueta: "(Aumento) disminución en inventarios", mayores: ["1107"] },
  { seccion: "operacion", grupo: "capital", etiqueta: "(Aumento) disminución en IVA crédito fiscal y anticipos de impuestos", mayores: ["1106", "1105"] },
  { seccion: "operacion", grupo: "capital", etiqueta: "(Aumento) disminución en gastos pagados por anticipado", mayores: ["1109"] },
  { seccion: "operacion", grupo: "capital", etiqueta: "(Aumento) disminución en otros activos", mayores: ["1202"] },
  { seccion: "operacion", grupo: "capital", etiqueta: "Aumento (disminución) en proveedores y cuentas por pagar", mayores: ["2101", "2205"] },
  { seccion: "operacion", grupo: "capital", etiqueta: "Aumento (disminución) en retenciones e impuestos por pagar", mayores: ["2102", "2103"] },
  { seccion: "operacion", grupo: "capital", etiqueta: "Aumento (disminución) en IVA débito fiscal", mayores: ["2105"] },
  { seccion: "operacion", grupo: "capital", etiqueta: "Aumento (disminución) en beneficios a empleados", mayores: ["2104"] },
  { seccion: "operacion", grupo: "capital", etiqueta: "Aumento (disminución) en provisiones", mayores: ["2109", "2201"] },
  { seccion: "inversion", etiqueta: "Propiedades, planta y equipo y propiedades de inversión (adquisiciones y ventas)", mayores: ["1203", "1209"] },
  { seccion: "inversion", etiqueta: "Activos intangibles", mayores: ["1206"] },
  { seccion: "inversion", etiqueta: "Inversiones financieras y partes relacionadas", mayores: ["1102", "1212", "1214", "1215"] },
  { seccion: "financiacion", etiqueta: "Préstamos y deudas financieras", mayores: ["2108", "2202"] },
  { seccion: "financiacion", etiqueta: "Arrendamientos financieros", mayores: ["2106", "2203"] },
  { seccion: "financiacion", etiqueta: "Aportes de capital social", mayores: ["3101"] },
  { seccion: "financiacion", etiqueta: "Dividendos por pagar", mayores: ["2107"] },
  { seccion: "financiacion", etiqueta: "Distribución de utilidades, reservas y otros movimientos de patrimonio", mayores: ["3201", "3202", "3203", "3301", "3401"] },
];

// cuentas: [{ codigo, nombre, clase, movimientos }] (sin partidas de cierre). desde/hasta: 'YYYY-MM-DD'.
export function calcularFlujoEfectivo(cuentas, desde, hasta) {
  let utilidad = 0, efectivoInicio = 0, efectivoFin = 0;
  const lineas = LINEAS.map((l) => ({ ...l, monto: 0 }));
  const otras = { seccion: "operacion", grupo: "capital", etiqueta: "Otras partidas no clasificadas", monto: 0, cuentas: [] };

  for (const c of cuentas) {
    const codigo = String(c.codigo);
    const s = saldosCuenta(c, desde, hasta);
    if (!s.ant && !s.cargos && !s.abonos) continue;
    if (CLASES_RESULTADO.includes(c.clase)) { utilidad += -(s.fin - s.ant); continue; } // movimientos del rango: haber − debe
    if (esEfectivo(codigo)) { efectivoInicio += s.ant; efectivoFin += s.fin; continue; }
    const variacion = -(s.fin - s.ant);
    const linea = lineas.find((l) => l.mayores.includes(codigo.slice(0, 4)));
    if (linea) linea.monto += variacion;
    else { otras.monto += variacion; otras.cuentas.push(`${codigo} ${c.nombre}`); }
  }

  const todas = otras.cuentas.length ? [...lineas, otras] : lineas;
  const redondear = (ls) => ls.map((l) => ({ ...l, monto: r2(l.monto) })).filter((l) => Math.abs(l.monto) >= 0.005);
  const ajustes = redondear(todas.filter((l) => l.seccion === "operacion" && l.grupo === "ajustes"));
  const capital = redondear(todas.filter((l) => l.seccion === "operacion" && l.grupo === "capital"));
  const inversion = redondear(todas.filter((l) => l.seccion === "inversion"));
  const financiacion = redondear(todas.filter((l) => l.seccion === "financiacion"));
  const suma = (ls) => r2(ls.reduce((s, l) => s + l.monto, 0));

  const utilidadNeta = r2(utilidad);
  const operacion = r2(utilidadNeta + suma(ajustes) + suma(capital));
  const inv = suma(inversion);
  const fin = suma(financiacion);
  const aumento = r2(operacion + inv + fin);
  const inicio = r2(efectivoInicio);
  const final = r2(efectivoFin);
  return {
    utilidadNeta, ajustes, capital, inversion, financiacion,
    totales: { operacion, inversion: inv, financiacion: fin, aumento },
    efectivoInicio: inicio, efectivoFinal: final,
    concilia: Math.abs(inicio + aumento - final) < 0.01,
    sinClasificar: otras.cuentas,
  };
}

// Componentes del patrimonio (saldo acreedor)
const COMPONENTES = [
  { clave: "capital", titulo: "Capital social", prefijos: ["31"] },
  { clave: "acumulados", titulo: "Resultados acumulados", prefijos: ["33"] },
  { clave: "reservas", titulo: "Reserva legal", prefijos: ["32"] },
  { clave: "superavit", titulo: "Superávit", prefijos: ["34"] },
];

export function calcularCambiosPatrimonio(cuentas, desde, hasta) {
  const cols = [...COMPONENTES.map((c) => c.clave), "resultado", "otros"];
  const vacio = () => Object.fromEntries(cols.map((k) => [k, 0]));
  const inicio = vacio(), aumentos = vacio(), disminuciones = vacio();
  let resultadoInicio = 0, resultadoPeriodo = 0;

  for (const c of cuentas) {
    const codigo = String(c.codigo);
    const s = saldosCuenta(c, desde, hasta);
    if (!s.ant && !s.cargos && !s.abonos) continue;
    if (CLASES_RESULTADO.includes(c.clase)) {
      resultadoInicio += -s.ant; // acumulado del ejercicio antes del rango
      resultadoPeriodo += s.abonos - s.cargos;
      continue;
    }
    if (c.clase !== "Capital") continue;
    const comp = COMPONENTES.find((x) => x.prefijos.some((p) => codigo.startsWith(p)));
    const k = comp ? comp.clave : "otros";
    inicio[k] += -s.ant;
    aumentos[k] += s.abonos;
    disminuciones[k] += s.cargos;
  }
  inicio.resultado = resultadoInicio;
  aumentos.resultado = 0; disminuciones.resultado = 0;
  const periodo = vacio();
  periodo.resultado = resultadoPeriodo;

  const finalK = {};
  for (const k of cols) finalK[k] = inicio[k] + aumentos[k] - disminuciones[k] + periodo[k];
  const total = (o) => r2(cols.reduce((s, k) => s + o[k], 0));
  const redo = (o) => Object.fromEntries(cols.map((k) => [k, r2(o[k])]));
  const columnas = [COMPONENTES[0], COMPONENTES[1], { clave: "resultado", titulo: "Resultados del ejercicio" }, COMPONENTES[2], COMPONENTES[3], { clave: "otros", titulo: "Otras cuentas de patrimonio" }].map((c) => ({ clave: c.clave, titulo: c.titulo }))
    .filter((col) => [inicio, aumentos, disminuciones, periodo, finalK].some((o) => Math.abs(o[col.clave]) >= 0.005));
  return {
    columnas,
    filas: [
      { etiqueta: "Saldos al inicio", valores: redo(inicio), total: total(inicio), fuerte: true, tipo: "inicio" },
      { etiqueta: "Aportes y otros aumentos", valores: redo(aumentos), total: total(aumentos) },
      { etiqueta: "Distribuciones y otras disminuciones", valores: redo(Object.fromEntries(cols.map((k) => [k, -disminuciones[k]]))), total: r2(-cols.reduce((s, k) => s + disminuciones[k], 0)) },
      { etiqueta: "Resultado del ejercicio", valores: redo(periodo), total: total(periodo) },
      { etiqueta: "Saldos al final", valores: redo(finalK), total: total(finalK), fuerte: true, tipo: "final" },
    ],
  };
}
