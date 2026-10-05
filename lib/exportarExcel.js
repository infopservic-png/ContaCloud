import * as XLSX from "xlsx";

// hojas: [{ nombre: "Balance", filas: [ [c1,c2,...], [c1,c2,...] ] }, ...]
// Cada "fila" es un arreglo de celdas (texto o número) en el orden en que
// deben aparecer las columnas. Genera y descarga un archivo .xlsx.
export function exportarAExcel(nombreArchivo, hojas) {
  const wb = XLSX.utils.book_new();
  for (const hoja of hojas) {
    const ws = XLSX.utils.aoa_to_sheet(hoja.filas);
    XLSX.utils.book_append_sheet(wb, ws, hoja.nombre.slice(0, 31));
  }
  XLSX.writeFile(wb, `${nombreArchivo}.xlsx`);
}
