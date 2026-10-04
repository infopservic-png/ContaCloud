export const CATALOGO_SERVICIO = [
  { codigo: "1101", nombre: "Efectivo y Equivalentes", clase: "Activo", tipo_saldo: "deudor" },
  { codigo: "1102", nombre: "Cuentas por Cobrar", clase: "Activo", tipo_saldo: "deudor" },
  { codigo: "1201", nombre: "Mobiliario y Equipo", clase: "Activo", tipo_saldo: "deudor" },
  { codigo: "2101", nombre: "Cuentas por Pagar", clase: "Pasivo", tipo_saldo: "acreedor" },
  { codigo: "2102", nombre: "IVA por Pagar", clase: "Pasivo", tipo_saldo: "acreedor" },
  { codigo: "3101", nombre: "Capital Social", clase: "Capital", tipo_saldo: "acreedor" },
  { codigo: "4101", nombre: "Ingresos por Servicios", clase: "Ingreso", tipo_saldo: "acreedor" },
  { codigo: "5101", nombre: "Gastos de Operación", clase: "Gasto", tipo_saldo: "deudor" },
  { codigo: "5102", nombre: "Sueldos y Salarios", clase: "Gasto", tipo_saldo: "deudor" },
  { codigo: "5103", nombre: "Servicios Básicos (Agua, Luz, Internet)", clase: "Gasto", tipo_saldo: "deudor" },
];

export const CATALOGO_COMERCIAL = [
  { codigo: "1101", nombre: "Efectivo y Equivalentes", clase: "Activo", tipo_saldo: "deudor" },
  { codigo: "1102", nombre: "Cuentas por Cobrar", clase: "Activo", tipo_saldo: "deudor" },
  { codigo: "1103", nombre: "Inventario de Mercadería", clase: "Activo", tipo_saldo: "deudor" },
  { codigo: "1104", nombre: "IVA Crédito Fiscal", clase: "Activo", tipo_saldo: "deudor" },
  { codigo: "1201", nombre: "Mobiliario y Equipo", clase: "Activo", tipo_saldo: "deudor" },
  { codigo: "2101", nombre: "Cuentas por Pagar Proveedores", clase: "Pasivo", tipo_saldo: "acreedor" },
  { codigo: "2102", nombre: "IVA Débito Fiscal", clase: "Pasivo", tipo_saldo: "acreedor" },
  { codigo: "3101", nombre: "Capital Social", clase: "Capital", tipo_saldo: "acreedor" },
  { codigo: "4101", nombre: "Ventas", clase: "Ingreso", tipo_saldo: "acreedor" },
  { codigo: "4102", nombre: "Devoluciones sobre Ventas", clase: "Ingreso", tipo_saldo: "deudor" },
  { codigo: "5101", nombre: "Costo de Ventas", clase: "Costo", tipo_saldo: "deudor" },
  { codigo: "5102", nombre: "Compras", clase: "Costo", tipo_saldo: "deudor" },
  { codigo: "5201", nombre: "Gastos de Operación", clase: "Gasto", tipo_saldo: "deudor" },
  { codigo: "5202", nombre: "Sueldos y Salarios", clase: "Gasto", tipo_saldo: "deudor" },
];

export function catalogoPorTipo(tipo) {
  return tipo === "comercial" ? CATALOGO_COMERCIAL : CATALOGO_SERVICIO;
}
