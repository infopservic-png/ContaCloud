import { supabase } from "@/lib/supabaseClient";
import { r2 } from "@/lib/rrhh";

// Códigos de ingreso válidos del Anexo F14 (hoja «CODIGOS VALIDOS DE INGRESO» de la plantilla de Hacienda).
export const CODIGOS_INGRESO = [
  ["01", "Servicios de carácter permanente con subordinación o dependencia laboral"],
  ["05", "Rentas de personas jurídicas domiciliadas provenientes de depósitos de dinero"],
  ["06", "Renta de personas jurídicas domiciliadas provenientes de títulos valores"],
  ["07", "Retención por actividades agropecuarias"],
  ["08", "Retención por juicios ejecutivos"],
  ["09", "Otras retenciones acreditables"],
  ["11", "Servicios sin dependencia laboral"],
  ["19", "Costos y gastos incurridos sujetos a retención y entero"],
  ["20", "Valores garantizados por seguro dotal u otros tipos de seguros"],
  ["21", "Otros servicios sin dependencia laboral"],
  ["22", "Transferencia de bienes intangibles por personas naturales domiciliadas"],
  ["23", "Transferencia de bienes intangibles por personas jurídicas domiciliadas"],
  ["24", "Uso o concesión de uso de derechos de bienes tangibles e intangibles a personas naturales domiciliadas"],
  ["25", "Uso o concesión de uso de derechos de bienes tangibles e intangibles a personas jurídicas domiciliadas"],
  ["26", "Operaciones de renta y asimiladas a rentas a personas domiciliadas"],
  ["27", "Retención por servicios de arrendamiento a personas naturales"],
  ["28", "Rentas de personas naturales domiciliadas provenientes de títulos valores"],
  ["29", "Premios o ganancia de domiciliadas provenientes de concursos, rifas, sorteos o juegos de azar o de habilidad"],
  ["30", "Rentas obtenidas en el país de no domiciliadas por rendimiento de capital invertido, títulos valores"],
  ["31", "Uso o concesión de uso de derechos de bienes tangibles e intangibles a no domiciliados"],
  ["32", "Transferencia de bienes intangibles por no domiciliados"],
  ["33", "Rentas obtenidas en el país por personas no domiciliadas"],
  ["34", "Servicios utilizados en el país por actividades originadas en el exterior"],
  ["35", "Pagos efectuados a casa matriz (no domiciliadas) por filiales y/o sucursales domiciliadas"],
  ["36", "Servicio de transporte internacional a personas no domiciliadas"],
  ["37", "Servicios por aseguradoras, reaseguradoras, afianzadoras y corredores de reaseguros no domiciliados"],
  ["38", "Servicios de financiamiento por instituciones financieras no domiciliadas"],
  ["39", "Operaciones con intangibles o uso de derechos a no domiciliados"],
  ["40", "Rentas de personas constituidas, domiciliadas o residentes en países con regímenes fiscales preferentes"],
  ["41", "Premios o ganancia de no domiciliadas provenientes de concursos, rifas, sorteos o juegos"],
  ["42", "Otras retenciones no acreditables"],
  ["43", "Pago o acreditación de utilidades a socios, accionistas, asociados, fideicomisarios, partícipes"],
  ["44", "Pago o acreditación de utilidades a sujetos no domiciliados en El Salvador"],
  ["45", "Pago o acreditación en disminución de capital o patrimonio"],
  ["46", "Préstamos, mutuos, anticipos o financiamientos"],
  ["47", "Rentas a personas naturales domiciliadas por intereses, premios y otras utilidades de depósitos en dinero"],
  ["48", "Indemnizaciones por daños"],
  ["49", "Ingresos por remuneraciones con o sin dependencia laboral prestados a inversionistas"],
  ["60", "Servicios de carácter permanente con subordinación laboral (Tramo I de las tablas de retención)"],
  ["70", "Indemnizaciones por despidos, retiro voluntario, muerte, incapacidad, accidente o enfermedad"],
  ["71", "Valores garantizados por seguro dotal u otros tipos de seguro"],
  ["72", "Remuneraciones por servicios en el exterior de funcionarios o empleados de Gobierno"],
  ["80", "Servicios de carácter permanente con subordinación laboral sin contribuciones sociales (jubilados y pensionados)"],
  ["81", "Servicios de carácter permanente sin retención prestados por jubilados y pensionados"],
  ["82", "Pago de sueldos caídos con retención"],
  ["83", "Pago de sueldos caídos sin retención"],
  ["84", "Pago de dietas"],
  ["85", "Indemnizaciones laborales"],
];

