"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useEmpresa } from "@/lib/EmpresaContext";
import { exportarAExcel } from "@/lib/exportarExcel";

const TABLAS = {
  transacciones: "Partida",
  ventas: "Venta",
  compras: "Compra",
  devoluciones: "Devolución / nota de crédito",
  documentos_dte: "Documento DTE",
  cuentas: "Cuenta contable",
  clientes: "Cliente",
  proveedores: "Proveedor",
  productos: "Producto",
  empresas: "Empresa",
};
const ACCIONES = { crear: "Creó", editar: "Editó", eliminar: "Eliminó" };
const COLOR = { crear: "text-ledger", editar: "text-accentDark", eliminar: "text-rust" };
const inputCls = "border border-paperLine rounded-sm px-2 py-1.5 text-sm bg-white";

const fechaHora = (iso) =>
  new Date(iso).toLocaleString("es-SV", { timeZone: "America/El_Salvador", dateStyle: "short", timeStyle: "medium" });

export default function BitacoraPage() {
  const { empresaId } = useEmpresa();
  const hoy = new Date().toISOString().slice(0, 10);
  const hace30 = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const [desde, setDesde] = useState(hace30);
  const [hasta, setHasta] = useState(hoy);
  const [tabla, setTabla] = useState("");
  const [accion, setAccion] = useState("");
  const [usuario, setUsuario] = useState("");
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  async function cargar() {
    setCargando(true);
    setError(null);
    // Las fechas se interpretan en hora de El Salvador (UTC-6)
    let q = supabase
      .from("bitacora")
      .select("*")
      .eq("empresa_id", empresaId)
      .gte("created_at", `${desde}T00:00:00-06:00`)
      .lte("created_at", `${hasta}T23:59:59-06:00`)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (tabla) q = q.eq("tabla", tabla);
    if (accion) q = q.eq("accion", accion);
    const { data, error } = await q;
    if (error) {
      setError(/bitacora/i.test(error.message) ? "Falta ejecutar la migración 34 (bitácora) en Supabase." : error.message);
      setFilas([]);
    } else {
      setFilas(data || []);
    }
    setCargando(false);
  }
  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, desde, hasta, tabla, accion]);

  const visibles = useMemo(() => {
    const u = usuario.trim().toLowerCase();
    return u ? filas.filter((f) => String(f.email || "").toLowerCase().includes(u)) : filas;
  }, [filas, usuario]);

  function exportar() {
    exportarAExcel("bitacora", [{
      nombre: "Bitácora",
      filas: [
        ["Fecha y hora", "Usuario", "Acción", "Tipo", "Detalle", "Campos modificados"],
        ...visibles.map((f) => [fechaHora(f.created_at), f.email || "—", ACCIONES[f.accion], TABLAS[f.tabla] || f.tabla, f.resumen || "", f.cambios || ""]),
      ],
    }]);
  }

  return (
    <div>
      <h2 className="font-display text-lg font-semibold mb-1">Bitácora de acciones</h2>
      <p className="text-xs text-inkSoft mb-4">Registro automático de quién creó, editó o eliminó partidas, documentos, cuentas y catálogos. No se puede modificar.</p>

      <div className="bg-[#F7F4EA] border border-paperLine rounded-sm p-3 mb-4 flex flex-wrap items-end gap-3 text-sm">
        <label><span className="block text-xs text-inkSoft mb-1">Desde</span><input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={inputCls} /></label>
        <label><span className="block text-xs text-inkSoft mb-1">Hasta</span><input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={inputCls} /></label>
        <label><span className="block text-xs text-inkSoft mb-1">Tipo</span>
          <select value={tabla} onChange={(e) => setTabla(e.target.value)} className={inputCls}>
            <option value="">Todos</option>
            {Object.entries(TABLAS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </label>
        <label><span className="block text-xs text-inkSoft mb-1">Acción</span>
          <select value={accion} onChange={(e) => setAccion(e.target.value)} className={inputCls}>
            <option value="">Todas</option>
            {Object.entries(ACCIONES).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </label>
        <label><span className="block text-xs text-inkSoft mb-1">Usuario</span><input value={usuario} onChange={(e) => setUsuario(e.target.value)} placeholder="correo" className={inputCls} /></label>
        <button type="button" onClick={exportar} disabled={visibles.length === 0} className="text-xs text-accentDark hover:underline disabled:opacity-50">Exportar a Excel</button>
      </div>

      {error && <p className="text-sm text-rust mb-3">{error}</p>}
      <div className="overflow-x-auto bg-white border border-paperLine rounded-sm">
        <table className="w-full text-sm">
          <thead className="bg-brand text-onBrand text-xs">
            <tr>
              <th className="px-2 py-1 text-left font-normal">Fecha y hora</th>
              <th className="px-2 py-1 text-left font-normal">Usuario</th>
              <th className="px-2 py-1 text-left font-normal">Acción</th>
              <th className="px-2 py-1 text-left font-normal">Tipo</th>
              <th className="px-2 py-1 text-left font-normal">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {cargando && <tr><td colSpan={5} className="px-2 py-3 text-inkSoft">Cargando…</td></tr>}
            {!cargando && visibles.length === 0 && !error && <tr><td colSpan={5} className="px-2 py-3 text-inkSoft">Sin movimientos en este período.</td></tr>}
            {visibles.map((f) => (
              <tr key={f.id} className="border-t border-paperLine align-top">
                <td className="px-2 py-1 whitespace-nowrap font-num text-xs">{fechaHora(f.created_at)}</td>
                <td className="px-2 py-1 text-xs">{f.email || "—"}</td>
                <td className={"px-2 py-1 font-medium " + COLOR[f.accion]}>{ACCIONES[f.accion]}</td>
                <td className="px-2 py-1">{TABLAS[f.tabla] || f.tabla}</td>
                <td className="px-2 py-1 text-xs">{f.resumen || "—"}{f.cambios && <div className="text-inkSoft">Cambió: {f.cambios}</div>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filas.length >= 1000 && <p className="text-xs text-inkSoft mt-2">Se muestran los 1000 más recientes; acotá el rango de fechas para ver el resto.</p>}
    </div>
  );
}
