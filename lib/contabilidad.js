import { supabase } from "@/lib/supabaseClient";

// Trae todas las cuentas de una empresa junto con sus movimientos
// (y la transacción/partida a la que pertenece cada movimiento).
// Como cada cuenta ya pertenece a una sola empresa, no hace falta
// filtrar los movimientos por separado: vienen incluidos por la
// relación cuenta -> movimientos.
export async function obtenerCuentasConMovimientos(empresaId) {
  const { data, error } = await supabase
    .from("cuentas")
    .select(
      `id, codigo, nombre, clase, tipo_saldo,
       movimientos ( id, debe, haber,
         transacciones ( id, fecha, descripcion, numero_partida ) )`
    )
    .eq("empresa_id", empresaId)
    .order("codigo");

  if (error) throw error;
  return data || [];
}

// Trae las transacciones (partidas) de una empresa con sus líneas,
// para el reporte de Libro Diario / reporte de partidas.
export async function obtenerPartidas(empresaId) {
  const { data, error } = await supabase
    .from("transacciones")
    .select(
      `id, fecha, descripcion, numero_partida, elaborado_por, revisado_por,
       movimientos ( id, debe, haber, cuentas ( codigo, nombre ) )`
    )
    .eq("empresa_id", empresaId)
    .order("numero_partida");

  if (error) throw error;
  return data || [];
}

// Filtra los movimientos de cada cuenta hasta (e incluyendo) una fecha de corte.
// Útil para Balance de Comprobación y Balance General ("Al [fecha]").
export function filtrarMovimientosHasta(cuentas, fechaCorte) {
  if (!fechaCorte) return cuentas;
  return cuentas.map((c) => ({
    ...c,
    movimientos: (c.movimientos || []).filter(
      (m) => !m.transacciones?.fecha || m.transacciones.fecha <= fechaCorte
    ),
  }));
}

// Filtra los movimientos de cada cuenta dentro de un rango de fechas.
// Útil para el Estado de Resultados ("Del ... al ...").
export function filtrarMovimientosRango(cuentas, fechaInicio, fechaFin) {
  if (!fechaInicio && !fechaFin) return cuentas;
  return cuentas.map((c) => ({
    ...c,
    movimientos: (c.movimientos || []).filter((m) => {
      const f = m.transacciones?.fecha;
      if (!f) return true;
      if (fechaInicio && f < fechaInicio) return false;
      if (fechaFin && f > fechaFin) return false;
      return true;
    }),
  }));
}

export function sumaDebeHaber(cuenta) {
  const movs = cuenta.movimientos || [];
  const sumaDebe = movs.reduce((acc, m) => acc + Number(m.debe || 0), 0);
  const sumaHaber = movs.reduce((acc, m) => acc + Number(m.haber || 0), 0);
  return { sumaDebe, sumaHaber };
}

// Balance de comprobación: clasifica el saldo neto de cada cuenta
// en columna deudora o acreedora según su signo real (no según el
// tipo_saldo "esperado"), que es como se arma un balance de
// comprobación preliminar de verdad.
export function calcularBalanceComprobacion(cuentas) {
  const filas = cuentas.map((cuenta) => {
    const { sumaDebe, sumaHaber } = sumaDebeHaber(cuenta);
    const neto = sumaDebe - sumaHaber;
    return {
      cuenta,
      sumaDebe,
      sumaHaber,
      saldoDeudor: neto > 0 ? neto : 0,
      saldoAcreedor: neto < 0 ? -neto : 0,
    };
  });

  const totales = filas.reduce(
    (acc, f) => ({
      sumaDebe: acc.sumaDebe + f.sumaDebe,
      sumaHaber: acc.sumaHaber + f.sumaHaber,
      saldoDeudor: acc.saldoDeudor + f.saldoDeudor,
      saldoAcreedor: acc.saldoAcreedor + f.saldoAcreedor,
    }),
    { sumaDebe: 0, sumaHaber: 0, saldoDeudor: 0, saldoAcreedor: 0 }
  );

  return { filas, totales };
}