// Los cuatro códigos nuevos desde febrero de 2024 (hoja «PARAMETROS»).
export const TIPO_OPERACION = [["1", "Gravada"], ["2", "No gravada o exenta"], ["3", "Excluido o no constituye renta"], ["4", "Mixta (regímenes especiales con incentivos fiscales)"], ["8", "Operaciones informadas en más de 1 anexo"], ["9", "Excepciones (instituciones públicas, no inscritos a IVA, operaciones no deducibles, otros)"], ["0", "Periodos anteriores a febrero de 2024"]];
export const CLASIFICACION = [["1", "Costo"], ["2", "Gasto"], ["8", "Operaciones informadas en más de 1 anexo"], ["9", "Excepciones"], ["0", "Periodos anteriores a febrero de 2024"]];
export const SECTOR = [["1", "Industria"], ["2", "Comercio"], ["3", "Agropecuaria"], ["4", "Servicios, profesiones, artes y oficios"], ["8", "Operaciones informadas en más de 1 anexo"], ["9", "Excepciones"], ["0", "Periodos anteriores a febrero de 2024"]];
export const TIPO_COSTO = [["1", "Gasto de venta sin donación"], ["2", "Gasto de administración sin donación"], ["3", "Gastos financieros sin donación"], ["4", "Costo artículos producidos/comprados importaciones/internaciones"], ["5", "Costo artículos producidos/comprados interno"], ["6", "Costos indirectos de fabricación"], ["7", "Mano de obra"], ["8", "Operaciones informadas en más de 1 anexo"], ["9", "Excepciones"], ["0", "Periodos anteriores a febrero de 2024"]];

// ---------- Utilidades de formato (equivalentes a las funciones de la macro de la plantilla) ----------
const soloDigitos = (s) => String(s || "").replace(/\D/g, "");
const izq = (s, n) => String(s ?? "").toUpperCase().slice(0, n); // PadR de la macro: Left(UCase(texto), n)
const der = (s, n) => String(s ?? "").slice(-n); // PadL de la macro: Right(texto, n)
const dinero = (n) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);

export const periodoMMAAAA = (ym) => `${ym.slice(5, 7)}${ym.slice(0, 4)}`;
const limitesMes = (ym) => {
  const [a, m] = ym.split("-").map(Number);
  const ult = new Date(a, m, 0).getDate();
  return { ini: `${ym}-01`, fin: `${ym}-${String(ult).padStart(2, "0")}` };
};

// ---------- Anexo F14 ----------

