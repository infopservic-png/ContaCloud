"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function BalancePage() {
  const params = useParams();
  const empresaId = params.id;
  const [cargando, setCargando] = useState(true);
  const [filas, setFilas] = useState([]);

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  async function cargar() {
    setCargando(true);
    const { data: cuentas } = await supabase
      .from("cuentas")
      .select("*")
      .eq("empresa_id", empresaId)
      .order("codigo");

    const { data: movimientos } = await supabase
      .from("movimientos")
      .select("*, transacciones!inner(empresa_id)")
      .eq("transacciones.empresa_id", empresaId);

    const calculado = (cuentas || [])
      .map((cuenta) => {
        const movs = (movimientos || []).filter((m) => m.cuenta_id === cuenta.id);
        const totalDebe = movs.reduce((s, m) => s + Number(m.debe), 0);
        const totalHaber = movs.reduce((s, m) => s + Number(m.haber), 0);
        const neto =
          cuenta.tipo_saldo === "deudor"
            ? totalDebe - totalHaber
            : totalHaber - totalDebe;
        return {
          cuenta,
          totalDebe,
          totalHaber,
          saldoDeudor: cuenta.tipo_saldo === "deudor" && neto > 0 ? neto : 0,
          saldoAcreedor: cuenta.tipo_saldo === "acreedor" && neto > 0 ? neto : 0,
          tieneMovimiento: movs.length > 0,
        };
      })
      .filter((f) => f.tieneMovimiento);

    setFilas(calculado);
    setCargando(false);
  }

  if (cargando) return <p className="text-inkSoft">Cargando…</p>;

  if (filas.length === 0) {
    return (
      <p className="text-inkSoft text-sm">
        Todavía no hay movimientos para generar el balance de comprobación.
      </p>
    );
  }

  const sumaDeudor = filas.reduce((s, f) => s + f.saldoDeudor, 0);
  const sumaAcreedor = filas.reduce((s, f) => s + f.saldoAcreedor, 0);
  const cuadra = Math.abs(sumaDeudor - sumaAcreedor) < 0.005;

  return (
    <div className="space-y-4">
      <div className="bg-[#F7F4EA] border border-paperLine rounded-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-inkSoft border-b border-paperLine">
              <th className="px-4 py-3 font-medium">Código</th>
              <th className="px-4 py-3 font-medium">Cuenta</th>
              <th className="px-4 py-3 font-medium text-right">Saldo deudor</th>
              <th className="px-4 py-3 font-medium text-right">Saldo acreedor</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.cuenta.id} className="border-b border-paperLine">
                <td className="px-4 py-2 font-num tabular">{f.cuenta.codigo}</td>
                <td className="px-4 py-2">{f.cuenta.nombre}</td>
                <td className="px-4 py-2 text-right font-num tabular">
                  {f.saldoDeudor > 0 ? f.saldoDeudor.toFixed(2) : ""}
                </td>
                <td className="px-4 py-2 text-right font-num tabular">
                  {f.saldoAcreedor > 0 ? f.saldoAcreedor.toFixed(2) : ""}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-ink font-semibold">
              <td className="px-4 py-3" colSpan={2}>
                Totales
              </td>
              <td className="px-4 py-3 text-right font-num tabular">
                {sumaDeudor.toFixed(2)}
              </td>
              <td className="px-4 py-3 text-right font-num tabular">
                {sumaAcreedor.toFixed(2)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div
        className={`text-sm px-4 py-2 rounded-sm inline-block ${
          cuadra ? "bg-ledger/20 text-ledgerDark" : "bg-rust/10 text-rust"
        }`}
      >
        {cuadra
          ? "El balance cuadra ✓"
          : `Diferencia de ${Math.abs(sumaDeudor - sumaAcreedor).toFixed(2)} — revisa las partidas del Diario.`}
      </div>
    </div>
  );
}