// Estado de Resultados: Ingresos - Costos - Gastos = Utilidad (o pérdida).
// El saldo "natural" de Ingreso es acreedor (haber-debe) y el de
// Costo/Gasto es deudor (debe-haber). Las cuentas de contra (p.ej.
// "Devoluciones sobre Ventas", que es Ingreso pero de saldo deudor)
// se restan solas porque su resultado da negativo con esta misma fórmula.
export function calcularEstadoResultados(cuentas) {
  const linea = (c) => {
    const { sumaDebe, sumaHaber } = sumaDebeHaber(c);
    return { cuenta: c, monto: 0, sumaDebe, sumaHaber };
  };

  const ingresos = cuentas
    .filter((c) => c.clase === "Ingreso")
    .map((c) => {
      const { sumaDebe, sumaHaber } = sumaDebeHaber(c);
      return { cuenta: c, monto: sumaHaber - sumaDebe };
    })
    .filter((l) => l.monto !== 0);

  const costos = cuentas
    .filter((c) => c.clase === "Costo")
    .map((c) => {
      const { sumaDebe, sumaHaber } = sumaDebeHaber(c);
      return { cuenta: c, monto: sumaDebe - sumaHaber };
    })
    .filter((l) => l.monto !== 0);

  const gastos = cuentas
    .filter((c) => c.clase === "Gasto")
    .map((c) => {
      const { sumaDebe, sumaHaber } = sumaDebeHaber(c);
      return { cuenta: c, monto: sumaDebe - sumaHaber };
    })
    .filter((l) => l.monto !== 0);

  const totalIngresos = ingresos.reduce((a, l) => a + l.monto, 0);
  const totalCostos = costos.reduce((a, l) => a + l.monto, 0);
  const totalGastos = gastos.reduce((a, l) => a + l.monto, 0);
  const utilidadBruta = totalIngresos - totalCostos;
  const utilidadNeta = utilidadBruta - totalGastos;

  return {
    ingresos,
    totalIngresos,
    costos,
    totalCostos,
    gastos,
    totalGastos,
    utilidadBruta,
    utilidadNeta,
  };
}

// Balance General: Activo = Pasivo + Capital (incluyendo la utilidad
// o pérdida del periodo, que viene del Estado de Resultados).
export function calcularBalanceGeneral(cuentas, utilidadNeta) {
  const activos = cuentas
    .filter((c) => c.clase === "Activo")
    .map((c) => {
      const { sumaDebe, sumaHaber } = sumaDebeHaber(c);
      return { cuenta: c, monto: sumaDebe - sumaHaber };
    })
    .filter((l) => l.monto !== 0);

  const pasivos = cuentas
    .filter((c) => c.clase === "Pasivo")
    .map((c) => {
      const { sumaDebe, sumaHaber } = sumaDebeHaber(c);
      return { cuenta: c, monto: sumaHaber - sumaDebe };
    })
    .filter((l) => l.monto !== 0);

  const capital = cuentas
    .filter((c) => c.clase === "Capital")
    .map((c) => {
      const { sumaDebe, sumaHaber } = sumaDebeHaber(c);
      return { cuenta: c, monto: sumaHaber - sumaDebe };
    })
    .filter((l) => l.monto !== 0);

  const totalActivo = activos.reduce((a, l) => a + l.monto, 0);
  const totalPasivo = pasivos.reduce((a, l) => a + l.monto, 0);
  const totalCapitalPropio = capital.reduce((a, l) => a + l.monto, 0);
  const totalCapital = totalCapitalPropio + utilidadNeta;
  const totalPasivoCapital = totalPasivo + totalCapital;

  return {
    activos,
    totalActivo,
    pasivos,
    totalPasivo,
    capital,
    totalCapitalPropio,
    utilidadNeta,
    totalCapital,
    totalPasivoCapital,
    cuadra: Math.abs(totalActivo - totalPasivoCapital) < 0.01,
  };
}

export function formatoMoneda(n) {
  const num = Number(n || 0);
  return num.toLocaleString("es-SV", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