// Devuelve las filas del F14 de un mes: una por empleado (planillas del mes) y una por compra con retención de renta.
export async function obtenerFilasF14(empresaId, ym, cfg) {
  const { ini, fin } = limitesMes(ym);
  const porDefecto = {
    tipoOperacion: cfg?.f14_tipo_operacion || "1",
    clasificacion: cfg?.f14_clasificacion || "2",
    sector: cfg?.f14_sector || "2",
    tipoCosto: cfg?.f14_tipo_costo || "2",
  };
  const base = {
    domiciliado: "1", pais: "9300", inpep: 0, ipsfa: 0, cefafa: 0, bienestar: 0, isssIvm: 0,
    aguinaldoExento: 0, aguinaldoGravado: 0, periodo: periodoMMAAAA(ym), ...porDefecto,
  };
  const filas = [];

  // 1) Planillas: se suman las quincenas del mismo empleado en el mes
  const { data: lineas, error: errP } = await supabase
    .from("planilla_lineas")
    .select("empleado_id, sueldo, comisiones, otros_ingresos, renta, isss_emp, afp_emp, empleado:empleado_id ( nombre, dui, nit ), planillas!inner ( empresa_id, periodo_ini )")
    .eq("planillas.empresa_id", empresaId)
    .gte("planillas.periodo_ini", ini)
    .lte("planillas.periodo_ini", fin);
  if (errP) throw errP;
  const porEmpleado = new Map();
  for (const l of lineas || []) {
    const x = porEmpleado.get(l.empleado_id) || { emp: l.empleado, sueldo: 0, otros: 0, renta: 0, afp: 0, isss: 0 };
    x.sueldo = r2(x.sueldo + Number(l.sueldo) + Number(l.comisiones));
    x.otros = r2(x.otros + Number(l.otros_ingresos));
    x.renta = r2(x.renta + Number(l.renta));
    x.afp = r2(x.afp + Number(l.afp_emp));
    x.isss = r2(x.isss + Number(l.isss_emp));
    porEmpleado.set(l.empleado_id, x);
  }
  for (const x of porEmpleado.values()) {
    const dui = soloDigitos(x.emp?.dui);
    filas.push({
      ...base,
      origen: "Planilla",
      nombre: x.emp?.nombre || "",
      // Con DUI el NIT debe ir vacío (regla del anexo desde enero de 2022)
      nit: dui ? "" : soloDigitos(x.emp?.nit),
      dui,
      codigoIngreso: x.renta > 0 ? "01" : "60",
      devengado: x.sueldo,
      bonificaciones: x.otros,
      retenido: x.renta,
      afp: x.afp,
      isss: x.isss,
      tipoCosto: porDefecto.tipoCosto,
    });
  }

  // 2) Compras con retención de renta (campo de la compra, o la que trae el DTE importado)
  const { data: compras, error: errC } = await supabase
    .from("compras")
    .select("id, fecha, subtotal, retencion_renta, codigo_ingreso, numero_documento, json_dte, proveedor:proveedor_id ( nombre, tipo_documento, nit_dui )")
    .eq("empresa_id", empresaId)
    .gte("fecha", ini)
    .lte("fecha", fin)
    .order("fecha");
  if (errC) throw errC;
  for (const c of compras || []) {
    let ret = Number(c.retencion_renta) || 0;
    if (!(ret > 0)) ret = Number(c.json_dte?.resumen?.reteRenta) || 0;
    if (!(ret > 0)) continue;
    const doc = soloDigitos(c.proveedor?.nit_dui);
    const esDui = c.proveedor?.tipo_documento === "dui";
    filas.push({
      ...base,
      origen: `Compra ${c.numero_documento || ""}`.trim(),
      nombre: c.proveedor?.nombre || "",
      nit: esDui ? "" : doc,
      dui: esDui ? doc : "",
      codigoIngreso: c.codigo_ingreso || "11",
      devengado: r2(c.subtotal),
      bonificaciones: 0,
      retenido: r2(ret),
      afp: 0,
      isss: 0,
    });
  }
  return filas;
}

// Una línea del archivo plano del F14, con los mismos recortes que la macro de la plantilla.
export function lineaF14(f) {
  const c1 = (v) => izq(String(v ?? "").trim().charAt(0), 1);
  return [
    izq(f.domiciliado, 1),
    izq(f.pais, 4),
    izq(f.nombre, 100),
    der(soloDigitos(f.nit), 14),
    der(soloDigitos(f.dui), 9),
    izq(f.codigoIngreso, 2),
    izq(dinero(f.devengado), 12),
    izq(dinero(f.bonificaciones), 12),
    izq(dinero(f.retenido), 12),
    izq(dinero(f.aguinaldoExento), 6),
    izq(dinero(f.aguinaldoGravado), 12),
    der(dinero(f.afp), 7),
    der(dinero(f.isss), 5),
    der(dinero(f.inpep), 6),
    der(dinero(f.ipsfa), 6),
    der(dinero(f.cefafa), 6),
    der(dinero(f.bienestar), 6),
    der(dinero(f.isssIvm), 6),
    c1(f.tipoOperacion),
    c1(f.clasificacion),
    c1(f.sector),
    c1(f.tipoCosto),
    izq(f.periodo, 6),
  ].join(";");
}
export const csvF14 = (filas) => filas.map(lineaF14).join("\r\n") + "\r\n";

// ---------- Anexo Q25 (quincena 25) ----------
export function lineaQ25(f) {
  return [
    izq(f.nombre, 100),
    der(soloDigitos(f.nit), 14),
    der(soloDigitos(f.dui), 9),
    izq(f.fechaPago, 10),
    izq(dinero(f.salario), 7),
    izq(dinero(f.quincena25), 6),
    izq(f.periodo, 6),
  ].join(";");
}
export const csvQ25 = (filas) => filas.map(lineaQ25).join("\r\n") + "\r\n";

// Descarga un texto como archivo CSV en codificación ANSI (Latin-1), igual que la macro de Excel.
export function descargarCsv(nombreArchivo, texto) {
  const bytes = new Uint8Array(texto.length);
  for (let i = 0; i < texto.length; i++) {
    const code = texto.charCodeAt(i);
    bytes[i] = code <= 255 ? code : 63; // "?" para lo que no existe en ANSI
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
