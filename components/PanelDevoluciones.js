"use client";

import { useEffect, useState } from "react";
import { useEmpresa } from "@/lib/EmpresaContext";
import { formatoMoneda } from "@/lib/contabilidad";
import { obtenerDevoluciones, eliminarDevolucion } from "@/lib/devoluciones";
import FormDevolucion from "@/components/FormDevolucion";

// Devoluciones sobre ventas y compras: formulario manual + historial. Afecta kardex, partida y CxC/CxP.
export default function PanelDevoluciones({ onCambio }) {
  const { empresaId } = useEmpresa();
  const [abierto, setAbierto] = useState(false);
  const [lista, setLista] = useState([]);
  const [error, setError] = useState(null);

  async function cargar() {
    try {
      setLista(await obtenerDevoluciones(empresaId));
    } catch (e) {
      setError(/devoluciones/i.test(e.message) ? "Falta ejecutar la migración 33 (devoluciones) en Supabase." : e.message);
    }
  }
  useEffect(() => {
    if (abierto) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, empresaId]);

  async function eliminar(d) {
    if (!confirm("¿Eliminar esta devolución? Se revierte su partida, el kardex y lo rebajado en cuentas por cobrar/pagar.")) return;
    const r = await eliminarDevolucion(d);
    if (r.error) return setError(r.error);
    setError(null);
    await cargar();
    onCambio?.();
  }

  return (
    <div className="no-print mb-4">
      <button type="button" onClick={() => setAbierto(!abierto)} className="text-sm text-accentDark hover:underline">
        {abierto ? "▾ Ocultar devoluciones" : "▸ Devoluciones sobre ventas o compras"}
      </button>
      {abierto && (
        <div className="mt-3 space-y-4">
          <p className="text-xs text-inkSoft">
            Las devoluciones de ventas también pueden emitirse como nota de crédito electrónica desde Facturación; las de compras se registran aquí
            (o se importan desde el JSON de la nota de crédito del proveedor en Importar).
          </p>
          <FormDevolucion onHecho={() => { cargar(); onCambio?.(); }} />
          {error && <p className="text-sm text-rust">{error}</p>}
          <div className="overflow-x-auto bg-white border border-paperLine rounded-sm">
            <table className="w-full text-sm">
              <thead className="bg-brand text-onBrand text-xs">
                <tr>
                  <th className="px-2 py-1 text-left font-normal">Fecha</th>
                  <th className="px-2 py-1 text-left font-normal">Tipo</th>
                  <th className="px-2 py-1 text-left font-normal">Documento</th>
                  <th className="px-2 py-1 text-left font-normal">Cliente / Proveedor</th>
                  <th className="px-2 py-1 text-right font-normal">Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lista.length === 0 && <tr><td colSpan={6} className="px-2 py-3 text-inkSoft">Sin devoluciones registradas.</td></tr>}
                {lista.map((d) => (
                  <tr key={d.id} className="border-t border-paperLine">
                    <td className="px-2 py-1">{d.fecha}</td>
                    <td className="px-2 py-1">{d.tipo === "venta" ? "Venta (cliente)" : "Compra (proveedor)"}</td>
                    <td className="px-2 py-1 text-xs">{d.numero_documento || "—"}</td>
                    <td className="px-2 py-1">{d.cliente?.nombre || d.proveedor?.nombre || "—"}</td>
                    <td className="px-2 py-1 text-right font-num">{formatoMoneda(d.total)}</td>
                    <td className="px-2 py-1 text-right"><button type="button" onClick={() => eliminar(d)} className="text-xs text-rust hover:underline">Eliminar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
