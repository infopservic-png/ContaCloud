// Balance de comprobación jerárquico con saldo anterior, cargos, abonos y saldo final
// (formato de los sistemas contables salvadoreños): las cuentas se acumulan por nivel
// (1 dígito, 2 dígitos, cuenta de mayor de 4 dígitos y cuentas de detalle).
import { CUENTAS_MAYOR_4_DIGITOS } from "@/lib/cuentasMayor";

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export const NOMBRES_NIVEL = {
  "1": "ACTIVO", "11": "ACTIVO CORRIENTE", "12": "ACTIVO NO CORRIENTE",
  "2": "PASIVO", "21": "PASIVO CORRIENTE", "22": "PASIVO NO CORRIENTE",
  "3": "PATRIMONIO", "31": "CAPITAL", "32": "RESERVAS", "33": "RESULTADOS", "34": "SUPERÁVIT",
  "4": "COSTOS Y GASTOS", "41": "COSTOS", "42": "GASTOS DE OPERACIÓN", "43": "GASTOS NO OPERACIONALES",
  "5": "INGRESOS", "51": "INGRESOS OPERACIONALES", "52": "INGRESOS NO OPERACIONALES",
  "6": "PÉRDIDAS Y GANANCIAS",
};
const CLASES_DEUDORAS = ["Activo", "Costo", "Gasto"];
const NIVELES = [1, 2, 4, 6, 8, 10, 12];

export const SECCIONES = {
  deudora: "ACTIVOS Y GASTOS",
  acreedora: "PASIVOS, PATRIMONIO E INGRESOS",
};

// cuentas: [{ id, codigo, nombre, clase, movimientos:[{ debe, haber, transacciones:{ fecha, tipo } }] }]
// desde/hasta: 'YYYY-MM-DD'. Los movimientos anteriores a «desde» (y las partidas de apertura) forman el saldo anterior.
export function construirBalanceJerarquico(cuentas, desde, hasta) {
  const porCodigo = new Map(cuentas.map((c) => [String(c.codigo), c]));
  const nodos = new Map();

  // Sección (deudora / acreedora) de cada primer dígito, según la clase de las cuentas que lo usan
  const seccionDigito = { "1": "deudora", "4": "deudora", "2": "acreedora", "3": "acreedora", "5": "acreedora" };
  for (const c of cuentas) {
    const d = String(c.codigo)[0];
    if (!(d in seccionDigito)) seccionDigito[d] = CLASES_DEUDORAS.includes(c.clase) ? "deudora" : "acreedora";
  }

  const nodo = (codigo, nombre, esCuenta) => {
    if (!nodos.has(codigo)) nodos.set(codigo, { codigo, nombre, esCuenta, nivel: codigo.length, ant: 0, cargos: 0, abonos: 0, seccion: seccionDigito[codigo[0]] });
    return nodos.get(codigo);
  };

  for (const c of cuentas) {
    const codigo = String(c.codigo);
    let ant = 0, cargos = 0, abonos = 0, hayMov = false;
    for (const m of c.movimientos || []) {
      const t = m.transacciones;
      const fecha = t?.fecha || "";
      const debe = Number(m.debe) || 0;
      const haber = Number(m.haber) || 0;
      if (hasta && fecha > hasta) continue;
      hayMov = true;
      if (t?.tipo === "apertura" || (desde && fecha < desde)) ant += debe - haber;
      else { cargos += debe; abonos += haber; }
    }
    if (!hayMov) continue;
    const propios = [codigo, c.nombre, true];
    const destinos = [propios];
    for (const n of NIVELES) {
      if (n >= codigo.length) break;
      const p = codigo.slice(0, n);
      const cuentaPadre = porCodigo.get(p);
      const nombre = cuentaPadre?.nombre || (n === 4 ? CUENTAS_MAYOR_4_DIGITOS[p] : NOMBRES_NIVEL[p]);
      if (nombre) destinos.push([p, n <= 4 && !cuentaPadre ? nombre.toUpperCase() : nombre, !!cuentaPadre]);
    }
    for (const [cod, nombre, esCuenta] of destinos) {
      const nd = nodo(cod, nombre, esCuenta);
      nd.ant += ant; nd.cargos += cargos; nd.abonos += abonos;
    }
  }

  const secciones = [];
  for (const clave of ["deudora", "acreedora"]) {
    const signo = clave === "deudora" ? 1 : -1;
    const filas = [...nodos.values()]
      .filter((n) => n.seccion === clave)
      .sort((a, b) => (a.codigo < b.codigo ? -1 : a.codigo > b.codigo ? 1 : 0))
      .map((n) => {
        const antNat = r2(n.ant * signo);
        const finNat = r2((n.ant + n.cargos - n.abonos) * signo);
        return { codigo: n.codigo, nombre: n.nombre, nivel: n.nivel, esCuenta: n.esCuenta, anterior: antNat, cargos: r2(n.cargos), abonos: r2(n.abonos), final: finNat };
      })
      .filter((f) => f.anterior || f.cargos || f.abonos || f.final || f.nivel > 0);
    const raices = filas.filter((f) => f.nivel === 1);
    const totales = {
      anterior: r2(raices.reduce((s, f) => s + f.anterior, 0)),
      cargos: r2(raices.reduce((s, f) => s + f.cargos, 0)),
      abonos: r2(raices.reduce((s, f) => s + f.abonos, 0)),
      final: r2(raices.reduce((s, f) => s + f.final, 0)),
    };
    secciones.push({ clave, titulo: SECCIONES[clave], filas, totales });
  }
  const [a, b] = secciones;
  const cuadra =
    Math.abs(a.totales.anterior - b.totales.anterior) < 0.01 &&
    Math.abs(a.totales.final - b.totales.final) < 0.01 &&
    Math.abs(a.totales.cargos + b.totales.cargos - (a.totales.abonos + b.totales.abonos)) < 0.01;
  return { secciones, cuadra };
}

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const dma = (f) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`;
// «Correspondiente al mes de Octubre de 2025» cuando el rango es un mes completo; si no, «Del … al …»
export function leyendaRango(desde, hasta) {
  if (!desde || !hasta) return "";
  const finMes = new Date(Date.UTC(Number(hasta.slice(0, 4)), Number(hasta.slice(5, 7)), 0)).toISOString().slice(0, 10);
  if (desde.slice(0, 7) === hasta.slice(0, 7) && desde.endsWith("-01") && hasta === finMes) {
    return `Correspondiente al mes de ${MESES[Number(hasta.slice(5, 7)) - 1]} de ${hasta.slice(0, 4)}`;
  }
  return `Del ${dma(desde)} al ${dma(hasta)}`;
}
